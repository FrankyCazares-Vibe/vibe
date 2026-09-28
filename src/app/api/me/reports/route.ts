import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { getActiveRestriction, requireNotRestricted } from "@/lib/moderation/access";
import { alertAdminsOfReport } from "@/lib/moderation/alerts";
import {
  blockSuspects,
  crossBlockReportVerdict,
  type PostFacts,
  type ReportTargetFacts,
} from "@/lib/moderation/report-visibility";
import {
  isReportReasonCode,
  isReportTargetType,
  type ReportTargetType,
} from "@/lib/moderation/reports";
import { orgContentAccessAsService, postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadPairBlock } from "@/lib/safety/pair-block";
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

/** What a report keeps as evidence of a post or a comment (the snapshot). */
const POST_SNAPSHOT_COLUMNS = "id,user_id,content,media_url,media_thumbnail_url,created_at,org_id";
const COMMENT_SNAPSHOT_COLUMNS = "id,user_id,post_id,content,created_at";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const pick = (row: Record<string, unknown>, columns: string): Record<string, unknown> =>
  Object.fromEntries(columns.split(",").map((c) => [c, row[c] ?? null]));
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * The reporter's read of a post or a comment came back empty. Was a block why?
 * (See readTarget.) Service-role reads, in this order, stopping as soon as the
 * answer is known: the row (and, for a comment, its post); the reporter's
 * block with the people blockSuspects names, read with the REPORTER's client
 * (blocks_select_either shows them exactly their own pairs); only then the
 * authors' restrictions and the club. crossBlockReportVerdict decides. Any
 * failed read is "error" (a 500 that tells nothing); no service role is
 * "not_found", the empty read's own answer.
 */
async function crossBlockFallback(
  supabase: ServerClient,
  type: "post" | "comment",
  id: string,
  viewerId: string,
): Promise<Lookup> {
  const notFound: Lookup = { ok: false, reason: "not_found" };
  const failed: Lookup = { ok: false, reason: "error" };
  let service: ServiceClient;
  try {
    service = createSupabaseServiceClient();
  } catch (e) {
    console.error(`${LOG} cross-block: no service role`, e);
    return notFound;
  }
  const read = async (table: string, columns: string, rowId: string) => {
    const { data, error } = await service.from(table).select(columns).eq("id", rowId).maybeSingle();
    if (error) {
      console.error(`${LOG} cross-block ${table} read`, error);
      return "error" as const;
    }
    return (data as Record<string, unknown> | null) ?? null;
  };

  let commentRow: Record<string, unknown> | null = null;
  let postRow: Record<string, unknown> | null;
  if (type === "comment") {
    const c = await read("post_comments", `${COMMENT_SNAPSHOT_COLUMNS},removed_at`, id);
    if (c === "error") return failed;
    if (!c || !asId(c.user_id)) return notFound;
    commentRow = c;
    const postId = asId(c.post_id);
    const p = postId ? await read("posts", "id,user_id,org_id,status,removed_at", postId) : null;
    if (p === "error") return failed;
    postRow = p;
  } else {
    const p = await read("posts", `${POST_SNAPSHOT_COLUMNS},status,removed_at`, id);
    if (p === "error") return failed;
    if (!p) return notFound;
    postRow = p;
  }
  if (postRow && !asId(postRow.user_id)) postRow = null;
  if (type === "post" && !postRow) return notFound;

  // Who could the block be with? Asked before any other read.
  const skeletonPost = (row: Record<string, unknown>): PostFacts => ({
    userId: asId(row.user_id) ?? "",
    status: textOrNull(row.status),
    removedAt: textOrNull(row.removed_at),
    authorVisible: false,
    clubAllowed: false,
  });
  const skeleton: ReportTargetFacts =
    type === "post"
      ? { kind: "post", post: skeletonPost(postRow!) }
      : {
          kind: "comment",
          comment: {
            userId: asId(commentRow!.user_id)!,
            removedAt: textOrNull(commentRow!.removed_at),
            authorVisible: false,
            post: postRow ? skeletonPost(postRow) : null,
          },
        };
  const blocked = new Set<string>();
  for (const suspect of blockSuspects(viewerId, skeleton)) {
    const pair = await loadPairBlock(supabase, viewerId, suspect);
    if (!pair.ok) {
      console.error(`${LOG} cross-block pair read`, pair.error);
      return failed;
    }
    if (pair.blocked) blocked.add(suspect);
  }
  if (blocked.size === 0) return notFound;

  // The rest of the rules, as the reporter's own read would have applied them.
  const visibleById = new Map<string, boolean>();
  const authorVisible = async (userId: string): Promise<boolean | "error"> => {
    const known = visibleById.get(userId);
    if (known !== undefined) return known;
    const r = await getActiveRestriction(userId);
    if (!r.ok) return "error";
    visibleById.set(userId, r.restriction === null);
    return r.restriction === null;
  };
  const postFacts = async (row: Record<string, unknown>): Promise<PostFacts | "error"> => {
    const base = skeletonPost(row);
    const visible = await authorVisible(base.userId);
    if (visible === "error") return "error";
    const orgId = asId(row.org_id);
    const clubAllowed = orgId
      ? (await orgContentAccessAsService(orgId, `${LOG} cross-block club`)).allowed
      : true;
    return { ...base, authorVisible: visible, clubAllowed };
  };

  let facts: ReportTargetFacts;
  if (type === "post") {
    const p = await postFacts(postRow!);
    if (p === "error") return failed;
    facts = { kind: "post", post: p };
  } else {
    const commenter = asId(commentRow!.user_id)!;
    const visible = await authorVisible(commenter);
    if (visible === "error") return failed;
    let p: PostFacts | null = null;
    if (postRow) {
      const r = await postFacts(postRow);
      if (r === "error") return failed;
      p = r;
    }
    facts = {
      kind: "comment",
      comment: {
        userId: commenter,
        removedAt: textOrNull(commentRow!.removed_at),
        authorVisible: visible,
        post: p,
      },
    };
  }
  if (crossBlockReportVerdict(viewerId, facts, blocked) !== "allow") return notFound;

  // The same evidence the reporter's own read would have kept.
  const row = type === "post" ? postRow! : commentRow!;
  const columns = type === "post" ? POST_SNAPSHOT_COLUMNS : COMMENT_SNAPSHOT_COLUMNS;
  return { ok: true, target: { ownerId: asId(row.user_id), snapshot: pick(row, columns) } };
}

/**
 * A reported person's bio, for the evidence snapshot only, read with the
 * service role (A1's migration takes `bio` off the data API; the reporter's
 * client would get 42501 and fail the whole report). Best effort: a report is
 * never lost over a bio, so any failure is null, logged.
 */
async function userBioAsService(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("users")
      .select("bio")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG} user bio read`, error);
      return null;
    }
    return textOrNull((data as { bio?: unknown } | null)?.bio);
  } catch (e) {
    console.error(`${LOG} user bio read`, e);
    return null;
  }
}

/**
 * Read the reported thing THROUGH THE REPORTER'S OWN CLIENT, so the row's RLS
 * answers "may this student see it": a deleted row, someone else's draft, a
 * hidden club's post, a chat they aren't in — all come back empty and the
 * report is refused.
 *
 * No block or mute check of its own. Blocks hide content in BOTH directions,
 * so judging visibility by the feed's rules would mean a student who blocked
 * a harasser — or who a harasser blocked — could no longer report them. That
 * is exactly backwards, so this asks only about deletion, drafts, hidden clubs
 * and chat membership.
 *
 * ACROSS A BLOCK (S67 security wave 2, A2). Since
 * 20260928120000_blocks_in_rls.sql the posts and comments rules themselves
 * refuse a block pair, so for a post or a comment the reporter's read can come
 * back empty BECAUSE of a block. When it does, crossBlockFallback re-reads the
 * row with the service role and lets the report through only when a block
 * with the reporter is a possible reason (loadPairBlock, the reporter's own
 * client) and the thing passes every other rule the read applied
 * (src/lib/moderation/report-visibility.ts). Anything else keeps the empty
 * read's answer. Users are unaffected: users_select_authenticated has no
 * block clause.
 *
 * A reported person's `bio` is read with the service role (A1's migration
 * takes it off the data API); the rest of the person still comes through the
 * reporter's client, which is what decides they can be reported.
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
    if (!access.ok) {
      return access.reason === "not_found"
        ? crossBlockFallback(supabase, "post", id, viewerId)
        : { ok: false, reason: access.reason };
    }
    const row = await one("posts", POST_SNAPSHOT_COLUMNS);
    if (row === "error") return { ok: false, reason: "error" };
    if (!row) return crossBlockFallback(supabase, "post", id, viewerId);
    return { ok: true, target: { ownerId: asId(row.user_id), snapshot: row } };
  }

  const spec: Record<Exclude<TargetType, "post">, { table: string; columns: string; owner: string }> = {
    user: { table: "users", columns: "id,handle,name,tagline", owner: "id" },
    comment: { table: "post_comments", columns: COMMENT_SNAPSHOT_COLUMNS, owner: "user_id" },
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
  if (!row) {
    return type === "comment"
      ? crossBlockFallback(supabase, "comment", id, viewerId)
      : { ok: false, reason: "not_found" };
  }
  const snapshot = type === "user" ? { ...row, bio: await userBioAsService(id) } : row;
  return { ok: true, target: { ownerId: owner ? asId(row[owner]) : null, snapshot } };
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
