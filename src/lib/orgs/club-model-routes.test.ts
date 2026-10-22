/**
 * Behaviour tests for the club model's wave-1 routes (batches 1D and 1E;
 * added by the wave-1 repair, review findings 13 and 15), run for real on
 * stand-ins of the two Supabase clients:
 *   - POST /api/orgs/[slug]/join: asking to join follows with source
 *     `request`; a duplicate is "following"; a database without the source
 *     falls back to `join`;
 *   - DELETE /api/orgs/[slug]/join: `keep_following` true relabels a join
 *     or request follow to `profile` BEFORE the membership goes, and puts it
 *     back when the delete fails; false deletes the follow; no body leaves
 *     the follows to the database's trigger; once the membership is gone the
 *     leaver's RSVPs to the club's Members only upcoming events come off
 *     (Oct 22, 2026), never when the leave failed or for a non-member;
 *   - GET /api/orgs/[slug]/join?leave_preview=1: the RSVPs a leave would
 *     take away, for a member only;
 *   - DELETE /api/orgs/[slug]/members/[userId]: the removal is recorded
 *     BEFORE the membership goes, so the database's trigger drops their
 *     RSVPs (removals already did; Oct 22, 2026 pins the order);
 *   - POST /api/orgs/[slug]/mute: a hidden club is 404 to a non-member;
 *   - PATCH /api/orgs/[slug]/members/[userId] {title}: the reach (an admin
 *     never titles the owner), one of role or title at a time;
 *   - PATCH /api/me/clubs/[orgId] {muted}: one `org_post_mutes` row, through
 *     the shared writer; a hidden club is 404 to a non-member;
 *   - GET /api/orgs/[slug]/members: each row carries the member's title.
 *
 * Run with:
 *   node --test src/lib/orgs/club-model-routes.test.ts
 *
 * It lives here, not next to the routes: a path with `[slug]` in it never
 * matches `node --test`'s globs. The routes' server-only helpers resolve to
 * small data: modules that answer from `globalThis.__cm`; the pure modules
 * (following, join-state, join-copy, org-mutes, hidden-gate, club-flair,
 * pgrest) are the real files.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("club-model-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__cm";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie; }`),
  "@/lib/supabase/service": stub(
    `export function createSupabaseServiceClient() { return ${W}.service; }\nexport function isSupabaseServiceConfigured() { return true; }`,
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/limits/budgets": stub("export async function limitFor() { return { allowed: true, retryAfterSec: 0 }; }"),
  "@/lib/legal/require-terms": stub("export async function requireTermsAccepted() { return null; }"),
  "@/lib/orgs/membership": stub(
    `export async function loadViewerOrgContext() { return ${W}.ctx; }\nexport async function expireStaleInvites() {}\n` +
      "export async function admitMember() { return { ok: true }; }\n" +
      // A removal's record lands in the query log, so its order against the delete shows (Oct 22, 2026).
      `export async function recordOrgRemoval(_s, args) { ${W}.queries.push({ client: "service", table: "org_removals", calls: [["upsert", args]] }); return ${W}.removal ?? { ok: true, missing: false }; }\n` +
      `export async function forgetOrgRemoval(_s, orgId, userId) { ${W}.queries.push({ client: "service", table: "org_removals", calls: [["delete", orgId, userId]] }); }\n` +
      // The officers' "asked to join" and a cancel's mark-read (Oct 22, 2026), recorded.
      `export async function notifyOfficersOfJoinRequest(_s, args) { (${W}.notified ??= []).push(args); }\n` +
      `export async function settleJoinRequestNotifications(_s, orgId, userId) { (${W}.settled ??= []).push([orgId, userId]); }`,
  ),
  "@/lib/orgs/org-blocks": stub("export async function loadOrgBlocks() { return { ok: true, blockedByOfficer: false }; }"),
  "@/lib/moderation/access": stub(
    "export async function requireNotRestricted() { return null; }\n" +
      "export function contentBlockedResponse() { return new Response('{}', { status: 422 }); }",
  ),
  "@/lib/moderation/text-filter": stub("export function checkChangedText() { return { ok: true }; }"),
  "@/lib/chat/blocks": stub("export async function blockedIdsFor() { return new Set(); }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq", "not", "gt", "gte", "lte", "update", "insert", "upsert", "delete"];
type World = { user: { id: string } | null; queries: Query[]; ctx: unknown; cookie: unknown; service: unknown; removal?: unknown };

function fakeClient(kind: Query["client"], world: World, answer: (q: Query) => Answer) {
  const settle = (q: Query, single: boolean) => {
    const a = answer(q);
    const data = single && Array.isArray(a.data) ? (a.data[0] ?? null) : (a.data ?? null);
    return { data, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (q: Query) => {
    const builder: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(() => settle(q, false)).then(ok, bad),
      maybeSingle: () => (q.calls.push(["maybeSingle"]), Promise.resolve().then(() => settle(q, true))),
      single: () => (q.calls.push(["single"]), Promise.resolve().then(() => settle(q, true))),
    };
    for (const name of METHODS) builder[name] = (...args: unknown[]) => (q.calls.push([name, ...args]), builder);
    return builder;
  };
  return {
    auth: { getUser: async () => ({ data: { user: world.user }, error: null }) },
    from(table: string) {
      const q: Query = { client: kind, table, calls: [] };
      world.queries.push(q);
      return chain(q);
    },
  };
}

const uuid = (n: number, tail: string) => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(1, "a");
const OWNER = uuid(2, "a");
const PEER = uuid(3, "a");
const ORG = uuid(1, "d");

function install(answer: (q: Query) => Answer, opts: Partial<World> = {}): World {
  const world = { user: { id: ME }, queries: [], ctx: null, ...opts } as World;
  world.cookie = fakeClient("cookie", world, answer);
  world.service = fakeClient("service", world, answer);
  (globalThis as unknown as { __cm: World }).__cm = world;
  return world;
}

const writes = (w: World, table: string, method: string) => w.queries.filter((q) => q.table === table && q.calls.some((c) => c[0] === method));
const argOf = (q: Query, method: string) => q.calls.find((c) => c[0] === method)?.[1];
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const req = (method: string, body?: unknown) =>
  new Request("https://vibe.test/", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const quiet = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = quiet;
  }
};

/** A route file by path: through a variable, so tsc never sees a `.ts` import (TS5097). */
const routeFile = (path: string): string => path;

// ── POST /api/orgs/[slug]/join: asking to join follows (critique #8) ─────────

const join = (await import(routeFile("../../app/api/orgs/[slug]/join/route.ts"))) as typeof import("../../app/api/orgs/[slug]/join/route");
const REQUEST_CLUB = { id: ORG, handle: "chess", name: "Chess", join_policy: "request", audience: "both", hidden_at: null, campus_id: null, owner_id: OWNER };
const OUTSIDER = { ok: true, role: null, pendingInvite: null, pendingRequest: null, removed: false, viewer: { school_system: "iu", campus_id: null, is_platform_admin: false } };

function requestWorld(follow: Answer) {
  return install((q) => {
    if (q.table === "orgs") return { data: [REQUEST_CLUB] };
    if (q.table === "org_join_requests") return { data: [{ id: "r1", status: "pending", requested_at: "2026-10-16T00:00:00Z" }] };
    if (q.table === "org_followers") return follow;
    throw new Error(`unexpected read of ${q.table}`);
  }, { ctx: OUTSIDER });
}

test("join POST: a request follows with source 'request', service role, insert-or-ignore", async () => {
  const w = requestWorld({ data: null });
  const res = await json(await join.POST(req("POST", { message: "hi" }), params({ slug: "chess" })));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.pending, true);
  assert.equal(res.body.org_follow_state, "following");
  const inserts = writes(w, "org_followers", "insert");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].client, "service");
  assert.deepEqual(argOf(inserts[0], "insert"), { org_id: ORG, user_id: ME, source: "request" });
});

test("join POST: a follow they already had is 'following'; a database without the source falls back to 'join'", async () => {
  const dup = requestWorld({ error: { code: "23505", message: "duplicate key" } });
  assert.equal((await json(await join.POST(req("POST", {}), params({ slug: "chess" })))).body.org_follow_state, "following");
  assert.equal(writes(dup, "org_followers", "insert").length, 1, "never a second write over a tapped follow");
  const sources: unknown[] = [];
  const old = install((q) => {
    if (q.table === "orgs") return { data: [REQUEST_CLUB] };
    if (q.table === "org_join_requests") return { data: [{ id: "r1", status: "pending", requested_at: "x" }] };
    const source = (argOf(q, "insert") as { source: string }).source;
    sources.push(source);
    return source === "request"
      ? { error: { code: "23514", message: 'new row violates check constraint "org_followers_source_check"' } }
      : { data: null };
  }, { ctx: OUTSIDER });
  const res = await quietly(async () => json(await join.POST(req("POST", {}), params({ slug: "chess" }))));
  assert.equal(res.body.org_follow_state, "following");
  assert.deepEqual(sources, ["request", "join"]);
  assert.equal(writes(old, "org_followers", "insert").length, 2);
});

// ── Joining made clear (Oct 22, 2026): officers told, "not this time", cancel ─

type Told = { orgId: string; requesterId: string; excludeIds?: readonly string[] };
const told = (w: World) => ((w as unknown as { notified?: Told[] }).notified ?? []);
const DAY = 24 * 60 * 60 * 1000;

test("join POST: a NEW request tells the officers once; a repeat tap or a request already waiting doesn't", async () => {
  const fresh = requestWorld({ data: null });
  await json(await join.POST(req("POST", {}), params({ slug: "chess" })));
  assert.deepEqual(told(fresh), [{ orgId: ORG, requesterId: ME, excludeIds: [] }]);
  const waiting = requestWorld({ data: null });
  waiting.ctx = { ...OUTSIDER, pendingRequest: { id: "r1", status: "pending", requested_at: "x" } };
  const again = await json(await join.POST(req("POST", {}), params({ slug: "chess" })));
  assert.equal(again.body.pending, true);
  assert.deepEqual(told(waiting), [], "asking again while it waits tells nobody twice");
});

test("join POST: for two weeks after a no, asking is refused with the day; after that it files", async () => {
  const recent = new Date(Date.now() - 3 * DAY).toISOString();
  const w = requestWorld({ data: null });
  w.ctx = { ...OUTSIDER, declinedAt: recent };
  const res = await json(await join.POST(req("POST", {}), params({ slug: "chess" })));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "recently_declined");
  assert.equal(res.body.available_at, new Date(Date.parse(recent) + 14 * DAY).toISOString());
  assert.match(String(res.body.error), /^Not this time\. You can ask again on [A-Z][a-z]{2} \d{1,2}\.$/);
  assert.equal(writes(w, "org_join_requests", "insert").length, 0, "nothing filed");
  assert.equal(writes(w, "org_followers", "insert").length, 0, "and nothing followed");
  assert.deepEqual(told(w), []);
  const old = requestWorld({ data: null });
  old.ctx = { ...OUTSIDER, declinedAt: new Date(Date.now() - 15 * DAY).toISOString() };
  assert.equal((await json(await join.POST(req("POST", {}), params({ slug: "chess" })))).body.pending, true);
});

/** A non-member (or `role`) with a pending request on the request club. */
function cancelWorld(role: string | null, pending = true) {
  return install((q) => {
    if (q.table === "orgs") return { data: [REQUEST_CLUB] };
    if (q.table === "org_members") return { data: role ? [{ role }] : [] };
    if (q.table === "org_join_requests") return { data: pending ? [{ id: "r1" }] : [] };
    if (q.table === "org_followers") return { data: [] };
    throw new Error(`unexpected read of ${q.table}`);
  }, { ctx: OUTSIDER });
}
const cancel = () => join.DELETE(req("DELETE", { cancel_request: true }), params({ slug: "chess" }));

test("cancel: deletes the pending request and only a follow asking made, then reads the standing back", async () => {
  const w = cancelWorld(null);
  const res = await json(await cancel());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, cancelled: true, join_state: "can_request", join_reason: "policy", org_follow_state: "not_following" });
  const [gone] = writes(w, "org_join_requests", "delete");
  assert.equal(gone.client, "service");
  assert.ok(gone.calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "pending"), "only the pending row");
  assert.ok(gone.calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === ME), "only my own");
  const [unfollow] = writes(w, "org_followers", "delete");
  assert.ok(unfollow.calls.some((c) => c[0] === "eq" && c[1] === "source" && c[2] === "request"), "never a follow they tapped");
  assert.deepEqual((w as unknown as { settled?: unknown[] }).settled, [[ORG, ME]]);
  assert.equal(writes(w, "org_members", "delete").length, 0, "a cancel never leaves");
});

test("cancel: a member (let in meanwhile) stays in, and nothing is written; no request, no unfollow", async () => {
  const member = cancelWorld("member");
  const res = await json(await cancel());
  assert.deepEqual(res.body, { ok: true, cancelled: false, join_state: "member", org_follow_state: "following" });
  for (const table of ["org_members", "org_join_requests", "org_followers"]) {
    assert.equal(writes(member, table, "delete").length, 0, table);
  }
  const nothing = cancelWorld(null, false);
  assert.equal((await json(await cancel())).body.cancelled, false);
  assert.equal(writes(nothing, "org_followers", "delete").length, 0, "no request taken back, no follow dropped");
  // Without the flag a non-member's DELETE is still the leave's no-op.
  const plain = cancelWorld(null);
  assert.deepEqual((await json(await join.DELETE(req("DELETE"), params({ slug: "chess" })))).body, { ok: true, left: false });
  assert.equal(writes(plain, "org_join_requests", "delete").length, 0);
  assert.equal(plain.queries.filter((q) => q.table === "rsvps").length, 0, "a non-member's DELETE touches no RSVP");
});

// ── DELETE /api/orgs/[slug]/join: Leave, with "Keep following" (E1) ─────────

/**
 * `rsvps`: what the members-only read answers (leave-rsvps.ts); `dropped`:
 * the rows its delete says it took. Both default to none.
 */
type LeaveSetup = { source: string | null; deleteFails?: boolean; rsvps?: unknown[]; dropped?: unknown[]; rsvpError?: boolean };
function leaveWorld(s: LeaveSetup) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, owner_id: OWNER, hidden_at: null }] };
    if (q.table === "org_members" && q.calls.some((c) => c[0] === "delete")) {
      return s.deleteFails ? { error: { code: "57014", message: "timeout" } } : { count: 1 };
    }
    if (q.table === "org_members") return { data: [{ role: "member" }] };
    if (q.table === "org_followers") return q.calls.some((c) => c[0] === "update") ? { data: [{ source: "profile" }] } : { data: s.source ? [{ source: s.source }] : [] };
    if (q.table === "rsvps" && s.rsvpError) return { error: { code: "42703", message: "column events.visibility does not exist" } };
    if (q.table === "rsvps") return q.calls.some((c) => c[0] === "delete") ? { data: s.dropped ?? [] } : { data: s.rsvps ?? [] };
    throw new Error(`unexpected read of ${q.table}`);
  });
}
/** The query log as `table[:write]`, for order checks. */
const order = (w: World) =>
  w.queries.map((q) => q.table + (["update", "delete", "insert", "upsert"].map((m) => (q.calls.some((c) => c[0] === m) ? `:${m}` : "")).join("")));
const rsvpQueries = (w: World) => w.queries.filter((q) => q.table === "rsvps");
const hasCall = (q: Query, ...call: unknown[]) => q.calls.some((c) => JSON.stringify(c) === JSON.stringify(call));
const leave = (body?: unknown) => join.DELETE(req("DELETE", body), params({ slug: "chess" }));
const updates = (w: World) => writes(w, "org_followers", "update").map((q) => argOf(q, "update"));

test("leave: keep_following true relabels a join or request follow to profile BEFORE the membership goes", async () => {
  for (const source of ["join", "request"]) {
    const w = leaveWorld({ source });
    const res = await json(await leave({ keep_following: true }));
    assert.equal(res.body.left, true, source);
    assert.deepEqual(updates(w), [{ source: "profile" }], source);
    const log = order(w);
    assert.ok(log.indexOf("org_followers:update") < log.indexOf("org_members:delete"), `relabel first (${source})`);
    assert.equal(writes(w, "org_followers", "delete").length, 0);
  }
  const tapped = leaveWorld({ source: "profile" });
  await leave({ keep_following: true });
  assert.deepEqual(updates(tapped), [], "a tapped follow keeps its source");
});

test("leave: a failed delete puts the relabel back; false deletes the follow; no body leaves follows to the trigger", async () => {
  const failed = leaveWorld({ source: "request", deleteFails: true, rsvps: [{ status: "going", event: { id: "e1" } }] });
  assert.equal((await quietly(async () => leave({ keep_following: true }))).status, 500);
  assert.deepEqual(updates(failed), [{ source: "profile" }, { source: "request" }]);
  assert.equal(rsvpQueries(failed).length, 0, "a leave that failed keeps every RSVP");
  const drop = leaveWorld({ source: "profile" });
  assert.equal((await json(await leave({ keep_following: false }))).body.left, true);
  assert.equal(writes(drop, "org_followers", "delete").length, 1);
  const none = leaveWorld({ source: "join" });
  await leave();
  assert.equal(writes(none, "org_followers", "delete").length + writes(none, "org_followers", "update").length + writes(none, "org_followers", "insert").length, 0);
});

// ── Leaving takes you off Members only events (Oct 22, 2026, PLAN-3.md) ─────

const UPCOMING = [
  { status: "going", event: { id: "e1", title: "Chapter dinner", starts_at: "2026-10-30T23:00:00Z" } },
  { status: "no", event: { id: "e2", title: "Formal", starts_at: "2026-11-03T23:00:00Z" } },
];

test("leave: after the membership goes, my RSVPs to the club's members-only upcoming events come off (service role)", async () => {
  for (const body of [undefined, { keep_following: true }, { keep_following: false }]) {
    const w = leaveWorld({ source: "join", rsvps: UPCOMING, dropped: [{ status: "going" }, { status: "no" }] });
    const res = await json(await leave(body));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.left, true);
    assert.equal(res.body.rsvps_dropped, 1, "a Can't go isn't one they were on");
    const log = order(w);
    assert.ok(log.indexOf("org_members:delete") < log.indexOf("rsvps"), `the membership goes first (${JSON.stringify(body)})`);
    const [read, del] = rsvpQueries(w);
    assert.equal(read.client, "service");
    assert.ok(hasCall(read, "eq", "user_id", ME) && hasCall(read, "eq", "event.org_id", ORG) && hasCall(read, "eq", "event.visibility", "members"));
    assert.ok(read.calls.some((c) => c[0] === "gt" && c[1] === "event.ends_at"), "events that haven't ended");
    assert.equal(del.client, "service");
    assert.ok(del.calls.some((c) => c[0] === "delete"));
    assert.ok(hasCall(del, "eq", "user_id", ME), "only mine");
    assert.ok(hasCall(del, "in", "event_id", ["e1", "e2"]), "only those events");
  }
});

test("leave: nothing members-only is rsvps_dropped 0; a failed RSVP read never fails the leave", async () => {
  const none = leaveWorld({ source: "profile" });
  assert.equal((await json(await leave())).body.rsvps_dropped, 0);
  assert.equal(writes(none, "rsvps", "delete").length, 0, "no delete with nothing to drop");
  const broken = leaveWorld({ source: "profile", rsvpError: true });
  const res = await quietly(async () => json(await leave({ keep_following: true })));
  assert.equal(res.status, 200);
  assert.equal(res.body.left, true);
  assert.equal(res.body.rsvps_dropped, 0);
  assert.equal(writes(broken, "rsvps", "delete").length, 0);
});

const preview = (slug = "chess", query = "?leave_preview=1") => join.GET(new Request(`https://vibe.test/api/orgs/${slug}/join${query}`), params({ slug }));

const COMING = [
  { status: "going", event: { id: "e1", title: "Chapter dinner", starts_at: "2026-10-30T23:00:00Z" } },
  { status: "maybe", event: { id: "e2", title: "Formal", starts_at: "2026-11-03T23:00:00Z" } },
];

function previewWorld(role: string | null, hidden = false, rsvps: unknown[] = COMING) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, hidden_at: hidden ? "2026-10-01T00:00:00Z" : null }] };
    if (q.table === "org_members") return { data: role ? [{ role }] : [] };
    if (q.table === "rsvps") return { data: rsvps };
    throw new Error(`unexpected read of ${q.table}`);
  });
}

test("leave preview: a member gets their members-only RSVPs, read on the service role; nothing is written", async () => {
  const w = previewWorld("member");
  const res = await json(await preview());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    ok: true,
    events: [
      { id: "e1", title: "Chapter dinner", starts_at: "2026-10-30T23:00:00Z", viewer_status: "going" },
      { id: "e2", title: "Formal", starts_at: "2026-11-03T23:00:00Z", viewer_status: "maybe" },
    ],
  });
  const [read] = rsvpQueries(w);
  assert.equal(read.client, "service");
  assert.ok(hasCall(read, "in", "status", ["going", "maybe"]));
  assert.ok(hasCall(read, "eq", "event.visibility", "members"));
  for (const method of ["insert", "upsert", "update", "delete"]) {
    assert.equal(w.queries.filter((q) => q.calls.some((c) => c[0] === method)).length, 0, method);
  }
});

test("leave preview: a non-member gets none; a hidden club is 404 to them; signed out 401; no flag 400; a failed read 500", async () => {
  const outsider = previewWorld(null);
  assert.deepEqual((await json(await preview())).body, { ok: true, events: [] });
  assert.equal(rsvpQueries(outsider).length, 0, "nobody else's RSVPs are read for a non-member");
  previewWorld(null, true);
  assert.equal((await preview()).status, 404);
  previewWorld("member", true);
  assert.equal((await preview()).status, 200, "a member of a hidden club still sees what they'd lose");
  const out = previewWorld("member");
  out.user = null;
  assert.equal((await preview()).status, 401);
  const bare = previewWorld("member");
  assert.equal((await preview("chess", "")).status, 400);
  assert.equal(bare.queries.length, 0, "no flag, no read");
  install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, hidden_at: null }] };
    if (q.table === "org_members") return { data: [{ role: "member" }] };
    return { error: { code: "42703", message: "no visibility" } };
  });
  const failed = await quietly(async () => json(await preview()));
  assert.equal(failed.status, 500);
  assert.equal(failed.body.code, "load_failed");
});

// ── Mute a club's posts (gap 2): two routes, one writer ─────────────────────

const mute = (await import(routeFile("../../app/api/orgs/[slug]/mute/route.ts"))) as typeof import("../../app/api/orgs/[slug]/mute/route");
const myClub = (await import(routeFile("../../app/api/me/clubs/[orgId]/route.ts"))) as typeof import("../../app/api/me/clubs/[orgId]/route");

function muteWorld(hidden: boolean, role: string | null, unmuted = 1) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, hidden_at: hidden ? "2026-10-01T00:00:00Z" : null }] };
    if (q.table === "org_members") return { data: role ? [{ role }] : [] };
    if (q.table === "org_post_mutes") return q.calls.some((c) => c[0] === "delete") ? { count: unmuted } : { data: null };
    throw new Error(`unexpected read of ${q.table}`);
  });
}

test("mute POST: a hidden club is 404 to a non-member and nothing is written; its member mutes", async () => {
  const outside = muteWorld(true, null);
  assert.equal((await mute.POST(req("POST"), params({ slug: "chess" }))).status, 404);
  assert.equal(writes(outside, "org_post_mutes", "insert").length, 0);
  const inside = muteWorld(true, "member");
  assert.deepEqual((await json(await mute.POST(req("POST"), params({ slug: "chess" })))).body, { ok: true, muted: true, already: false });
  assert.deepEqual(argOf(writes(inside, "org_post_mutes", "insert")[0], "insert"), { user_id: ME, org_id: ORG });
});

test("me/clubs PATCH {muted}: exactly one org_post_mutes row for (me, club); a hidden club is 404 to a non-member", async () => {
  const w = muteWorld(false, "member");
  const res = await json(await myClub.PATCH(req("PATCH", { muted: true }), params({ orgId: ORG })));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.muted, true);
  const rows = writes(w, "org_post_mutes", "insert");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client, "service");
  assert.deepEqual(argOf(rows[0], "insert"), { user_id: ME, org_id: ORG });
  const hidden = muteWorld(true, null);
  assert.equal((await myClub.PATCH(req("PATCH", { muted: true }), params({ orgId: ORG }))).status, 404);
  assert.equal(writes(hidden, "org_post_mutes", "insert").length, 0);
  // Taking back a mute made before the club was hidden: only a row really removed says so.
  muteWorld(true, null, 0);
  assert.equal((await myClub.PATCH(req("PATCH", { muted: false }), params({ orgId: ORG }))).status, 404);
  muteWorld(true, null, 1);
  assert.equal((await json(await myClub.PATCH(req("PATCH", { muted: false }), params({ orgId: ORG })))).body.muted, false);
});

// ── Titles (spec D): the reach, one change at a time, and the member list ────

const member = (await import(routeFile("../../app/api/orgs/[slug]/members/[userId]/route.ts"))) as typeof import("../../app/api/orgs/[slug]/members/[userId]/route");
const roster = (await import(routeFile("../../app/api/orgs/[slug]/members/route.ts"))) as typeof import("../../app/api/orgs/[slug]/members/route");

function titleWorld(viewerRole: string, targetRole: string) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, owner_id: OWNER, hidden_at: null }] };
    if (q.table === "org_members" && q.calls.some((c) => c[0] === "update")) return { data: [{ title: "Treasurer" }] };
    if (q.table === "org_members") {
      const who = q.calls.find((c) => c[0] === "eq" && c[1] === "user_id")?.[2];
      return { data: [{ role: who === ME ? viewerRole : targetRole, title: null }] };
    }
    throw new Error(`unexpected read of ${q.table}`);
  });
}
const setTitle = (target: string, body: unknown) => member.PATCH(req("PATCH", body), params({ slug: "chess", userId: target }));

test("title: an admin can't title the owner or another admin (403, nothing written); the owner titles an admin", async () => {
  for (const target of ["owner", "admin"]) {
    const w = titleWorld("admin", target);
    assert.equal((await setTitle(target === "owner" ? OWNER : PEER, { title: "President" })).status, 403, target);
    assert.equal(writes(w, "org_members", "update").length, 0, target);
  }
  const w = titleWorld("owner", "admin");
  assert.deepEqual((await json(await setTitle(PEER, { title: "Treasurer" }))).body, { ok: true, title: "Treasurer" });
  const write = writes(w, "org_members", "update")[0];
  assert.equal((argOf(write, "update") as { title_set_by: string }).title_set_by, ME, "who set it is stamped");
  const reach = write.calls.find((c) => c[0] === "in" && c[1] === "role")?.[2];
  assert.deepEqual(reach, ["admin", "member"], "the write re-asks the reach: never the owner's row");
});

// ── Roles (club view, Franky, Oct 20): only the owner makes or removes officers ─

const setRole = (target: string, role: unknown) => member.PATCH(req("PATCH", { role }), params({ slug: "chess", userId: target }));

test("role: an officer can't make an officer or demote one (403, nothing read about the member, nothing written)", async () => {
  for (const [targetRole, role] of [["member", "admin"], ["admin", "member"], ["member", "member"]]) {
    const w = titleWorld("admin", targetRole);
    const res = await json(await setRole(PEER, role));
    assert.deepEqual(res, { status: 403, body: { ok: false, error: "Only the owner can make or remove officers." } }, `${targetRole} → ${role}`);
    assert.equal(writes(w, "org_members", "update").length, 0, `${targetRole} → ${role}`);
    const targetReads = w.queries.filter((q) => q.table === "org_members" && q.calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === PEER));
    assert.equal(targetReads.length, 0, "refused before the target is read");
  }
});

test("role: the owner makes a member an officer and back; the write never reaches the owner's row; no mods", async () => {
  for (const [targetRole, role] of [["member", "admin"], ["admin", "member"]]) {
    const w = titleWorld("owner", targetRole);
    assert.deepEqual(await json(await setRole(PEER, role)), { status: 200, body: { ok: true } }, `${targetRole} → ${role}`);
    const write = writes(w, "org_members", "update")[0];
    assert.deepEqual(argOf(write, "update"), { role });
    assert.deepEqual(write.calls.find((c) => c[0] === "in" && c[1] === "role")?.[2], ["admin", "member"]);
  }
  const mod = titleWorld("owner", "member");
  assert.equal((await setRole(PEER, "mod")).status, 400, "mod is not a role any more");
  assert.equal(writes(mod, "org_members", "update").length, 0);
  const owner = titleWorld("owner", "owner");
  assert.equal((await setRole(OWNER, "member")).status, 400, "the owner's row is never changed here");
  assert.equal(writes(owner, "org_members", "update").length, 0);
});

// ── Removals drop RSVPs: the record goes in first (Oct 22, 2026, PLAN-3.md) ──

const remove = (target: string) => member.DELETE(req("DELETE"), params({ slug: "chess", userId: target }));

test("remove: the removal is recorded BEFORE the membership goes, so the trigger drops every upcoming RSVP", async () => {
  const w = titleWorld("owner", "member");
  assert.deepEqual(await json(await remove(PEER)), { status: 200, body: { ok: true } });
  const log = order(w);
  assert.ok(log.includes("org_removals:upsert") && log.includes("org_members:delete"), log.join(", "));
  assert.ok(log.indexOf("org_removals:upsert") < log.indexOf("org_members:delete"), "record first, then delete");
  const [recorded] = w.queries.filter((q) => q.table === "org_removals");
  assert.deepEqual(recorded.calls[0][1], { orgId: ORG, userId: PEER, removedBy: ME });
  const [gone] = writes(w, "org_members", "delete");
  assert.equal(gone.client, "service");
  assert.ok(hasCall(gone, "eq", "user_id", PEER));
  // The route never deletes RSVPs itself: the trigger does, from the record.
  assert.equal(rsvpQueries(w).length, 0);
});

test("remove: a removal that can't be recorded deletes nothing (no removal the trigger can't tell from a leave)", async () => {
  const w = titleWorld("owner", "member");
  w.removal = { ok: false };
  assert.equal((await remove(PEER)).status, 500);
  assert.equal(writes(w, "org_members", "delete").length, 0);
});

test("title: role and title together are refused (400) before anything is read about the member", async () => {
  const w = titleWorld("owner", "member");
  assert.equal((await setTitle(PEER, { role: "admin", title: "President" })).status, 400);
  assert.equal(writes(w, "org_members", "update").length, 0);
});

test("member list: each row carries its title for the club's members (null when none)", async () => {
  install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, hidden_at: null }] };
    if (q.table === "org_members" && q.calls.some((c) => c[0] === "maybeSingle")) return { data: [{ role: "member" }] };
    if (q.table === "org_members") {
      assert.ok(String(argOf(q, "select")).includes("title"), "the list reads the title");
      return {
        data: [
          { user_id: OWNER, role: "owner", joined_at: "2026-09-01", title: "President", users: { id: OWNER, name: "O", handle: "o", avatar_url: null, school_verified: true } },
          { user_id: PEER, role: "member", joined_at: "2026-09-02", title: null, users: { id: PEER, name: "P", handle: "p", avatar_url: null, school_verified: true } },
        ],
      };
    }
    throw new Error(`unexpected read of ${q.table}`);
  });
  const res = await json(await roster.GET(req("GET"), params({ slug: "chess" })));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const rows = res.body.members as { user_id: string; title: string | null }[];
  assert.deepEqual(rows.map((r) => [r.user_id, r.title]), [[OWNER, "President"], [PEER, null]]);
});
