/**
 * GET /api/events/[id]/attendees with event check-in (Oct 19 2026, contract
 * 3.6 and section 6), driven end to end against fakes:
 *   - the eventAttendeesRead limiter runs right after getUser, before any
 *     read, at 240 per 10 minutes per account;
 *   - someone who doesn't manage the event gets 403 before any RSVP or
 *     check-in read;
 *   - each Going / Interested row says whether that person checked in;
 *     walk-ins are the check-ins without a Going or Interested RSVP;
 *   - checkin.count is the state RPC's exact number (the rows read only when
 *     it has none); a failed check-in read is a 500, like a failed RSVP read,
 *     except a database without check-in yet, where nobody checked in;
 *   - an upper-case id still finds its state row;
 *   - every answer says Cache-Control: no-store (the 429 too), and no log
 *     line holds an id.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/attendees-route.test.ts
 *
 * WHY THE RESOLVE HOOK (as social-limits.test.ts): the route imports
 * "next/server", the cookie client and the limiter; each resolves to a small
 * data: module that reads its fake from globalThis and writes to one log, so
 * the log is everything the route did, in order. budgets.ts, pgrest and
 * event-checkin.ts are the real code. It lives here, not next to the route:
 * `node --test` reads its arguments as globs, and `[id]` never matches.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("attendees-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export class NextResponse extends Response {\n" +
      "  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }\n" +
      "}",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__att.cookie; }"),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { const w = globalThis.__att; w.log.push('limit:' + key); w.limits.push({ key, opts });\n" +
      "  return w.allow ? { allowed: true, retryAfterSec: 0, reason: null } : { allowed: false, retryAfterSec: 240, reason: 'limited' }; }\n" +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.', code) {\n" +
      "  return new Response(JSON.stringify(code ? { ok: false, code, error: message } : { ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }",
  ),
};
/** The only "@/" modules that load for real. */
const REAL = new Set(["@/lib/limits/budgets", "@/lib/pgrest", "@/lib/events/event-checkin"]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      if (!REAL.has(specifier)) throw new Error(`attendees-route.test.ts: add a stand-in for ${specifier}`);
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const routeSpecifier = "../../app/api/events/[id]/attendees/route.ts";
const { GET } = (await import(routeSpecifier)) as typeof import("../../app/api/events/[id]/attendees/route");
type AttendeesResponse = import("./event-checkin").AttendeesResponse;

// ── The world: one event, its RSVPs and its check-ins ───────────────────────

const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const uid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, name: string) => ({ id: uid(n), name, handle: name.toLowerCase(), avatar_url: null, major: null, year: null });
const EV_ROW = { id: EVENT, starts_at: "2026-10-20T23:00:00+00:00", ends_at: "2026-10-21T02:00:00+00:00" };

type Err = { code: string; message: string };
type World = {
  user?: { id: string } | null;
  allow?: boolean;
  event?: Record<string, unknown> | null;
  canManage?: unknown;
  rsvps?: { status: string; created_at: string; user: ReturnType<typeof person> | null }[];
  checkins?: { user_id: string; user: ReturnType<typeof person> | null }[];
  state?: unknown[];
  rsvpError?: Err;
  checkinError?: Err;
  stateError?: Err;
};
type Call = [string, ...unknown[]];

function setup(w: World) {
  const log: string[] = [];
  const limits: { key: string; opts: unknown }[] = [];
  const calls: Record<string, Call[]> = {};
  const answer = (table: string): { data: unknown; error: unknown } => {
    log.push(`read:${table}`);
    if (table === "events") return { data: w.event === undefined ? EV_ROW : w.event, error: null };
    if (table === "rsvps") return { data: w.rsvps ?? [], error: w.rsvpError ?? null };
    if (table === "event_checkins") return { data: w.checkins ?? [], error: w.checkinError ?? null };
    throw new Error(`unexpected read of ${table}`);
  };
  const chain = (table: string) => {
    const mine: Call[] = (calls[table] = []);
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "order", "limit"]) {
      builder[name] = (...args: unknown[]) => {
        mine.push([name, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve().then(() => answer(table));
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve().then(() => answer(table)).then(resolve, reject);
    return builder;
  };
  const cookie = {
    auth: {
      getUser: async () => {
        log.push("getUser");
        return { data: { user: w.user === undefined ? { id: ME } : w.user }, error: null };
      },
    },
    from: (table: string) => chain(table),
    rpc: async (name: string, args: unknown) => {
      log.push(`rpc:${name}`);
      calls[`rpc:${name}`] = [["args", args]];
      if (name === "can_manage_event") return { data: w.canManage === undefined ? true : w.canManage, error: null };
      if (name === "event_checkin_state") return { data: w.state ?? [], error: w.stateError ?? null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  (globalThis as unknown as { __att: unknown }).__att = { cookie, log, limits, allow: w.allow ?? true };
  return { log, limits, calls };
}

const get = (id = EVENT) => GET(new Request(`http://vibe.test/api/events/${id}/attendees`), { params: Promise.resolve({ id }) });
const body = async (res: Response) => (await res.json()) as AttendeesResponse & { error?: string };
/** Silence the route's error logs, and keep them to check. */
function errors(t: TestContext): unknown[][] {
  const seen: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    seen.push(args);
  });
  return seen;
}

// ── Order and gates ─────────────────────────────────────────────────────────

test("the eventAttendeesRead limiter runs right after getUser, before any read", async () => {
  const { log, limits } = setup({});
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(log.slice(0, 3), ["getUser", `limit:budget-eventAttendeesRead:${ME}`, "read:events"]);
  assert.deepEqual(limits, [{ key: `budget-eventAttendeesRead:${ME}`, opts: { limit: 240, windowSec: 600 } }]);
});

test("a refused limiter: 429 with the shared line and no code, and nothing read", async () => {
  const { log } = setup({ allow: false });
  const res = await get();
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { ok: false, error: "Too many check-in requests. Try again in a few minutes." });
  assert.equal(res.headers.get("retry-after"), "240");
  assert.deepEqual(log, ["getUser", `limit:budget-eventAttendeesRead:${ME}`]);
});

test("a bad id is 400 before sign-in; signed out is 401 before the limiter", async () => {
  const bad = setup({});
  const res = await get("not-a-uuid");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { ok: false, error: "Missing event id" });
  assert.deepEqual(bad.log, []);
  const out = setup({ user: null });
  assert.equal((await get()).status, 401);
  assert.deepEqual(out.log, ["getUser"]);
});

test("someone who doesn't manage the event: 403 before any RSVP or check-in read", async () => {
  const { log } = setup({ canManage: false });
  const res = await get();
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false, error: "Forbidden" });
  assert.deepEqual(log, ["getUser", `limit:budget-eventAttendeesRead:${ME}`, "read:events", "rpc:can_manage_event"]);
});

test("a missing event is 404, before the gate", async () => {
  const { log } = setup({ event: null });
  const res = await get();
  assert.equal(res.status, 404);
  assert.deepEqual(log, ["getUser", `limit:budget-eventAttendeesRead:${ME}`, "read:events"]);
});

test("the reads: the event's times, the RSVPs, the check-ins (capped) and the state, all for this event", async () => {
  const { log, calls } = setup({});
  await get();
  assert.deepEqual(calls.events?.slice(0, 2), [["select", "id,starts_at,ends_at"], ["eq", "id", EVENT]]);
  assert.deepEqual(calls.event_checkins, [
    ["select", "user_id,user:users!event_checkins_user_id_fkey!inner(id,name,handle,avatar_url,major,year)"],
    ["eq", "event_id", EVENT],
    ["limit", 1000],
  ]);
  assert.deepEqual(calls["rpc:event_checkin_state"], [["args", { p_event_ids: [EVENT] }]]);
  assert.deepEqual(log.slice(4).sort(), ["read:event_checkins", "read:rsvps", "rpc:event_checkin_state"]);
});

// ── The answer ──────────────────────────────────────────────────────────────

const GOING_IN = person(1, "Ana");
const GOING_OUT = person(2, "Ben");
const MAYBE_IN = person(3, "Cy");
const MAYBE_OUT = person(4, "Dee");
const SAID_NO = person(5, "Eve");
const WALK_Z = person(6, "Zed");
const WALK_A = person(7, "Abe");
const RSVPS = [
  { status: "going", created_at: "2026-10-19T10:00:00+00:00", user: GOING_IN },
  { status: "going", created_at: "2026-10-19T11:00:00+00:00", user: GOING_OUT },
  { status: "maybe", created_at: "2026-10-19T12:00:00+00:00", user: MAYBE_IN },
  { status: "maybe", created_at: "2026-10-19T13:00:00+00:00", user: MAYBE_OUT },
  { status: "no", created_at: "2026-10-19T14:00:00+00:00", user: SAID_NO },
  { status: "going", created_at: "2026-10-19T15:00:00+00:00", user: null },
];
const CHECKINS = [WALK_Z, GOING_IN, SAID_NO, MAYBE_IN, WALK_A].map((u) => ({ user_id: u.id, user: u }));

test("each Going and Interested row says whether that person checked in; walk-ins exclude RSVP holders", async () => {
  setup({ rsvps: RSVPS, checkins: CHECKINS, state: [{ event_id: EVENT, is_open: true, viewer_checked_in: false, checked_in_count: 5 }] });
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const b = await body(res);
  assert.equal(b.ok, true);
  assert.deepEqual(b.going.map((a) => [a.user.id, a.status, a.checked_in]), [[GOING_IN.id, "going", true], [GOING_OUT.id, "going", false]]);
  assert.deepEqual(b.interested.map((a) => [a.user.id, a.status, a.checked_in]), [[MAYBE_IN.id, "maybe", true], [MAYBE_OUT.id, "maybe", false]]);
  // "Can't go" who came anyway is a walk-in; walk-ins come sorted by name.
  assert.deepEqual(b.walk_ins.map((a) => a.user.name), ["Abe", "Eve", "Zed"]);
  for (const w of b.walk_ins) assert.deepEqual([w.status, w.created_at, w.checked_in], [null, null, true]);
  assert.deepEqual(Object.keys(b.going[0] ?? {}), ["status", "created_at", "checked_in", "user"]);
  assert.deepEqual(b.going[0]?.user, GOING_IN);
  assert.deepEqual(b.checkin, { open: true, count: 5, starts_at: EV_ROW.starts_at, ends_at: EV_ROW.ends_at });
  assert.deepEqual(Object.keys(b), ["ok", "going", "interested", "walk_ins", "checkin"]);
});

test("checkin.count is the state RPC's exact number; the rows read only when it has none", async () => {
  setup({ checkins: CHECKINS.slice(0, 2), state: [{ event_id: EVENT, is_open: false, viewer_checked_in: false, checked_in_count: 9 }] });
  assert.equal((await body(await get())).checkin.count, 9);
  setup({ checkins: CHECKINS.slice(0, 2), state: [{ event_id: EVENT, is_open: true, checked_in_count: null }] });
  assert.deepEqual((await body(await get())).checkin, { open: true, count: 2, starts_at: EV_ROW.starts_at, ends_at: EV_ROW.ends_at });
  setup({ checkins: CHECKINS.slice(0, 3), state: [] });
  const none = await body(await get());
  assert.deepEqual([none.checkin.open, none.checkin.count], [false, 3], "no state row: not open, the rows read");
  setup({ checkins: [], state: [{ event_id: "eeeeeeee-0000-4000-8000-000000000002", is_open: true, checked_in_count: 8 }] });
  assert.deepEqual((await body(await get())).checkin.count, 0, "another event's row is never this one's");
});

test("nobody yet: the old lists, every row not checked in, no walk-ins, count 0", async () => {
  setup({ rsvps: RSVPS, state: [{ event_id: EVENT, is_open: false, checked_in_count: 0 }] });
  const b = await body(await get());
  assert.equal(b.going.length + b.interested.length, 4);
  assert.ok([...b.going, ...b.interested].every((a) => a.checked_in === false));
  assert.deepEqual(b.walk_ins, []);
  assert.equal(b.checkin.count, 0);
});

// ── Failures ────────────────────────────────────────────────────────────────

test("a failed check-in read or state read is a 500, logged with the code only", async (t) => {
  const seen = errors(t);
  for (const fault of [
    { checkinError: { code: "57014", message: `canceling statement due to statement timeout (${EVENT})` } },
    { stateError: { code: "XX000", message: `event_checkin_state(${EVENT}) failed for ${ME}` } },
    { rsvpError: { code: "XX000", message: "boom" } },
  ] as Partial<World>[]) {
    setup({ rsvps: RSVPS, checkins: CHECKINS, ...fault });
    const res = await get();
    assert.equal(res.status, 500, JSON.stringify(fault));
    assert.deepEqual(await res.json(), { ok: false, error: "Request failed" });
  }
  const checkinLogs = seen.filter((args) => String(args[0]).includes("checkin"));
  assert.equal(checkinLogs.length, 2);
  for (const args of checkinLogs) {
    const line = JSON.stringify(args);
    assert.equal(line.includes(EVENT), false, `no event id in ${line}`);
    assert.equal(line.includes(ME), false, `no account id in ${line}`);
  }
  assert.deepEqual(checkinLogs.map((a) => a[1]), [{ code: "57014" }, { code: "XX000" }]);
});

test("a wrong embed (PGRST200) is a bug, not 'not installed': still a 500", async (t) => {
  errors(t);
  setup({ rsvps: RSVPS, checkinError: { code: "PGRST200", message: "Could not find a relationship" } });
  assert.equal((await get()).status, 500);
});

test("check-in not installed yet (this build before the migration): the RSVP lists as before, nobody checked in", async (t) => {
  const seen = errors(t);
  for (const fault of [
    { checkinError: { code: "PGRST205", message: "Could not find the table 'public.event_checkins'" }, stateError: { code: "PGRST202", message: "Could not find the function" } },
    { checkinError: { code: "42P01", message: "relation does not exist" }, stateError: { code: "42883", message: "function does not exist" } },
    { stateError: { code: "PGRST202", message: "Could not find the function" } },
  ] as Partial<World>[]) {
    setup({ rsvps: RSVPS, checkins: fault.checkinError ? CHECKINS : CHECKINS.slice(0, 2), ...fault });
    const res = await get();
    assert.equal(res.status, 200, JSON.stringify(fault));
    assert.equal(res.headers.get("cache-control"), "no-store");
    const b = await body(res);
    assert.deepEqual([b.going.length, b.interested.length], [2, 2], "the RSVP lists are untouched");
    if (fault.checkinError) {
      // No table: nobody is checked in and there are no walk-ins, whatever the fake held.
      assert.ok([...b.going, ...b.interested].every((a) => a.checked_in === false));
      assert.deepEqual(b.walk_ins, []);
      assert.deepEqual(b.checkin, { open: false, count: 0, starts_at: EV_ROW.starts_at, ends_at: EV_ROW.ends_at });
    } else {
      // Only the function missing: the rows read stand, and so does their count.
      assert.deepEqual([b.checkin.open, b.checkin.count], [false, 2]);
    }
  }
  const lines = seen.filter((a) => String(a[0]).includes("not installed"));
  assert.deepEqual(lines.map((a) => a[1]), [{ code: "PGRST205" }, { code: "PGRST202" }, { code: "42P01" }, { code: "42883" }, { code: "PGRST202" }]);
  for (const a of lines) assert.equal(JSON.stringify(a).includes(EVENT), false);
});

test("an upper-case event id: reads use the lower-case id and the state row is still found", async () => {
  const { calls } = setup({ checkins: CHECKINS.slice(0, 1), state: [{ event_id: EVENT, is_open: true, checked_in_count: 6 }] });
  const res = await get(EVENT.toUpperCase());
  assert.equal(res.status, 200);
  assert.deepEqual((await body(res)).checkin, { open: true, count: 6, starts_at: EV_ROW.starts_at, ends_at: EV_ROW.ends_at });
  assert.deepEqual(calls.events?.[1], ["eq", "id", EVENT]);
  assert.deepEqual(calls["rpc:event_checkin_state"], [["args", { p_event_ids: [EVENT] }]]);
});

test("every answer, refusals included, says no-store", async () => {
  for (const w of [{}, { canManage: false }, { event: null }, { user: null }, { allow: false }] as World[]) {
    setup(w);
    assert.equal((await get()).headers.get("cache-control"), "no-store", JSON.stringify(w));
  }
});
