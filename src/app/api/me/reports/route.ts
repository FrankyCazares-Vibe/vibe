import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { requireNotRestricted } from "@/lib/moderation/access";
import { alertAdminsOfReport } from "@/lib/moderation/alerts";
import {
  isReportReasonCode,
  isReportTargetType,
  type ReportTargetType,
} from "@/lib/moderation/reports";
import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * What a report body may carry. snake_case is canonical: all five deployed
 * clients post `{ target_type, target_id, reason_code, reason }` today
 * (campus-home, CampusMobile, PostViewerMobile, ProfileMobile,
 * _safetyActions.js), so nothing has to be renamed for this route.
 *
 * `reason_code` is the picker's code; `reason` is the student's own words.
 * The camelCase keys are read as aliases only, so a newer client may use
 * them — none is ever required.
 */
type Body = {
  target_type?: unknown;
  target_id?: unknown;
  reason_code?: unknown;
  reason?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  reasonCode?: unknown;
  details?: unknown;
};

/**
 * Everything a student can report, and every reason they can pick — from
 * `src/lib/moderation/reports.ts`, not a copy of it. That module exists so the
 * reason pickers, this route, the admin queue and the alert email all read one
 * list: a picker offering "sexual_content" against a route that only knows
 * "sexual" files a report the student thinks went through and nobody can see.
 *
 * Comment, org and event are only accepted by the database once the moderation
 * migration widens `reports_target_type_check` (it allows user/post/message/
 * channel today), so one of those before the migration lands is answered as
 * "not yet" at the insert below rather than as a server fault. No deployed
 * client sends them.
 */
type TargetType = ReportTargetType;

const MAX_REASON = 1000;
const LOG = "[reports.POST]";

/** The columns this route adds to a report once the moderation migration is applied. */
const NEW_REPORT_COLUMNS = ["status", "target_owner_id", "target_snapshot"] as const;

const str = (...vals: unknown[]): string => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};

const asId = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

type Target = {
  /** The person answerable for the reported thing, when there is one. */
  ownerId: string | null;
  /** Evidence kept at report time, so it survives the author deleting it. */
  snapshot: Record<string, unknown>;
};

type Lookup =
  | { ok: true; target: Target }
  | { ok: false; reason: "not_found" | "error" };

/**
 * Read the reported thing THROUGH THE REPORTER'S OWN CLIENT, so the row's RLS
 * answers "may this student see it": a deleted row, someone else's draft, a
 * hidden club's post, a chat they aren't in — all come back empty and the
 * report is refused.
 *
 * Deliberately NOT the service client, and deliberately no block or mute
 * check. Blocks hide content in BOTH directions, so judging visibility by the
 * feed's rules would mean a student who blocked a harasser — or who a
 * harasser blocked — could no longer report them. That is exactly backwards,
 * so this asks only about deletion, drafts, hidden clubs and chat membership.
 */
async function readTarget(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  type: TargetType,
  id: string,
  viewerId: string,
): Promise<Lookup> {
  const one = async (
    table: string,
    columns: string,
  ): Promise<Record<string, unknown> | null | "error"> => {
    const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
    if (error) {
      console.error(`${LOG} ${table} read`, error);
      return "error";
    }
    return (data as Record<string, unknown> | null) ?? null;
  };

  if (type === "post") {
    // The post rules already live here (draft, hidden club, author exemption);
    // asking anywhere else would let the two drift apart.
    const access = await postAccessForCaller(supabase, id, viewerId, `${LOG} post check`);
    if (!access.ok) return { ok: false, reason: access.reason };
    const row = await one("posts", "id,user_id,content,media_url,media_thumbnail_url,created_at,org_id");
    if (row === "error") return { ok: false, reason: "error" };
    if (!row) return { ok: false, reason: "not_found" };
    return { ok: true, target: { ownerId: asId(row.user_id), snapshot: row } };
  }

  const spec: Record<Exclude<TargetType, "post">, { table: string; columns: string; owner: string }> = {
    user: { table: "users", columns: "id,handle,name,bio,tagline", owner: "id" },
    comment: { table: "post_comments", columns: "id,user_id,post_id,content,created_at", owner: "user_id" },
    message: {
      table: "messages",
      columns: "id,user_id,channel_id,content,media_url,created_at",
      owner: "user_id",
    },
    channel: { table: "channels", columns: "id,type,name,org_id,created_at", owner: "" },
    org: { table: "orgs", columns: "id,handle,name,description,owner_id", owner: "owner_id" },
    event: {
      table: "events",
      columns: "id,title,description,creator_id,org_id,starts_at",
      owner: "creator_id",
    },
  };
  const { table, columns, owner } = spec[type];
  const row = await one(table, columns);
  if (row === "error") return { ok: false, reason: "error" };
  if (!row) return { ok: false, reason: "not_found" };
  return { ok: true, target: { ownerId: owner ? asId(row[owner]) : null, snapshot: row } };
}

/**
 * Add the owner's handle and name to the snapshot, so a moderator still knows
 * whose words these were after the account is deleted. Best effort: a report
 * is never lost over a missing handle, and `target_owner_id` is stored either
 * way.
 */
async function withOwnerHandle(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  type: TargetType,
  target: Target,
): Promise<Record<string, unknown>> {
  // A reported PERSON already carries their own handle and name; a reported
  // club carries the club's handle, which is not the owner's.
  if (type === "user" || !target.ownerId) return target.snapshot;
  const { data } = await supabase
    .from("users")
    .select("handle,name")
    .eq("id", target.ownerId)
    .maybeSingle();
  if (!data) return target.snapshot;
  const owner = data as { handle?: unknown; name?: unknown };
  return { ...target.snapshot, owner_handle: owner.handle ?? null, owner_name: owner.name ?? null };
}

/**
 * Has this student already got an open report on this exact thing? Reporting
 * twice is a student pressing the button again, not an error — they get the
 * same "thanks" and the queue keeps one row.
 *
 * The uniqueness in the database is a PARTIAL index (only where the report is
 * still open), which PostgREST can't express as an upsert conflict target, so
 * it's a look-then-insert with the 23505 still handled below for the race.
 *
 * Before the moderation migration there is no `status` column, and no way to
 * tell an open report from one a moderator settled months ago. This answers
 * "no" in that window and files the report: an old report on the same thing
 * must never swallow a new one, and without the partial index there is nothing
 * for a second row to violate.
 */
async function alreadyOpen(
  service: ReturnType<typeof createSupabaseServiceClient>,
  reporterId: string,
  targetType: string,
  targetId: string,
): Promise<boolean> {
  const res = await service
    .from("reports")
    .select("id")
    .eq("reporter_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "open")
    .limit(1);

  if (res.error && isMissingColumnError(res.error, NEW_REPORT_COLUMNS)) return false;
  if (res.error) {
    // Don't refuse the report over a failed duplicate check — insert and let
    // the partial unique index settle it.
    console.error(`${LOG} duplicate check`, res.error);
    return false;
  }
  return (res.data ?? []).length > 0;
}

/**
 * How many open reports this target now has, for the admin alert's "3 reports
 * on this" line. A count that can't be read answers 1 — this report — rather
 * than 0, which would read as "nothing to look at".
 *
 * Before the migration there is no `status` column and no way to resolve a
 * report either, so every row on the target is an open one and counting them
 * all is the right number, not a fallback that overstates.
 */
async function openReportCount(
  service: ReturnType<typeof createSupabaseServiceClient>,
  targetType: string,
  targetId: string,
): Promise<number> {
  const base = () =>
    service
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

  let res = await base().eq("status", "open");
  if (res.error && isMissingColumnError(res.error, NEW_REPORT_COLUMNS)) {
    res = await base();
  }
  if (res.error) {
    console.error(`${LOG} open count`, res.error);
    return 1;
  }
  return res.count ?? 1;
}

const ok = () => NextResponse.json({ ok: true });
const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

/**
 * File a report.
 *
 * The row is written with the SERVICE role: students no longer insert into
 * `reports` themselves, so the rate limit, the restriction gate and the
 * checks below are the only way in, and a report carries evidence the student
 * could never have supplied (who owns the reported thing, what it said at the
 * time).
 *
 * Order — auth, validate, limit, gate, look the target up, snapshot, insert,
 * alert. Validation moves above the limiter (a malformed body shouldn't spend
 * a student's ten reports an hour), and the limiter keeps its place above the
 * gate. It has to stay above the target lookup either way: an unlimited "does
 * this id exist and can I see it?" is an enumeration oracle, the same
 * reasoning written out in the school-email request route.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON");
  }

  const targetType = str(body.target_type, body.targetType);
  const targetId = str(body.target_id, body.targetId);
  const reasonCode = str(body.reason_code, body.reasonCode);
  const reason = str(body.reason, body.details).slice(0, MAX_REASON);

  if (!isReportTargetType(targetType)) return bad("Invalid target_type");
  // A non-uuid used to reach the database and come back a 500. It is a bad
  // request, and it is answered as one.
  if (!isUuid(targetId)) return bad("Invalid target_id");
  if (!isReportReasonCode(reasonCode)) return bad("Invalid reason_code");
  if (targetType === "user" && targetId === user.id) {
    return bad("You can't report yourself");
  }

  // The limiter keeps the position it has always had — above the gate — and
  // so still covers every read below it, including the gate's own.
  const rl = await rateLimit(`report:${user.id}`, { limit: 10, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Unverified students CAN report — that is the point of a report. Only a
  // restriction (or missing Terms) stops one.
  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  const found = await readTarget(supabase, targetType, targetId, user.id);
  if (!found.ok) {
    return found.reason === "error"
      ? NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 })
      : NextResponse.json({ ok: false, error: "That's not there anymore" }, { status: 404 });
  }
  if (found.target.ownerId === user.id) {
    return bad("You can't report something of your own");
  }

  const service = createSupabaseServiceClient();
  if (await alreadyOpen(service, user.id, targetType, targetId)) return ok();

  const snapshot = await withOwnerHandle(supabase, targetType, found.target);
  const row = {
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason_code: reasonCode,
    reason,
  };

  // Code ships before the migration, so the evidence columns are written only
  // when they exist. Without them the report is still filed — a report is
  // never lost to deploy order.
  let insert = await service
    .from("reports")
    .insert({ ...row, target_owner_id: found.target.ownerId, target_snapshot: snapshot })
    .select("id")
    .single();
  if (insert.error && isMissingColumnError(insert.error, NEW_REPORT_COLUMNS)) {
    // Expected for the whole code-before-migration window, so it is a warning:
    // at error level every single report would look like a failing route, and
    // that is the signal nobody reads when something real breaks.
    console.warn(`${LOG} moderation migration not applied yet; report filed without evidence`);
    insert = await service.from("reports").insert(row).select("id").single();
  }
  if (insert.error) {
    // The partial unique index caught a second report this student filed at
    // the same moment. Same answer as the check above: thanks, it's logged.
    if (insert.error.code === "23505") return ok();
    // The `target_type` CHECK is only widened to comments, clubs and events by
    // the same migration. Until it lands, a report on one of those is a thing
    // Vibe can't take yet — said plainly, not as a server fault.
    if (insert.error.code === "23514") {
      return NextResponse.json(
        { ok: false, error: "You can't report that yet. Try again after the next update." },
        { status: 400 },
      );
    }
    console.error(LOG, insert.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Every new report emails the platform admins. The helper swallows its own
  // failures, and this catch covers the count read as well: the report is
  // already saved and nothing here may take it back.
  const reportId = asId((insert.data as { id?: unknown } | null)?.id);
  if (reportId) {
    try {
      await alertAdminsOfReport({
        reportId,
        targetType,
        targetId,
        reasonCode,
        openCount: await openReportCount(service, targetType, targetId),
      });
    } catch (e) {
      console.error(`${LOG} admin alert`, e);
    }
  }

  return ok();
}
