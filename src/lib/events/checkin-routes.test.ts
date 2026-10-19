/**
 * The new event check-in routes (contract
 * handoffs/2026-10-19-checkin-build/CONTRACT.md, 3.2 to 3.5; section 6,
 * `checkin-routes.test.ts`), run for real against stand-ins:
 *   GET / POST / DELETE  /api/events/[id]/checkin
 *   GET / POST / DELETE  /api/events/[id]/checkin/door
 *   PUT / DELETE         /api/events/[id]/checkin/marks/[userId]
 *   DELETE               /api/events/[id]/checkin/marks
 *   GET                  /api/me/event-checkins
 *
 * What it proves: a malformed code or token costs no limiter try; the order
 * limiter -> restriction gate -> the service-role check; the eventCheckin
 * budget's key and numbers; both 429s; `p_user` is always the signed-in
 * account; every database word maps per the contract; DELETE has no Terms
 * or restriction gate; the door's links come from the site's own address;
 * Stop answers a closed feed once close said closed, whatever the read
 * after it says; not_manager is 404 for an event RLS hides from the caller;
 * a missing service key is a 500 before the limiter; every GET says
 * no-store; no log line holds a code, a token or a user id.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/checkin-routes.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments
 * as globs, so a path with `[id]` in it never matches (the
 * pins-routes.test.ts placement).
 *
 * WHY THE RESOLVE HOOK (as src/lib/limits/social-limits.test.ts): the routes
 * import "next/server", "server-only" modules and the two Supabase clients;
 * each resolves to a small data: module that reads its fake from globalThis.
 * checkin-route.ts, event-checkin.ts, event-item.ts, budgets.ts, pgrest and
 * site-url are the real code. Every stand-in writes what it did to one log,
 * in order.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("checkin-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export class NextResponse extends Response {\n" +
      "  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }\n" +
      "}",
  ),
  "@/lib/supabase/server": dataModule(
    "export async function createSupabaseServerClient() { return globalThis.__ci.client('cookie'); }",
  ),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { globalThis.__ci.log.push('service'); return globalThis.__ci.client('service'); }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__ci.serviceConfigured; }",
  ),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { const w = globalThis.__ci; w.log.push('limit:' + key); w.limits.push({ key, opts }); return w.rl; }\n" +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.', code) {\n" +
      "  return new Response(JSON.stringify(code ? { ok: false, code, error: message } : { ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }",
  ),
  "@/lib/moderation/access": dataModule(
    "export async function requireNotRestricted(id) { const w = globalThis.__ci; w.log.push('requireNotRestricted:' + (id === w.user?.id ? 'me' : 'other'));\n" +
      "  return w.gate ? Response.json({ ok: false, error: 'Your account is restricted', code: w.gate }, { status: 403 }) : null; }\n" +
      "export function accountRestrictedResponse() { return Response.json({ ok: false, error: 'Your account is restricted', code: 'account_restricted' }, { status: 403 }); }",
  ),
};
/** The only "@/" modules that load for real. */
const REAL = new Set([
  "@/lib/events/checkin-route",
  "@/lib/events/event-checkin",
  "@/lib/events/event-item",
  "@/lib/limits/budgets",
  "@/lib/pgrest",
  "@/lib/auth/site-url",
  "@/lib/org-asset-url",
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      if (!REAL.has(specifier)) throw new Error(`checkin-routes.test.ts: add a stand-in for ${specifier}`);
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

// The canonical site, for every request that isn't from localhost.
process.env.NEXT_PUBLIC_SITE_URL = "https://www.connectvibe.app";

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";
const CODE = "4812";
const NEXT_CODE = "0937";
const TOKEN = "UVxxReBJ3ewsgZRtrv3ISQ";
const NEXT_TOKEN = "qlMyCJLtE-U9y9KYwGZWXQ";
const STARTS = "2026-10-19T23:00:00+00:00";
const ENDS = "2026-10-20T01:00:00+00:00";

type Answer = { data?: unknown; error?: { code: string; message: string } | null };
type RpcCall = { who: string; name: string; args: unknown };
type Query = { who: string; table: string; chain: unknown[][] };
type World = {
  log: string[];
  limits: { key: string; opts: unknown }[];
  rpcCalls: RpcCall[];
  queries: Query[];
  user: { id: string } | null;
  rl: { allowed: boolean; retryAfterSec: number; reason: "limited" | "unavailable" | null };
  /** The restriction gate's refusal code, or null to let through. */
  gate: string | null;
  serviceConfigured: boolean;
  rpc: Record<string, (args: unknown) => Answer>;
  /** What a `.from(table)` chain answers. */
  table: (q: Query) => Answer;
  client: (who: string) => unknown;
};

const BOOM = { code: "XX000", message: `boom for ${ME} with ${CODE} and ${TOKEN}` };

/** A PostgREST stand-in: every call lands in the log and is answered by the world. */
function fakeClient(world: World, who: string) {
  return {
    auth: {
      getUser: async () => {
        world.log.push("getUser");
        return world.user
          ? { data: { user: world.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } };
      },
    },
    rpc(name: string, args?: unknown) {
      world.log.push(`rpc:${who}:${name}`);
      world.rpcCalls.push({ who, name, args });
      const answer = world.rpc[name]?.(args) ?? { error: { code: "PGRST202", message: "no such function" } };
      return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
    },
    from(table: string) {
      world.log.push(`from:${who}:${table}`);
      const q: Query = { who, table, chain: [] };
      world.queries.push(q);
      const settle = () => Promise.resolve().then(() => {
        const a = world.table(q);
        return { data: a.data ?? null, error: a.error ?? null };
      });
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "delete", "in", "is", "order", "limit"]) {
        b[m] = (...a: unknown[]) => {
          q.chain.push([m, ...a]);
          return b;
        };
      }
      b.maybeSingle = () => {
        q.chain.push(["maybeSingle"]);
        return settle();
      };
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => settle().then(ok, bad);
      return b;
    },
  };
}

/** The event as RLS shows it, and its state row, unless a test says otherwise. */
const VISIBLE_EVENT = { id: EVENT, starts_at: STARTS, ends_at: ENDS };
const STATE_ROW = { event_id: EVENT, is_open: true, viewer_checked_in: true, checked_in_count: 7 };

const DEFAULT_RPC: World["rpc"] = {
  event_checkin_state: () => ({ data: [STATE_ROW] }),
  event_checkin_self_as: () => ({ data: "checked_in" }),
};

function setup(over: Partial<World> = {}): World {
  const world: World = {
    log: [],
    limits: [],
    rpcCalls: [],
    queries: [],
    user: { id: ME },
    rl: { allowed: true, retryAfterSec: 0, reason: null },
    gate: null,
    serviceConfigured: true,
    rpc: DEFAULT_RPC,
    table: (q) => (q.table === "events" ? { data: VISIBLE_EVENT } : { data: null }),
    client: (who) => fakeClient(world, who),
    ...over,
  };
  // A test's functions go on top of the defaults, not instead of them.
  if (over.rpc) world.rpc = { ...DEFAULT_RPC, ...over.rpc };
  (globalThis as unknown as { __ci: World }).__ci = world;
  return world;
}

// Every console.error line the routes write, for the last test's look.
const LOGGED: string[] = [];
console.error = (...parts: unknown[]) => {
  LOGGED.push(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" "));
};

const CHECKIN_ROUTE = "../../app/api/events/[id]/checkin/route.ts";
const DOOR_ROUTE = "../../app/api/events/[id]/checkin/door/route.ts";
const MARK_ROUTE = "../../app/api/events/[id]/checkin/marks/[userId]/route.ts";
const CLEAR_ROUTE = "../../app/api/events/[id]/checkin/marks/route.ts";
const ME_ROUTE = "../../app/api/me/event-checkins/route.ts";
const checkin = (await import(CHECKIN_ROUTE)) as typeof import("../../app/api/events/[id]/checkin/route");
const door = (await import(DOOR_ROUTE)) as typeof import("../../app/api/events/[id]/checkin/door/route");
const marks = (await import(MARK_ROUTE)) as typeof import("../../app/api/events/[id]/checkin/marks/[userId]/route");
const clear = (await import(CLEAR_ROUTE)) as typeof import("../../app/api/events/[id]/checkin/marks/route");
const mine = (await import(ME_ROUTE)) as typeof import("../../app/api/me/event-checkins/route");

const LOCAL = "http://localhost:3000";
const ctx = (id: string = EVENT) => ({ params: Promise.resolve({ id }) });
const markCtx = (id: string = EVENT, userId: string = OTHER) => ({ params: Promise.resolve({ id, userId }) });
const req = (method: string, body?: unknown, base = LOCAL) =>
  new Request(`${base}/api/events/${EVENT}/checkin`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

type Read = { status: number; body: Record<string, unknown>; text: string; headers: Headers };
async function read(res: Response): Promise<Read> {
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown>, text, headers: res.headers };
}
const post = async (body: unknown) => read(await checkin.POST(req("POST", body), ctx()));

const sharedModule = "./event-checkin.ts";
const { CHECKIN_ERRORS } = (await import(sharedModule)) as typeof import("./event-checkin");

/** The refusal shape: status, code, and (for check-in's own codes) the contract's sentence. */
function assertFail(r: Read, status: number, code: string) {
  assert.equal(r.status, status, r.text);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.code, code);
  assert.equal(typeof r.body.error, "string");
  if (code !== "account_restricted") {
    assert.equal(r.body.error, CHECKIN_ERRORS[code as keyof typeof CHECKIN_ERRORS], `the sentence for ${code}`);
  }
}

const noLimiter = (w: World) => assert.equal(w.log.some((l) => l.startsWith("limit:")), false, w.log.join(" > "));

// ── POST /api/events/[id]/checkin ───────────────────────────────────────────

test("POST: a malformed code is 400 checkin_code_format and costs no limiter try", async () => {
  for (const code of ["12a4", "123", "12345", "", "１２３４"]) {
    const w = setup();
    assertFail(await post({ code }), 400, "checkin_code_format");
    noLimiter(w);
    assert.deepEqual(w.rpcCalls, []);
  }
});

test("POST: a malformed token is 409 checkin_link_expired and costs no limiter try", async () => {
  for (const token of ["short", `${TOKEN}x`, "UVxxReBJ3ewsgZRtrv3IS=", ""]) {
    const w = setup();
    assertFail(await post({ token }), 409, "checkin_link_expired");
    noLimiter(w);
    assert.deepEqual(w.rpcCalls, []);
  }
});

test("POST: both fields, neither, or a body that isn't an object is 400 invalid_body; bad JSON is invalid_json", async () => {
  for (const body of [{ code: CODE, token: TOKEN }, {}, { code: 4812 }, [CODE], null, "4812", { token: null, code: null }]) {
    const w = setup();
    assertFail(await post(body), 400, "invalid_body");
    noLimiter(w);
  }
  const w = setup();
  assertFail(await read(await checkin.POST(req("POST", "{not json"), ctx())), 400, "invalid_json");
  noLimiter(w);
});

test("POST: spaces and dashes are dropped from a code; the other field goes as null", async () => {
  const w = setup();
  const r = await post({ code: " 48-1 2", token: 7 });
  assert.equal(r.status, 200, r.text);
  const call = w.rpcCalls.find((c) => c.name === "event_checkin_self_as");
  assert.deepEqual(call?.args, { p_user: ME, p_event_id: EVENT, p_code: CODE, p_token: null });
  const w2 = setup();
  await post({ token: TOKEN });
  assert.deepEqual(w2.rpcCalls.find((c) => c.name === "event_checkin_self_as")?.args, {
    p_user: ME,
    p_event_id: EVENT,
    p_code: null,
    p_token: TOKEN,
  });
});

test("POST: ids, sign-in, then the limiter, then the restriction gate, then the service-role check", async () => {
  const w = setup();
  const r = await post({ code: CODE });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(w.log.slice(0, 5), [
    "getUser",
    `limit:budget-eventCheckin:${ME}`,
    "requireNotRestricted:me",
    "service",
    "rpc:service:event_checkin_self_as",
  ]);
  assert.deepEqual(w.limits, [{ key: `budget-eventCheckin:${ME}`, opts: { limit: 20, windowSec: 86_400, failClosed: true } }]);
  // The state is read back on the viewer's own client, never the service one.
  const reads = w.rpcCalls.filter((c) => c.name === "event_checkin_state");
  assert.deepEqual(reads.map((c) => [c.who, c.args]), [["cookie", { p_event_ids: [EVENT] }]]);
  assert.deepEqual(w.queries.map((q) => [q.who, q.table]), [["cookie", "events"]]);
});

test("POST: a bad event id is 400 before sign-in; signed out is 401 before the body is read", async () => {
  const w = setup();
  assertFail(await read(await checkin.POST(req("POST", { code: CODE }), ctx("not-a-uuid"))), 400, "invalid_event_id");
  assert.deepEqual(w.log, []);
  const w2 = setup({ user: null });
  assertFail(await post({ code: "nope" }), 401, "unauthorized");
  assert.deepEqual(w2.log, ["getUser"]);
});

test("POST: the limiter's no is 429 checkin_too_many_tries, or checkin_unavailable when it can't count", async () => {
  const w = setup({ rl: { allowed: false, retryAfterSec: 3600, reason: "limited" } });
  const r = await post({ code: CODE });
  assertFail(r, 429, "checkin_too_many_tries");
  assert.equal(r.headers.get("retry-after"), "3600");
  assert.equal(w.log.includes("requireNotRestricted:me"), false);
  assert.deepEqual(w.rpcCalls, []);
  const w2 = setup({ rl: { allowed: false, retryAfterSec: 60, reason: "unavailable" } });
  assertFail(await post({ token: TOKEN }), 429, "checkin_unavailable");
  assert.deepEqual(w2.rpcCalls, []);
});

test("POST: the restriction gate's own answer goes back as it is, before the check", async () => {
  for (const code of ["terms_required", "account_restricted"]) {
    const w = setup({ gate: code });
    const r = await post({ code: CODE });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, code);
    assert.deepEqual(w.rpcCalls, []);
  }
});

test("POST: p_user is the signed-in account, never anything from the body", async () => {
  const w = setup();
  await post({ code: CODE, p_user: OTHER, user_id: OTHER, userId: OTHER, p_event_id: OTHER });
  const call = w.rpcCalls.find((c) => c.name === "event_checkin_self_as");
  assert.deepEqual(call?.args, { p_user: ME, p_event_id: EVENT, p_code: CODE, p_token: null });
});

test("POST: no service role configured is a 500 before the limiter, with no check (else it would read as busy)", async () => {
  const w = setup({ serviceConfigured: false });
  assertFail(await post({ code: CODE }), 500, "request_failed");
  assert.deepEqual(w.rpcCalls, []);
  noLimiter(w);
  assert.deepEqual(w.log, ["getUser"]);
  assert.equal(LOGGED.some((l) => l.includes("the service role isn't configured")), true);
});

test("POST: each word from event_checkin_self_as maps per contract 3.2", async () => {
  const cases: [string, number, string][] = [
    ["wrong_code", 400, "checkin_code_wrong"],
    ["link_expired", 409, "checkin_link_expired"],
    ["not_open", 409, "checkin_closed"],
    ["outside_window", 409, "checkin_outside_window"],
    ["not_found", 404, "not_found"],
    ["restricted", 403, "account_restricted"],
    ["terms_required", 403, "terms_required"],
    ["something_new", 500, "request_failed"],
  ];
  for (const [word, status, code] of cases) {
    setup({ rpc: { event_checkin_self_as: () => ({ data: word }) } });
    const r = await post({ code: CODE });
    assertFail(r, status, code);
    assert.equal(r.text.includes(CODE), false, `${word}: the typed code must not come back`);
  }
  setup({ rpc: { event_checkin_self_as: () => ({ error: BOOM }) } });
  assertFail(await post({ token: TOKEN }), 500, "request_failed");
});

test("POST: checked_in and already are 200 with the state read back; a failed read still says checked in", async () => {
  setup();
  const first = await post({ code: CODE });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, {
    ok: true,
    already: false,
    state: {
      event_id: EVENT,
      open: true,
      checked_in: true,
      count: 7,
      opens_at: "2026-10-19T22:00:00.000Z",
      closes_at: "2026-10-20T02:00:00.000Z",
    },
  });
  assert.equal(first.text.includes(CODE), false);
  setup({ rpc: { event_checkin_self_as: () => ({ data: "already" }) } });
  assert.equal((await post({ token: TOKEN })).body.already, true);

  for (const broken of [
    { rpc: { event_checkin_state: () => ({ error: BOOM }) } },
    { rpc: { event_checkin_state: () => ({ data: [] }) } },
    { table: () => ({ error: BOOM }) },
  ] as Partial<World>[]) {
    setup(broken);
    const r = await post({ token: TOKEN });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.text.includes(TOKEN), false);
    assert.deepEqual(r.body.state, { event_id: EVENT, open: true, checked_in: true, count: null, opens_at: "", closes_at: "" });
  }
});

// ── GET /api/events/[id]/checkin ────────────────────────────────────────────

const getState = async (id = EVENT) => read(await checkin.GET(req("GET"), ctx(id)));

test("GET: the viewer's state, on their own client, behind eventCheckinRead, never stored", async () => {
  const w = setup();
  const r = await getState();
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(r.body, {
    ok: true,
    state: { event_id: EVENT, open: true, checked_in: true, count: 7, opens_at: "2026-10-19T22:00:00.000Z", closes_at: "2026-10-20T02:00:00.000Z" },
  });
  assert.deepEqual(w.limits, [{ key: `budget-eventCheckinRead:${ME}`, opts: { limit: 1000, windowSec: 86_400 } }]);
  assert.equal(w.log[0], "getUser");
  assert.equal(w.log[1], `limit:budget-eventCheckinRead:${ME}`);
  assert.equal(w.log.includes("service"), false);
  assert.deepEqual(w.queries[0]?.chain, [["select", "id,starts_at,ends_at"], ["eq", "id", EVENT], ["maybeSingle"]]);
  // A count under the floor comes back as the database sent it: null.
  setup({ rpc: { event_checkin_state: () => ({ data: [{ ...STATE_ROW, checked_in_count: null, viewer_checked_in: false }] }) } });
  const low = await getState();
  assert.equal((low.body.state as Record<string, unknown>).count, null);
  assert.equal((low.body.state as Record<string, unknown>).checked_in, false);
});

test("GET: an event the viewer can't see, or no state row, is 404; a failed read is 500; all no-store", async () => {
  const cases: [Partial<World>, number, string][] = [
    [{ table: () => ({ data: null }) }, 404, "not_found"],
    [{ rpc: { event_checkin_state: () => ({ data: [] }) } }, 404, "not_found"],
    [{ rpc: { event_checkin_state: () => ({ data: [{ ...STATE_ROW, event_id: OTHER }] }) } }, 404, "not_found"],
    [{ table: () => ({ error: BOOM }) }, 500, "request_failed"],
    [{ rpc: { event_checkin_state: () => ({ error: BOOM }) } }, 500, "request_failed"],
    [{ user: null }, 401, "unauthorized"],
  ];
  for (const [over, status, code] of cases) {
    setup(over);
    const r = await getState();
    assertFail(r, status, code);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  setup();
  const bad = await getState("nope");
  assertFail(bad, 400, "invalid_event_id");
  assert.equal(bad.headers.get("cache-control"), "no-store");
  setup({ rl: { allowed: false, retryAfterSec: 120, reason: "limited" } });
  const busy = await getState();
  assert.equal(busy.status, 429);
  assert.deepEqual(busy.body, { ok: false, error: "Too many check-in requests. Try again in a few minutes." });
  assert.equal(busy.headers.get("cache-control"), "no-store");
});

/** An id with letters in it, so upper and lower case differ. */
const LETTERED = "abcdef12-3456-4789-8abc-def012345678";

test("GET: an id typed in upper case still finds its row (isUuid takes either case; the database answers lower case)", async () => {
  const w = setup({
    table: () => ({ data: { ...VISIBLE_EVENT, id: LETTERED } }),
    rpc: { event_checkin_state: () => ({ data: [{ ...STATE_ROW, event_id: LETTERED }] }) },
  });
  const r = await getState(LETTERED.toUpperCase());
  assert.equal(r.status, 200, r.text);
  assert.equal((r.body.state as Record<string, unknown>).event_id, LETTERED);
  assert.deepEqual(w.queries[0]?.chain, [["select", "id,starts_at,ends_at"], ["eq", "id", LETTERED], ["maybeSingle"]]);
});

// ── DELETE /api/events/[id]/checkin ─────────────────────────────────────────

const remove = async () => read(await checkin.DELETE(req("DELETE"), ctx()));

test("DELETE: removes only the viewer's own row on their own client, with no Terms or restriction gate", async () => {
  const w = setup({ gate: "account_restricted" });
  const r = await remove();
  assert.equal(r.status, 200, r.text);
  assert.equal(w.log.some((l) => l.startsWith("requireNotRestricted")), false);
  assert.equal(w.log.includes("service"), false);
  assert.deepEqual(w.limits, [{ key: `budget-eventCheckinRemove:${ME}`, opts: { limit: 60, windowSec: 86_400 } }]);
  const del = w.queries.find((q) => q.table === "event_checkins");
  assert.equal(del?.who, "cookie");
  assert.deepEqual(del?.chain, [["delete"], ["eq", "event_id", EVENT], ["eq", "user_id", ME]]);
  assert.equal((r.body.state as Record<string, unknown>).event_id, EVENT);
});

test("DELETE: state is null when the event can't be seen any more; a failed delete is 500", async () => {
  setup({ table: (q) => (q.table === "events" ? { data: null } : { data: null }) });
  const gone = await remove();
  assert.equal(gone.status, 200);
  assert.deepEqual(gone.body, { ok: true, state: null });
  setup({ table: (q) => (q.table === "event_checkins" ? { error: BOOM } : { data: VISIBLE_EVENT }) });
  assertFail(await remove(), 500, "request_failed");
  const w = setup({ rl: { allowed: false, retryAfterSec: 30, reason: "limited" } });
  assert.equal((await remove()).status, 429);
  assert.deepEqual(w.queries, []);
});

// ── /api/events/[id]/checkin/door ───────────────────────────────────────────

/** event_checkin_door's jsonb while open, as Postgres writes it (+00:00, microseconds). */
const DOOR_OPEN = {
  status: "ok",
  is_open: true,
  opens_at: "2026-10-19T22:00:00+00:00",
  closes_at: "2026-10-20T02:00:00+00:00",
  server_now: "2026-10-19T23:10:12.345678+00:00",
  step_starts_at: "2026-10-19T23:10:00+00:00",
  step_ends_at: "2026-10-19T23:10:30+00:00",
  next_ends_at: "2026-10-19T23:11:00+00:00",
  code: CODE,
  token: TOKEN,
  next_code: NEXT_CODE,
  next_token: NEXT_TOKEN,
  here_count: 3,
};
const DOOR_CLOSED = {
  ...DOOR_OPEN,
  is_open: false,
  step_starts_at: null,
  step_ends_at: null,
  next_ends_at: null,
  code: null,
  token: null,
  next_code: null,
  next_token: null,
};
const doorReq = (method: string, base = LOCAL) => new Request(`${base}/api/events/${EVENT}/checkin/door`, { method });
const doorWorld = (json: unknown, over: Partial<World> = {}) =>
  setup({ ...over, rpc: { event_checkin_door: () => ({ data: json }), ...over.rpc } });

test("door GET: the feed, behind eventCheckinDoor, on the officer's own client, never stored", async () => {
  const w = doorWorld(DOOR_OPEN);
  const r = await read(await door.GET(doorReq("GET"), ctx()));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(w.limits, [{ key: `budget-eventCheckinDoor:${ME}`, opts: { limit: 180, windowSec: 600 } }]);
  assert.deepEqual(w.rpcCalls, [{ who: "cookie", name: "event_checkin_door", args: { p_event_id: EVENT } }]);
  const page = `${LOCAL}/campus/checkin/${EVENT}?checkin=`;
  assert.deepEqual(r.body, {
    ok: true,
    door: {
      event_id: EVENT,
      open: true,
      opens_at: "2026-10-19T22:00:00.000Z",
      closes_at: "2026-10-20T02:00:00.000Z",
      server_now: "2026-10-19T23:10:12.345Z",
      current: { code: CODE, link: page + TOKEN, starts_at: "2026-10-19T23:10:00.000Z", ends_at: "2026-10-19T23:10:30.000Z" },
      next: { code: NEXT_CODE, link: page + NEXT_TOKEN, starts_at: "2026-10-19T23:10:30.000Z", ends_at: "2026-10-19T23:11:00.000Z" },
      count: 3,
    },
  });
});

test("door: the links come from localhost on a localhost request, else the site's own address, never the Host", async () => {
  for (const base of ["https://evil.example", "https://connectvibe-git-x.vercel.app"]) {
    doorWorld(DOOR_OPEN);
    const r = await read(await door.GET(doorReq("GET", base), ctx()));
    const feed = r.body.door as { current: { link: string }; next: { link: string } };
    assert.equal(feed.current.link, `https://www.connectvibe.app/campus/checkin/${EVENT}?checkin=${TOKEN}`);
    assert.equal(feed.next.link, `https://www.connectvibe.app/campus/checkin/${EVENT}?checkin=${NEXT_TOKEN}`);
  }
  doorWorld(DOOR_OPEN);
  const local = await read(await door.GET(doorReq("GET", "http://127.0.0.1:3000"), ctx()));
  assert.equal((local.body.door as { current: { link: string } }).current.link.startsWith("http://127.0.0.1:3000/campus/checkin/"), true);
});

test("door: not open means no codes at all; a missing next step leaves next null", async () => {
  doorWorld(DOOR_CLOSED);
  const r = await read(await door.GET(doorReq("GET"), ctx()));
  const feed = r.body.door as Record<string, unknown>;
  assert.equal(feed.open, false);
  assert.equal(feed.current, null);
  assert.equal(feed.next, null);
  assert.equal(feed.count, 3);
  assert.equal(r.text.includes(CODE) || r.text.includes(TOKEN), false);
  // Codes sent while is_open is false are still not shown.
  doorWorld({ ...DOOR_OPEN, is_open: false });
  const stale = await read(await door.GET(doorReq("GET"), ctx()));
  assert.equal(stale.text.includes(CODE) || stale.text.includes(TOKEN), false);
  doorWorld({ ...DOOR_OPEN, next_code: null, next_token: null, here_count: "x" });
  const half = (await read(await door.GET(doorReq("GET"), ctx()))).body.door as Record<string, unknown>;
  assert.equal((half.current as { code: string }).code, CODE);
  assert.equal(half.next, null);
  assert.equal(half.count, 0);
});

test("door: each status maps per contract 3.3; a broken answer is 500; every GET says no-store", async () => {
  const cases: [unknown, number, string][] = [
    [{ status: "not_found" }, 404, "not_found"],
    [{ status: "not_manager" }, 403, "org_role_required"],
    [{ status: "restricted" }, 403, "account_restricted"],
    [{ status: "org_hidden" }, 403, "org_hidden"],
    [{ status: "what" }, 500, "request_failed"],
    ["ok", 500, "request_failed"],
    [null, 500, "request_failed"],
  ];
  for (const [json, status, code] of cases) {
    doorWorld(json);
    const r = await read(await door.GET(doorReq("GET"), ctx()));
    assertFail(r, status, code);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  setup({ rpc: { event_checkin_door: () => ({ error: BOOM }) } });
  assertFail(await read(await door.GET(doorReq("GET"), ctx())), 500, "request_failed");
  setup();
  assertFail(await read(await door.GET(doorReq("GET"), ctx("x"))), 400, "invalid_event_id");
  setup({ rl: { allowed: false, retryAfterSec: 90, reason: "limited" } });
  const busy = await read(await door.GET(doorReq("GET"), ctx()));
  assert.equal(busy.status, 429);
  assert.equal(busy.body.code, undefined);
  assert.equal(busy.headers.get("cache-control"), "no-store");
});

test("door POST: orgOfficer, then the restriction gate, then open, then the door read", async () => {
  for (const word of ["open", "already_open"]) {
    const w = doorWorld(DOOR_OPEN, { rpc: { event_checkin_open: () => ({ data: word }) } });
    const r = await read(await door.POST(doorReq("POST"), ctx()));
    assert.equal(r.status, 200, r.text);
    assert.equal((r.body.door as { open: boolean }).open, true);
    assert.deepEqual(w.log, [
      "getUser",
      `limit:budget-orgOfficer:${ME}`,
      "requireNotRestricted:me",
      "rpc:cookie:event_checkin_open",
      "rpc:cookie:event_checkin_door",
    ]);
    assert.deepEqual(w.limits[0]?.opts, { limit: 300, windowSec: 600 });
    assert.deepEqual(w.rpcCalls[0]?.args, { p_event_id: EVENT });
  }
});

test("door POST: each refusal maps, with no door read; a restricted officer can't start", async () => {
  const cases: [string, number, string][] = [
    ["outside_window", 409, "checkin_outside_window"],
    ["org_hidden", 403, "org_hidden"],
    ["not_manager", 403, "org_role_required"],
    ["not_found", 404, "not_found"],
    ["restricted", 403, "account_restricted"],
    ["huh", 500, "request_failed"],
  ];
  for (const [word, status, code] of cases) {
    const w = doorWorld(DOOR_OPEN, { rpc: { event_checkin_open: () => ({ data: word }) } });
    assertFail(await read(await door.POST(doorReq("POST"), ctx())), status, code);
    assert.equal(w.log.includes("rpc:cookie:event_checkin_door"), false);
  }
  const w = doorWorld(DOOR_OPEN, { gate: "account_restricted" });
  const r = await read(await door.POST(doorReq("POST"), ctx()));
  assert.equal(r.status, 403);
  assert.deepEqual(w.rpcCalls, []);
});

test("door DELETE: the route adds no restriction gate (the proxy's refusal is its own layer), and answers the closed feed", async () => {
  const w = doorWorld(DOOR_CLOSED, { gate: "account_restricted", rpc: { event_checkin_close: () => ({ data: "closed" }) } });
  const r = await read(await door.DELETE(doorReq("DELETE"), ctx()));
  assert.equal(r.status, 200, r.text);
  assert.equal((r.body.door as { open: boolean }).open, false);
  assert.deepEqual(w.log, [
    "getUser",
    `limit:budget-orgOfficer:${ME}`,
    "rpc:cookie:event_checkin_close",
    "rpc:cookie:event_checkin_door",
  ]);
  for (const [word, status, code] of [
    ["not_found", 404, "not_found"],
    ["not_manager", 403, "org_role_required"],
    ["???", 500, "request_failed"],
  ] as [string, number, string][]) {
    doorWorld(DOOR_CLOSED, { rpc: { event_checkin_close: () => ({ data: word }) } });
    assertFail(await read(await door.DELETE(doorReq("DELETE"), ctx())), status, code);
  }
  setup({ rpc: { event_checkin_close: () => ({ error: BOOM }) } });
  assertFail(await read(await door.DELETE(doorReq("DELETE"), ctx())), 500, "request_failed");
});

test("door DELETE: once close says closed, a door read that refuses or fails still answers 200 with a closed feed", async () => {
  // A club hidden since Start, a restricted officer the proxy's fast check
  // missed, a failed read: the session IS gone, so Stop must not answer a
  // refusal (a refusal from Stop means "not stopped").
  const reads: Answer[] = [
    { data: { status: "org_hidden" } },
    { data: { status: "restricted" } },
    { data: { status: "not_found" } },
    { data: null },
    { error: BOOM },
  ];
  for (const answer of reads) {
    const w = setup({ rpc: { event_checkin_close: () => ({ data: "closed" }), event_checkin_door: () => answer } });
    const before = Date.now();
    const r = await read(await door.DELETE(doorReq("DELETE"), ctx()));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const feed = r.body.door as Record<string, unknown>;
    assert.deepEqual({ ...feed, server_now: "" }, {
      event_id: EVENT,
      open: false,
      opens_at: "",
      closes_at: "",
      server_now: "",
      current: null,
      next: null,
      count: 0,
    });
    // The route's own clock, so the screen's skew stays a number.
    const t = Date.parse(feed.server_now as string);
    assert.ok(Number.isFinite(t) && t >= before - 1000 && t <= Date.now() + 1000, String(feed.server_now));
    assert.deepEqual(w.log.slice(-2), ["rpc:cookie:event_checkin_close", "rpc:cookie:event_checkin_door"]);
  }
});

test("not_manager: 403 org_role_required for an event the caller can see, 404 for one RLS hides; every officer call", async () => {
  // Each officer call, and how it answers not_manager. (Its own request
  // builder: markReq is declared further down the file.)
  const officerReq = (method: string) => new Request(`${LOCAL}/api/events/${EVENT}/checkin/marks/${OTHER}`, { method });
  const calls: [string, Partial<World>["rpc"], () => Promise<Response>][] = [
    ["door GET", { event_checkin_door: () => ({ data: { status: "not_manager" } }) }, () => door.GET(doorReq("GET"), ctx())],
    ["door POST", { event_checkin_open: () => ({ data: "not_manager" }) }, () => door.POST(doorReq("POST"), ctx())],
    ["door DELETE", { event_checkin_close: () => ({ data: "not_manager" }) }, () => door.DELETE(doorReq("DELETE"), ctx())],
    ["mark", { event_checkin_mark: () => ({ data: "not_manager" }) }, () => marks.PUT(officerReq("PUT"), markCtx())],
    ["unmark", { event_checkin_unmark: () => ({ data: "not_manager" }) }, () => marks.DELETE(officerReq("DELETE"), markCtx())],
    ["clear", { event_checkin_clear: () => ({ data: { status: "not_manager" } }) }, () => clear.DELETE(officerReq("DELETE"), ctx())],
  ];
  for (const [name, rpc, call] of calls) {
    const seen = setup({ rpc });
    assertFail(await read(await call()), 403, "org_role_required");
    const q = seen.queries.find((x) => x.table === "events");
    assert.deepEqual([q?.who, q?.chain], ["cookie", [["select", "id"], ["eq", "id", EVENT], ["maybeSingle"]]], name);
    // Nothing after the refusal: no door read follows a refused open or close.
    assert.equal(seen.rpcCalls.length, 1, `${name}: ${seen.log.join(" > ")}`);

    setup({ rpc, table: () => ({ data: null }) });
    assertFail(await read(await call()), 404, "not_found");
    setup({ rpc, table: () => ({ error: BOOM }) });
    assertFail(await read(await call()), 500, "request_failed");
  }
  // An officer's call never pays for the extra read.
  const w = doorWorld(DOOR_OPEN);
  await door.GET(doorReq("GET"), ctx());
  assert.deepEqual(w.queries, []);
});

// ── /api/events/[id]/checkin/marks[/userId] ─────────────────────────────────

const markReq = (method: string) => new Request(`${LOCAL}/api/events/${EVENT}/checkin/marks/${OTHER}`, { method });

test("marks: both ids are checked first, the event's before the person's", async () => {
  for (const handler of [marks.PUT, marks.DELETE]) {
    const w = setup();
    assertFail(await read(await handler(markReq("PUT"), markCtx("x", "y"))), 400, "invalid_event_id");
    assertFail(await read(await handler(markReq("PUT"), markCtx(EVENT, "y"))), 400, "invalid_user_id");
    assert.deepEqual(w.log, []);
  }
});

test("marks PUT: orgOfficer, the restriction gate, then event_checkin_mark; marked and already are checked_in", async () => {
  for (const word of ["marked", "already"]) {
    const w = setup({ rpc: { event_checkin_mark: () => ({ data: word }) } });
    const r = await read(await marks.PUT(markReq("PUT"), markCtx()));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body, { ok: true, user_id: OTHER, checked_in: true });
    assert.deepEqual(w.log, ["getUser", `limit:budget-orgOfficer:${ME}`, "requireNotRestricted:me", "rpc:cookie:event_checkin_mark"]);
    assert.deepEqual(w.rpcCalls[0]?.args, { p_event_id: EVENT, p_user_id: OTHER });
  }
  const w = setup({ gate: "account_restricted" });
  assert.equal((await marks.PUT(markReq("PUT"), markCtx())).status, 403);
  assert.deepEqual(w.rpcCalls, []);
  // Upper-case ids reach the database, and come back, in lower case.
  const up = setup({ rpc: { event_checkin_mark: () => ({ data: "marked" }) } });
  const r = await read(await marks.PUT(markReq("PUT"), markCtx(LETTERED.toUpperCase(), LETTERED.toUpperCase())));
  assert.deepEqual(r.body, { ok: true, user_id: LETTERED, checked_in: true });
  assert.deepEqual(up.rpcCalls[0]?.args, { p_event_id: LETTERED, p_user_id: LETTERED });
});

test("marks PUT: each refusal maps per contract 3.4", async () => {
  const cases: [string, number, string][] = [
    ["outside_window", 409, "checkin_mark_window"],
    ["not_on_list", 409, "checkin_not_on_list"],
    ["not_found", 404, "not_found"],
    ["not_manager", 403, "org_role_required"],
    ["restricted", 403, "account_restricted"],
    ["org_hidden", 403, "org_hidden"],
    ["removed", 500, "request_failed"],
  ];
  for (const [word, status, code] of cases) {
    setup({ rpc: { event_checkin_mark: () => ({ data: word }) } });
    assertFail(await read(await marks.PUT(markReq("PUT"), markCtx())), status, code);
  }
  setup({ rpc: { event_checkin_mark: () => ({ error: BOOM }) } });
  assertFail(await read(await marks.PUT(markReq("PUT"), markCtx())), 500, "request_failed");
});

test("marks DELETE: takes one off with no restriction gate; not_found and not_manager map", async () => {
  const w = setup({ gate: "account_restricted", rpc: { event_checkin_unmark: () => ({ data: "removed" }) } });
  const r = await read(await marks.DELETE(markReq("DELETE"), markCtx()));
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body, { ok: true, user_id: OTHER, checked_in: false });
  assert.deepEqual(w.log, ["getUser", `limit:budget-orgOfficer:${ME}`, "rpc:cookie:event_checkin_unmark"]);
  assert.deepEqual(w.rpcCalls[0]?.args, { p_event_id: EVENT, p_user_id: OTHER });
  for (const [word, status, code] of [
    ["not_found", 404, "not_found"],
    ["not_manager", 403, "org_role_required"],
    ["restricted", 500, "request_failed"],
  ] as [string, number, string][]) {
    setup({ rpc: { event_checkin_unmark: () => ({ data: word }) } });
    assertFail(await read(await marks.DELETE(markReq("DELETE"), markCtx())), status, code);
  }
});

test("clear: answers how many went, with no restriction gate; refusals map", async () => {
  const clearReq = () => new Request(`${LOCAL}/api/events/${EVENT}/checkin/marks`, { method: "DELETE" });
  const w = setup({ gate: "account_restricted", rpc: { event_checkin_clear: () => ({ data: { status: "cleared", cleared: 12 } }) } });
  const r = await read(await clear.DELETE(clearReq(), ctx()));
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body, { ok: true, cleared: 12 });
  assert.deepEqual(w.log, ["getUser", `limit:budget-orgOfficer:${ME}`, "rpc:cookie:event_checkin_clear"]);
  assert.deepEqual(w.rpcCalls[0]?.args, { p_event_id: EVENT });
  const cases: [unknown, number, string][] = [
    [{ status: "not_found" }, 404, "not_found"],
    [{ status: "not_manager" }, 403, "org_role_required"],
    [{ status: "restricted" }, 500, "request_failed"],
    ["cleared", 500, "request_failed"],
  ];
  for (const [json, status, code] of cases) {
    setup({ rpc: { event_checkin_clear: () => ({ data: json }) } });
    assertFail(await read(await clear.DELETE(clearReq(), ctx())), status, code);
  }
  setup();
  assertFail(await read(await clear.DELETE(clearReq(), ctx("x"))), 400, "invalid_event_id");
});

// ── GET /api/me/event-checkins ──────────────────────────────────────────────

test("me: the caller's own list, behind eventCheckinRead, with org null for an org-less event", async () => {
  const rows = [
    { event_id: EVENT, title: "Fall Formal", starts_at: STARTS, ends_at: ENDS, org_name: "Chat Seed Club", org_handle: "chat_seed_club" },
    { event_id: OTHER, title: "Study night", starts_at: STARTS, ends_at: ENDS, org_name: null, org_handle: null },
    { event_id: 5, title: "broken" },
    null,
  ];
  const w = setup({ rpc: { event_checkin_mine: () => ({ data: rows }) } });
  const r = await read(await mine.GET());
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(r.body, {
    ok: true,
    checkins: [
      { event_id: EVENT, title: "Fall Formal", starts_at: STARTS, ends_at: ENDS, org: { name: "Chat Seed Club", handle: "chat_seed_club" } },
      { event_id: OTHER, title: "Study night", starts_at: STARTS, ends_at: ENDS, org: null },
    ],
  });
  assert.deepEqual(w.log, ["getUser", `limit:budget-eventCheckinRead:${ME}`, "rpc:cookie:event_checkin_mine"]);
  for (const over of [{ user: null }, { rpc: { event_checkin_mine: () => ({ error: BOOM }) } }] as Partial<World>[]) {
    setup(over);
    const bad = await read(await mine.GET());
    assert.equal(bad.status === 401 || bad.status === 500, true);
    assert.equal(bad.headers.get("cache-control"), "no-store");
  }
});

// ── Last: nothing private in a log line ─────────────────────────────────────

test("no log line holds a code, a token or a user id (the database's message is never logged)", () => {
  assert.ok(LOGGED.length > 0, "the failing cases above logged something");
  for (const line of LOGGED) {
    for (const secret of [ME, OTHER, CODE, NEXT_CODE, TOKEN, NEXT_TOKEN]) {
      assert.equal(line.includes(secret), false, `a log line holds ${secret}: ${line}`);
    }
  }
});
