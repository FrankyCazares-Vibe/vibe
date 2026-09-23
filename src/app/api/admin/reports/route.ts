import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADMIN_READ_LIMIT,
  adminFail,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { type ActiveRestriction, getActiveRestriction } from "@/lib/moderation/access";
import {
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
} from "@/lib/orgs/following";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The statuses `reports.status` can hold, and the tabs the screen has. */
const STATUSES = new Set(["open", "actioned", "dismissed"]);

/**
 * Small pages on purpose. Every group costs a live-state read and a
 * restriction read, so 25 keeps the fan-out honest.
 */
const PAGE_MAX = 25;

/** How many reports one group carries. Past this the count still tells the truth. */
const REPORTS_PER_GROUP = 20;

/** Ceiling on the sibling-report read, so one hot target can't drag the page. */
const SIBLING_ROW_CAP = 600;

type ReportRow = {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason_code: string;
  reason: string | null;
  created_at: string;
  status: string | null;
  target_owner_id: string | null;
  target_snapshot: unknown;
};

/**
 * GET /api/admin/reports?status=open|actioned|dismissed&cursor=&limit=
 *
 * The moderation queue, grouped by the thing that was reported (plan §Admin
 * API). Five people reporting one post is one decision, not five.
 *
 * THIS READ BYPASSES RLS. It runs on the service role, so nothing filters for
 * it: removed content, hidden clubs and restricted students all come back
 * unless this route asks. That is deliberate — a moderator has to see what a
 * student reported even after it was removed — and it is why `live` is
 * computed here by hand instead of trusted to a policy.
 *
 * WHAT A REPORTER GIVES UP: their handle, and nothing else. No id, no name, no
 * email, on any path through this route. Everything else about them stays out
 * of the answer.
 *
 * PAGING is a keyset over reports (`created_at desc, id desc`), not over
 * targets, so a target whose reports straddle a page boundary appears in both
 * pages with the same `openCount` and the same list. The screen keys groups by
 * `${type}:${id}` and the second copy collapses into the first.
 *
 * RESPONSES
 *   200 {ok, groups:[{target:{type,id,snapshot,
 *        live:{exists,removed,hidden,hiddenKnown}},
 *        owner:{id,handle,name,restriction,restrictionKnown}|null,
 *        reports:[{id,reason,details,reporterHandle,createdAt}], openCount}],
 *        next_cursor}
 *   400 invalid_cursor · 400 invalid_status · 401 · 403 · 429 · 500 request_failed
 */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open").trim();
  if (!STATUSES.has(status)) {
    return adminFail(400, "invalid_status", "Unknown status");
  }
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return adminFail(400, "invalid_cursor", "Invalid cursor");
  const limit = parseLimit(url.searchParams.get("limit"));

  const rl = await rateLimit(`admin-reports:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();

  let query = service
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, reason_code, reason, created_at, status, target_owner_id, target_snapshot",
    )
    .eq("status", status);
  if (decoded.cursor) {
    query = query.or(followKeysetOrFilter("created_at", decoded.cursor));
  }
  const { data: pageData, error: pageErr } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (pageErr) {
    console.error("[admin/reports page]", pageErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }

  const rows = (pageData ?? []) as ReportRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor =
    rows.length > limit && last ? encodeFollowCursor(last.created_at, last.id) : null;

  // The distinct targets on this page, in the order their newest report came.
  const targetKeys: string[] = [];
  const targetsByKey = new Map<string, { type: string; id: string }>();
  for (const r of page) {
    const key = `${r.target_type}:${r.target_id}`;
    if (!targetsByKey.has(key)) {
      targetsByKey.set(key, { type: r.target_type, id: r.target_id });
      targetKeys.push(key);
    }
  }
  const targetIds = targetKeys.map((k) => targetsByKey.get(k)!.id);

  // ONE read covers both jobs: the rest of each group's reports (the page may
  // have cut through a target) and the open count, which is counted across
  // every status so the "3 open" badge is right on the actioned tab too.
  // Filtered on `target_id` alone because a uuid does not repeat across types.
  // The cap is a ceiling on one pathological target, not on the page: past it
  // a count can be short, never long, and the page's own reports are merged
  // back in below regardless.
  const { data: siblingData, error: siblingErr } = targetIds.length
    ? await service
        .from("reports")
        .select(
          "id, reporter_id, target_type, target_id, reason_code, reason, created_at, status, target_owner_id, target_snapshot",
        )
        .in("target_id", targetIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SIBLING_ROW_CAP)
    : { data: [] as ReportRow[], error: null };
  if (siblingErr) {
    console.error("[admin/reports siblings]", siblingErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  const siblings = (siblingData ?? []) as ReportRow[];

  return buildAnswer(service, { status, page, siblings, targetKeys, targetsByKey, next_cursor });
}

function parseLimit(raw: string | null): number {
  const n = raw == null || raw.trim() === "" ? NaN : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return PAGE_MAX;
  return Math.min(n, PAGE_MAX);
}

/** What the queue says about the reported thing as it stands right now. */
type Live = { exists: boolean; removed: boolean; hidden: boolean };

type BuildArgs = {
  status: string;
  page: ReportRow[];
  siblings: ReportRow[];
  targetKeys: string[];
  targetsByKey: Map<string, { type: string; id: string }>;
  next_cursor: string | null;
};

/** Assemble the grouped answer. Split out only to keep the handler readable. */
async function buildAnswer(service: SupabaseClient, args: BuildArgs) {
  const { status, page, siblings, targetKeys, targetsByKey, next_cursor } = args;

  // `siblings` is meant to be a superset of `page`; merging anyway means a
  // truncated sibling read can never drop a report the page already promised.
  const all = new Map<string, ReportRow>();
  for (const r of siblings) all.set(r.id, r);
  for (const r of page) if (!all.has(r.id)) all.set(r.id, r);

  const grouped = new Map<string, ReportRow[]>();
  const openCounts = new Map<string, number>();
  for (const r of all.values()) {
    const key = `${r.target_type}:${r.target_id}`;
    if (!targetsByKey.has(key)) continue;
    const rowStatus = r.status ?? "open";
    if (rowStatus === "open") openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
    if (rowStatus !== status) continue;
    const list = grouped.get(key);
    if (list) list.push(r);
    else grouped.set(key, [r]);
  }
  for (const list of grouped.values()) list.sort(newestFirst);

  const targets = targetKeys.map((k) => targetsByKey.get(k)!);
  const live = await loadLive(service, targets);

  // The owner is the id captured when the report was filed; a report filed
  // before `target_owner_id` existed falls back to whoever owns the live row.
  const ownerByKey = new Map<string, string>();
  for (const key of targetKeys) {
    const rows = grouped.get(key) ?? [];
    const ownerId =
      rows.find((r) => r.target_owner_id)?.target_owner_id ?? live.get(key)?.ownerId ?? null;
    if (ownerId) ownerByKey.set(key, ownerId);
  }

  const ownerIds = [...new Set(ownerByKey.values())];
  const peopleIds = [...new Set([...ownerIds, ...collectReporterIds(grouped)])];
  const [people, restrictions] = await Promise.all([
    loadPeople(service, peopleIds),
    loadRestrictions(ownerIds),
  ]);

  const groups = targetKeys.map((key) => {
    const target = targetsByKey.get(key)!;
    const rows = (grouped.get(key) ?? []).slice(0, REPORTS_PER_GROUP);
    const ownerId = ownerByKey.get(key) ?? null;
    const lookup = ownerId ? restrictions.get(ownerId) : undefined;
    const restriction = lookup?.restriction ?? null;
    const found = live.get(key);
    const liveState: Live = found
      ? found.live
      : { exists: false, removed: false, hidden: false };
    return {
      target: {
        type: target.type,
        id: target.id,
        // The text and media as they were when the report was filed, so a
        // deleted or edited row still has something to judge.
        snapshot: rows.find((r) => r.target_snapshot)?.target_snapshot ?? null,
        // A reported student is "hidden" when a restriction is in force on
        // them; every other type answers from its own row.
        //
        // `hiddenKnown` travels WITH `hidden`, in the same object, because a
        // badge drawn from `target.live` alone must not be able to miss it: the
        // restriction read can fail, and a confident "visible" derived from
        // "we could not tell" is the one thing this screen must never say.
        // Every other type reads its own row, so there the answer is known.
        live:
          target.type === "user"
            ? { ...liveState, hidden: restriction !== null, hiddenKnown: lookup?.known ?? false }
            : { ...liveState, hiddenKnown: true },
      },
      owner: ownerId
        ? {
            id: ownerId,
            handle: people.get(ownerId)?.handle ?? null,
            name: people.get(ownerId)?.name ?? null,
            restriction,
            // False when the restriction read itself failed — "we don't know"
            // rather than a confident "not restricted".
            restrictionKnown: lookup?.known ?? false,
          }
        : null,
      reports: rows.map((r) => ({
        id: r.id,
        // `reason` is the picker code, `details` the student's own words —
        // the columns are `reason_code` and `reason`, which read backwards.
        reason: r.reason_code,
        details: r.reason ?? "",
        // A handle and nothing else. Null once the reporter deletes their account.
        reporterHandle: r.reporter_id ? people.get(r.reporter_id)?.handle ?? null : null,
        createdAt: r.created_at,
      })),
      openCount: openCounts.get(key) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, groups, next_cursor });
}

function newestFirst(a: ReportRow, b: ReportRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function collectReporterIds(grouped: Map<string, ReportRow[]>): string[] {
  const ids: string[] = [];
  for (const rows of grouped.values()) {
    for (const r of rows.slice(0, REPORTS_PER_GROUP)) if (r.reporter_id) ids.push(r.reporter_id);
  }
  return ids;
}

async function loadPeople(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, { handle: string | null; name: string | null }>> {
  const out = new Map<string, { handle: string | null; name: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await service.from("users").select("id, handle, name").in("id", ids);
  if (error) {
    console.error("[admin/reports people]", error.message);
    return out;
  }
  for (const row of (data ?? []) as Array<{ id: string; handle: string | null; name: string | null }>) {
    out.set(row.id, { handle: row.handle, name: row.name });
  }
  return out;
}

/**
 * One restriction read per owner on the page (at most {@link PAGE_MAX}), so
 * "in force" is decided in exactly one place — batch B's helper — instead of
 * being re-derived here. A bulk version of that helper would make this one
 * query; it is not worth a second copy of the rule to save it.
 *
 * A READ THAT FAILED IS NOT "NOT RESTRICTED". The helper answers
 * `{ok:false}` when the table is there but the read broke, and a moderation
 * screen that turned that into "no restriction" would be lying at the exact
 * moment it matters. `known: false` travels with the group so the screen can
 * say it doesn't know.
 */
async function loadRestrictions(
  ownerIds: string[],
): Promise<Map<string, { restriction: ActiveRestriction | null; known: boolean }>> {
  const pairs = await Promise.all(
    ownerIds.map(async (id) => {
      const res = await getActiveRestriction(id);
      return [
        id,
        res.ok
          ? { restriction: res.restriction, known: true }
          : { restriction: null, known: false },
      ] as const;
    }),
  );
  return new Map(pairs);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

async function rows<T>(
  service: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const { data, error } = await service.from(table).select(columns).in("id", ids);
  if (error) {
    console.error(`[admin/reports live ${table}]`, error.message);
    return [];
  }
  return (data ?? []) as unknown as T[];
}

/**
 * What each reported thing looks like right now, read with the service role.
 *
 * NOTHING HERE COMES FROM RLS. A moderator reading the queue is not a member
 * of the club, not in the group chat and not the author, so every policy in
 * the app would answer "gone" — which is exactly the wrong answer for the
 * screen that decides whether it should be gone. So `removed` is read off the
 * row's own `removed_at`, and `hidden` is worked out from the club and the
 * channel by hand.
 *
 * `hidden` means "already out of sight for ordinary students": a hidden club,
 * a message in a private chat that was never public in the first place, or a
 * COMMENT WHOSE POST WAS REMOVED — removing a post takes its whole thread with
 * it, so a reported reply under it is already gone for everyone but its author,
 * and saying "up and visible" would send a moderator to remove it twice or to
 * restore the post thinking the takedown failed. It is context for the
 * decision, not a decision.
 *
 * A reported student's `hidden` is filled in by the caller from the
 * restriction, because "hidden" for a person means "restricted".
 */
async function loadLive(
  service: SupabaseClient,
  targets: Array<{ type: string; id: string }>,
): Promise<Map<string, { live: Live; ownerId: string | null }>> {
  const idsOf = (type: string) => targets.filter((t) => t.type === type).map((t) => t.id);

  type Post = { id: string; user_id: string | null; org_id: string | null; removed_at: string | null };
  type Comment = { id: string; user_id: string | null; post_id: string; removed_at: string | null };
  type Message = { id: string; user_id: string | null; channel_id: string; removed_at: string | null };
  type Event = { id: string; creator_id: string | null; org_id: string | null };
  type Channel = { id: string; org_id: string | null; is_private: boolean | null };
  type Org = { id: string; owner_id: string | null; hidden_at: string | null };

  const [posts, comments, messages, events, users] = await Promise.all([
    rows<Post>(service, "posts", "id, user_id, org_id, removed_at", idsOf("post")),
    rows<Comment>(service, "post_comments", "id, user_id, post_id, removed_at", idsOf("comment")),
    rows<Message>(service, "messages", "id, user_id, channel_id, removed_at", idsOf("message")),
    rows<Event>(service, "events", "id, creator_id, org_id", idsOf("event")),
    rows<{ id: string }>(service, "users", "id", idsOf("user")),
  ]);

  const [parentPosts, channels] = await Promise.all([
    rows<{ id: string; org_id: string | null; removed_at: string | null }>(
      service,
      "posts",
      "id, org_id, removed_at",
      unique(comments.map((c) => c.post_id)),
    ),
    rows<Channel>(
      service,
      "channels",
      "id, org_id, is_private",
      unique([...idsOf("channel"), ...messages.map((m) => m.channel_id)]),
    ),
  ]);

  const orgs = await rows<Org>(
    service,
    "orgs",
    "id, owner_id, hidden_at",
    unique([
      ...idsOf("org"),
      ...posts.map((p) => p.org_id),
      ...parentPosts.map((p) => p.org_id),
      ...channels.map((c) => c.org_id),
      ...events.map((e) => e.org_id),
    ]),
  );

  const orgHidden = new Set(orgs.filter((o) => o.hidden_at).map((o) => o.id));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const postOrgId = new Map([...posts, ...parentPosts].map((p) => [p.id, p.org_id ?? null]));
  // Removing a post takes its whole thread down with it: `post_comments`'
  // SELECT policy runs the post's policy through an EXISTS, so a comment under
  // a removed post is out of sight for everyone but its own author.
  const removedPosts = new Set(
    [...posts, ...parentPosts].filter((p) => p.removed_at).map((p) => p.id),
  );
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const inHiddenOrg = (orgId: string | null | undefined) => !!orgId && orgHidden.has(orgId);
  const channelHidden = (channelId: string | null | undefined) => {
    const ch = channelId ? channelById.get(channelId) : undefined;
    if (!ch) return false;
    return !!ch.is_private || inHiddenOrg(ch.org_id);
  };

  const out = new Map<string, { live: Live; ownerId: string | null }>();
  const put = (type: string, id: string, live: Live, ownerId: string | null) =>
    out.set(`${type}:${id}`, { live, ownerId });

  for (const p of posts) {
    put("post", p.id, { exists: true, removed: !!p.removed_at, hidden: inHiddenOrg(p.org_id) }, p.user_id);
  }
  for (const c of comments) {
    const orgId = postOrgId.get(c.post_id) ?? null;
    put(
      "comment",
      c.id,
      {
        exists: true,
        removed: !!c.removed_at,
        hidden: inHiddenOrg(orgId) || removedPosts.has(c.post_id),
      },
      c.user_id,
    );
  }
  for (const m of messages) {
    put(
      "message",
      m.id,
      { exists: true, removed: !!m.removed_at, hidden: channelHidden(m.channel_id) },
      m.user_id,
    );
  }
  for (const id of idsOf("channel")) {
    // `channels` also holds the chats the reported messages live in; only the
    // ones actually reported belong in the answer.
    if (!channelById.has(id)) continue;
    put("channel", id, { exists: true, removed: false, hidden: channelHidden(id) }, null);
  }
  for (const e of events) {
    put("event", e.id, { exists: true, removed: false, hidden: inHiddenOrg(e.org_id) }, e.creator_id);
  }
  for (const id of idsOf("org")) {
    const org = orgById.get(id);
    if (!org) continue;
    // A club's "owner" is its owner, so restricting from the queue points at
    // the person who runs it rather than at nobody.
    put("org", id, { exists: true, removed: false, hidden: !!org.hidden_at }, org.owner_id);
  }
  for (const u of users) {
    // `hidden` is patched in by the caller from the restriction.
    put("user", u.id, { exists: true, removed: false, hidden: false }, u.id);
  }

  return out;
}
