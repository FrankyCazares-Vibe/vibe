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
 *     the follows to the database's trigger;
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
      "export async function admitMember() { return { ok: true }; }\nexport async function recordOrgRemoval() {}\nexport async function forgetOrgRemoval() {}",
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
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq", "not", "update", "insert", "upsert", "delete"];
type World = { user: { id: string } | null; queries: Query[]; ctx: unknown; cookie: unknown; service: unknown };

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

// ── DELETE /api/orgs/[slug]/join: Leave, with "Keep following" (E1) ─────────

type LeaveSetup = { source: string | null; deleteFails?: boolean };
function leaveWorld(s: LeaveSetup) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, owner_id: OWNER, hidden_at: null }] };
    if (q.table === "org_members" && q.calls.some((c) => c[0] === "delete")) {
      return s.deleteFails ? { error: { code: "57014", message: "timeout" } } : { count: 1 };
    }
    if (q.table === "org_members") return { data: [{ role: "member" }] };
    if (q.table === "org_followers") return q.calls.some((c) => c[0] === "update") ? { data: [{ source: "profile" }] } : { data: s.source ? [{ source: s.source }] : [] };
    throw new Error(`unexpected read of ${q.table}`);
  });
}
const leave = (body?: unknown) => join.DELETE(req("DELETE", body), params({ slug: "chess" }));
const updates = (w: World) => writes(w, "org_followers", "update").map((q) => argOf(q, "update"));

test("leave: keep_following true relabels a join or request follow to profile BEFORE the membership goes", async () => {
  for (const source of ["join", "request"]) {
    const w = leaveWorld({ source });
    const res = await json(await leave({ keep_following: true }));
    assert.equal(res.body.left, true, source);
    assert.deepEqual(updates(w), [{ source: "profile" }], source);
    const order = w.queries.map((q) => q.table + (q.calls.some((c) => c[0] === "update") ? ":update" : q.calls.some((c) => c[0] === "delete") ? ":delete" : ""));
    assert.ok(order.indexOf("org_followers:update") < order.indexOf("org_members:delete"), `relabel first (${source})`);
    assert.equal(writes(w, "org_followers", "delete").length, 0);
  }
  const tapped = leaveWorld({ source: "profile" });
  await leave({ keep_following: true });
  assert.deepEqual(updates(tapped), [], "a tapped follow keeps its source");
});

test("leave: a failed delete puts the relabel back; false deletes the follow; no body leaves follows to the trigger", async () => {
  const failed = leaveWorld({ source: "request", deleteFails: true });
  assert.equal((await quietly(async () => leave({ keep_following: true }))).status, 500);
  assert.deepEqual(updates(failed), [{ source: "profile" }, { source: "request" }]);
  const drop = leaveWorld({ source: "profile" });
  assert.equal((await json(await leave({ keep_following: false }))).body.left, true);
  assert.equal(writes(drop, "org_followers", "delete").length, 1);
  const none = leaveWorld({ source: "join" });
  await leave();
  assert.equal(writes(none, "org_followers", "delete").length + writes(none, "org_followers", "update").length + writes(none, "org_followers", "insert").length, 0);
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
