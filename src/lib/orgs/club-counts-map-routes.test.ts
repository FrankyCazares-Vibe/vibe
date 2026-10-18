/**
 * Behaviour tests for club model batch 2A (counts and the Map), run for real
 * on stand-ins of the two Supabase clients:
 *   - GET /api/orgs?filter=discover and GET /api/search: a member count below
 *     5 reaches only that club's members; a failed membership read floors it;
 *   - GET /api/campus-map: hidden clubs are filtered in the query, member
 *     counts are read with the SERVICE client and floored the same way;
 *   - GET /api/campus-map/zone?org=: only members who show the club, read
 *     with the SERVICE client (so the zone survives 20261017120000, which
 *     makes `org_members` members-only); a hidden club is 404; outside a
 *     club only a public club anyone can join lists anyone.
 *
 * Run with:
 *   node --test src/lib/orgs/club-counts-map-routes.test.ts
 *
 * It lives here, not next to the routes, for the reason in
 * club-model-routes.test.ts (`[slug]`-style paths and node --test globs).
 * The server-only helpers resolve to small data: modules answering from
 * `globalThis.__cc`; following, join-state, campus scope and pgrest are real.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("club-counts-map-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__cc";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie; }`),
  "@/lib/supabase/service": stub(`export function createSupabaseServiceClient() { return ${W}.service; }`),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireCanPublish() { return null; }\n" +
      "export function contentBlockedResponse() { return new Response('{}', { status: 422 }); }",
  ),
  "@/lib/safety/hidden-users": stub(
    "export async function loadHiddenUsers() { return { ok: true, hidden: { blocked: new Set(), muted: new Set(), ids: [] } }; }",
  ),
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
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq", "not"];
type World = { queries: Query[]; cookie: unknown; service: unknown };

function fakeClient(kind: Query["client"], world: World, answer: (q: Query) => Answer) {
  const settle = (q: Query, single: boolean) => {
    const a = answer(q);
    const data = single && Array.isArray(a.data) ? (a.data[0] ?? null) : (a.data ?? null);
    return { data, error: a.error ?? null, count: null };
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
    auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) },
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      const q: Query = { client: kind, table, calls: [] };
      world.queries.push(q);
      return chain(q);
    },
  };
}

const uuid = (n: number, tail: string) => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(1, "a");
const PEER = uuid(2, "a");
const PEER2 = uuid(3, "a");
const MINE = uuid(1, "d"); // 3 members, the viewer among them
const SMALL = uuid(2, "d"); // 3 members, not the viewer's
const BIG = uuid(3, "d"); // 7 members
const CAMPUS = "indianapolis";
const ME_ROW = { id: ME, name: "Me", handle: "me", major: null, avatar_url: null, school: "", campus_id: CAMPUS, school_system: "iu" };

function install(answer: (q: Query) => Answer): World {
  const world = { queries: [] } as unknown as World;
  world.cookie = fakeClient("cookie", world, answer);
  world.service = fakeClient("service", world, answer);
  (globalThis as unknown as { __cc: World }).__cc = world;
  return world;
}

const has = (q: Query, ...call: unknown[]) => q.calls.some((c) => JSON.stringify(c) === JSON.stringify(call));
const reads = (w: World, client: Query["client"], table: string) => w.queries.filter((q) => q.client === client && q.table === table);
const get = (path: string) => new Request(`https://vibe.test${path}`);
const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const quiet = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = quiet;
  }
};
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
type Row = { id: string; member_count: unknown };
const countsById = (rows: unknown) => Object.fromEntries((rows as Row[]).map((r) => [r.id, r.member_count]));

/** A route file by path: through a variable, so tsc never sees a `.ts` import (TS5097). */
const routeFile = (path: string): string => path;
const membersEmbed = (n: number) => [{ count: n }];

// ── GET /api/orgs?filter=discover ────────────────────────────────────────────

const orgsList = (await import(routeFile("../../app/api/orgs/route.ts"))) as typeof import("../../app/api/orgs/route");
const listRow = (id: string, members: number) => ({
  id, handle: `c${id.slice(-1)}`, name: "Club", description: "", logo_url: null, banner_url: null, is_public: true,
  backdrop_preset: "midnight", verified: true, last_activity_at: null, links: [], philanthropy: "", school: "",
  campus_id: CAMPUS, join_policy: "open", audience: "both", members: membersEmbed(members), followers: [{ count: 0 }],
});

function discoverWorld(myRows: Answer) {
  return install((q) => {
    if (q.table === "users") return { data: [ME_ROW] };
    if (q.client === "cookie" && q.table === "org_members") return myRows;
    if (q.client === "service" && q.table === "orgs") return { data: [listRow(MINE, 3), listRow(SMALL, 3), listRow(BIG, 7)] };
    return { data: [] };
  });
}

test("orgs discover: below 5 only a member sees the count; 5 and up everyone does", async () => {
  discoverWorld({ data: [{ org_id: MINE, role: "member" }] });
  const res = await json(await orgsList.GET(get("/api/orgs?filter=discover")));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(countsById(res.body.orgs), { [MINE]: 3, [SMALL]: null, [BIG]: 7 });
});

test("orgs discover: an unreadable membership list floors every count, never shows one exact", async () => {
  discoverWorld({ error: { message: "boom" } });
  const res = await quietly(async () => json(await orgsList.GET(get("/api/orgs?filter=discover"))));
  assert.equal(res.status, 200);
  assert.deepEqual(countsById(res.body.orgs), { [MINE]: null, [SMALL]: null, [BIG]: 7 });
});

// ── GET /api/search?kinds=orgs ───────────────────────────────────────────────

const search = (await import(routeFile("../../app/api/search/route.ts"))) as typeof import("../../app/api/search/route");

function searchWorld(myRows: Answer) {
  return install((q) => {
    if (q.client === "service" && q.table === "orgs") return { data: [listRow(MINE, 3), listRow(SMALL, 3), listRow(BIG, 7)] };
    if (q.client === "service" && q.table === "org_members") return myRows;
    throw new Error(`unexpected read of ${q.client} ${q.table}`);
  });
}

test("search: club counts below 5 reach members only, from the viewer's own rows read beside the search", async () => {
  const w = searchWorld({ data: [{ org_id: MINE, role: "admin" }] });
  const res = await json(await search.GET(get("/api/search?q=club&kinds=orgs")));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(countsById(res.body.orgs), { [MINE]: 3, [SMALL]: null, [BIG]: 7 });
  const [roles] = reads(w, "service", "org_members");
  assert.ok(has(roles, "eq", "user_id", ME), "only the viewer's own membership rows");
});

test("search: a failed membership read floors the counts; no orgs asked, no membership read", async () => {
  searchWorld({ error: { message: "boom" } });
  const res = await quietly(async () => json(await search.GET(get("/api/search?q=club&kinds=orgs"))));
  assert.deepEqual(countsById(res.body.orgs), { [MINE]: null, [SMALL]: null, [BIG]: 7 });
  const w = install(() => ({ data: [] }));
  await search.GET(get("/api/search?q=club&kinds=users"));
  assert.equal(reads(w, "service", "org_members").length, 0);
});

// ── GET /api/campus-map ──────────────────────────────────────────────────────

const campusMap = (await import(routeFile("../../app/api/campus-map/route.ts"))) as typeof import("../../app/api/campus-map/route");
const mapClub = (id: string) => ({ id, handle: `c${id.slice(-1)}`, name: "Club", logo_url: null, verified: false, is_public: true, last_activity_at: null });

function mapWorld(counts: Answer, myRows: Answer) {
  return install((q) => {
    if (q.table === "users") return { data: has(q, "single") ? [ME_ROW] : [] };
    if (q.table === "connections") return { data: [] };
    if (q.client === "cookie" && q.table === "orgs") return { data: [mapClub(MINE), mapClub(SMALL), mapClub(BIG)] };
    if (q.client === "service" && q.table === "orgs") return counts;
    if (q.client === "service" && q.table === "org_members") return myRows;
    throw new Error(`unexpected read of ${q.client} ${q.table}`);
  });
}
const MAP_COUNTS = { data: [{ id: MINE, members: membersEmbed(3) }, { id: SMALL, members: membersEmbed(3) }, { id: BIG, members: membersEmbed(7) }] };

test("campus-map: no hidden club; counts from the service client, exact for members, null below 5 for the rest", async () => {
  const w = mapWorld(MAP_COUNTS, { data: [{ org_id: MINE, role: "member" }] });
  const res = await json(await campusMap.GET(get("/api/campus-map")));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(countsById(res.body.orgs), { [MINE]: 3, [SMALL]: null, [BIG]: 7 });
  const [clubs] = reads(w, "cookie", "orgs");
  assert.ok(has(clubs, "is", "hidden_at", null), "RLS shows a member their hidden club; the query must not");
  assert.equal(reads(w, "cookie", "org_members").length, 0, "never counted on the viewer's client (members-only after M3)");
  const [counts] = reads(w, "service", "orgs");
  assert.ok(has(counts, "select", "id, members:org_members(count)"));
  const [roles] = reads(w, "service", "org_members");
  assert.ok(has(roles, "eq", "user_id", ME));
});

test("campus-map: a failed count is null (never 0); a failed role read floors; no clubs, no service reads", async () => {
  mapWorld({ error: { message: "boom" } }, { data: [{ org_id: MINE, role: "member" }] });
  const failedCounts = await quietly(async () => json(await campusMap.GET(get("/api/campus-map"))));
  assert.deepEqual(countsById(failedCounts.body.orgs), { [MINE]: null, [SMALL]: null, [BIG]: null });
  mapWorld(MAP_COUNTS, { error: { message: "boom" } });
  const failedRoles = await quietly(async () => json(await campusMap.GET(get("/api/campus-map"))));
  assert.deepEqual(countsById(failedRoles.body.orgs), { [MINE]: null, [SMALL]: null, [BIG]: 7 });
  const w = install((q) => (q.table === "users" && has(q, "single") ? { data: [ME_ROW] } : { data: [] }));
  const empty = await json(await campusMap.GET(get("/api/campus-map")));
  assert.deepEqual(empty.body.orgs, []);
  assert.equal(w.queries.filter((q) => q.client === "service").length, 0);
});

// ── GET /api/campus-map/zone?org= ────────────────────────────────────────────

const zone = (await import(routeFile("../../app/api/campus-map/zone/route.ts"))) as typeof import("../../app/api/campus-map/zone/route");
const OPEN_CLUB = { id: SMALL, campus_id: CAMPUS, is_public: true, join_policy: "open", hidden_at: null };
const REQUEST_CLUB = { ...OPEN_CLUB, join_policy: "request" };
const person = (id: string) => ({ id, name: "P", handle: `p${id.slice(-1)}`, major: null, year: null, avatar_url: null });

type ZoneSetup = { club: unknown; role?: Answer; members?: Answer };
function zoneWorld(s: ZoneSetup) {
  return install((q) => {
    if (q.table === "users" && has(q, "maybeSingle")) return { data: [ME_ROW] };
    if (q.table === "users") return { data: ((q.calls.find((c) => c[0] === "in")?.[2] ?? []) as string[]).map(person) };
    if (q.client === "cookie" && q.table === "orgs") return { data: s.club ? [s.club] : [] };
    if (q.table === "connections") return { data: [] };
    if (q.client === "service" && q.table === "org_members" && has(q, "select", "role")) return s.role ?? { data: [] };
    if (q.client === "service" && q.table === "org_members") return s.members ?? { data: [] };
    throw new Error(`unexpected read of ${q.client} ${q.table}`);
  });
}
const zoneGet = async () => json(await zone.GET(get("/api/campus-map/zone?org=club")));
const listed = (body: Record<string, unknown>) =>
  ["connected", "mutuals", "discover"].flatMap((k) => (body[k] as Array<{ id: string }>).map((p) => p.id)).sort();
const memberReads = (w: World) => reads(w, "service", "org_members").filter((q) => has(q, "select", "user_id"));

test("zone: an open club lists only members who show it, read with the service client, never the viewer", async () => {
  const w = zoneWorld({ club: OPEN_CLUB, members: { data: [{ user_id: PEER }, { user_id: ME }, { user_id: PEER2 }] } });
  const res = await zoneGet();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(listed(res.body), [PEER, PEER2].sort());
  const [members] = memberReads(w);
  assert.equal(members.client, "service", "survives 20261017120000 (members-only member lists)");
  assert.ok(has(members, "eq", "org_id", SMALL));
  assert.ok(has(members, "eq", "show_on_profile", true), "a member who hid the club is never listed");
  assert.equal(reads(w, "cookie", "org_members").length, 0);
  assert.equal(reads(w, "service", "org_members").filter((q) => has(q, "select", "role")).length, 0, "no role needed for an open club");
});

test("zone: outside the open reach only a member sees anyone; a failed role read is a 500", async () => {
  const outsider = zoneWorld({ club: REQUEST_CLUB, role: { data: [] }, members: { data: [{ user_id: PEER }] } });
  const out = await zoneGet();
  assert.equal(out.status, 200);
  assert.deepEqual(listed(out.body), []);
  assert.equal(memberReads(outsider).length, 0, "nobody's membership is read for an outsider");

  const member = zoneWorld({ club: REQUEST_CLUB, role: { data: [{ role: "member" }] }, members: { data: [{ user_id: PEER }] } });
  const inside = await zoneGet();
  assert.deepEqual(listed(inside.body), [PEER]);
  assert.ok(has(memberReads(member)[0], "eq", "show_on_profile", true), "members, too, see only who shows the club");

  zoneWorld({ club: REQUEST_CLUB, role: { error: { message: "boom" } } });
  assert.equal((await quietly(zoneGet)).status, 500);
});

test("zone: a hidden club is 404 to everyone, members included, with no roster read", async () => {
  const w = zoneWorld({ club: { ...OPEN_CLUB, hidden_at: "2026-10-01T00:00:00Z" }, role: { data: [{ role: "owner" }] } });
  const res = await zoneGet();
  assert.equal(res.status, 404);
  assert.equal(w.queries.filter((q) => q.client === "service").length, 0);
  zoneWorld({ club: null });
  assert.equal((await zoneGet()).status, 404, "the same answer as a missing handle");
});

test("zone: another campus lists nobody; a database without show_on_profile lists nobody; other failures are 500", async () => {
  const away = zoneWorld({ club: { ...OPEN_CLUB, campus_id: "bloomington" }, members: { data: [{ user_id: PEER }] } });
  assert.deepEqual(listed((await zoneGet()).body), []);
  assert.equal(memberReads(away).length, 0);

  const missing = { code: "42703", message: "column org_members.show_on_profile does not exist" };
  zoneWorld({ club: OPEN_CLUB, members: { error: missing } });
  const old = await quietly(zoneGet);
  assert.equal(old.status, 200);
  assert.deepEqual(listed(old.body), [], "never everyone");

  zoneWorld({ club: OPEN_CLUB, members: { error: { message: "boom" } } });
  assert.equal((await quietly(zoneGet)).status, 500);
});
