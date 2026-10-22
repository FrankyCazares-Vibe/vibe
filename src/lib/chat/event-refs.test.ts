/**
 * Tests for `event-refs.ts` (handoffs/chat-redesign/wave-2-contracts.md 5.5)
 * against a fake of the service-role client: the four reads, the `room_id`
 * rule (a row on the room OR owner / admin of the club), `counts: false`,
 * the counts asked apart past the 500-row cap, and null on any failed read
 * (a database without migration A included, 3.10's calendar row).
 *
 * Run with:
 *   node --test src/lib/chat/event-refs.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports "server-only" and
 * "@/lib/supabase/service" (the `profile/handle-change.test.ts` pattern):
 * the first resolves to an empty module, the second to one whose
 * `createSupabaseServiceClient` returns the fake each test installs on
 * `globalThis`. Nothing touches a database.
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
if (typeof registerHooks !== "function") throw new Error("event-refs.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const SERVICE_STUB_URL = `data:text/javascript,${encodeURIComponent(
  "export function createSupabaseServiceClient() { return globalThis.__vibeFakeServiceClient; }\n" +
    "export function isSupabaseServiceConfigured() { return globalThis.__vibeFakeServiceClient !== undefined; }",
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "@/lib/supabase/service") return { url: SERVICE_STUB_URL, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./event-refs.ts";
const { eventRefsFor } = (await import(specifier)) as typeof import("./event-refs");
type EventRow = import("./event-refs").EventRow;

// ── A fake PostgREST client ──────────────────────────────────────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown; count?: number | null };
type Logged = { table: string; calls: Call[] };

const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq", "gte", "lt", "gt"] as const;

/**
 * Each `from()` starts a fresh chain; awaiting it (or `.maybeSingle()`) asks
 * `answer(table, calls)` for the result, so one fake tells the reads apart
 * by their table and filters. `rpc()` is logged as `rpc:<name>`.
 */
function fakeClient(answer: (table: string, calls: Call[]) => Answer) {
  const log: Logged[] = [];
  const settle = (table: string, calls: Call[]) => {
    const a = answer(table, calls);
    return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (table: string, calls: Call[]) => {
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(() => settle(table, calls)).then(resolve, reject);
    builder.maybeSingle = () =>
      Promise.resolve().then(() => {
        const r = settle(table, calls);
        const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
        return { data: rows[0] ?? null, error: r.error };
      });
    return builder;
  };
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      return chain(table, calls);
    },
    rpc(fn: string, args: unknown) {
      const calls: Call[] = [["rpc", args]];
      log.push({ table: `rpc:${fn}`, calls });
      return chain(`rpc:${fn}`, calls);
    },
  };
  return { client, log };
}

function install(answer: (table: string, calls: Call[]) => Answer) {
  const fake = fakeClient(answer);
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = fake.client;
  return fake;
}

/** The argument of the first `<method>(<column>, …)` call, or undefined. */
function arg(calls: Call[], method: string, column: string): unknown {
  const call = calls.find((c) => c[0] === method && c[1] === column);
  return call ? call[2] : undefined;
}

const VIEWER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORG1 = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG2 = "aaaaaaaa-0000-4000-8000-000000000002";
const EV_A = "eeeeeeee-0000-4000-8000-00000000000a";
const EV_B = "eeeeeeee-0000-4000-8000-00000000000b";
const EV_C = "eeeeeeee-0000-4000-8000-00000000000c";
const ROOM_A = "cccccccc-0000-4000-8000-00000000000a";
const ROOM_B = "cccccccc-0000-4000-8000-00000000000b";
const NOW = new Date("2026-10-08T20:00:00Z");

const events: EventRow[] = [
  { id: EV_A, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", ends_at: "2026-10-09T03:00:00+00:00", location: "Alumni Hall", org_id: ORG1, visibility: "members" },
  { id: EV_B, title: "Bake Sale", starts_at: "2026-10-01T15:00:00+00:00", ends_at: "2026-10-01T18:00:00+00:00", location: null, org_id: ORG2 },
  { id: EV_C, title: "No room yet", starts_at: "2026-10-20T15:00:00+00:00", ends_at: "2026-10-20T18:00:00+00:00", location: "", org_id: ORG1 },
];

/** The happy path's answers: one room each for A and B, a row on A, admin of ORG2, three RSVPs on A. */
function happy(table: string, calls: Call[]): Answer {
  if (table === "rsvps") {
    return {
      data: [
        { event_id: EV_A, user_id: OTHER, status: "going" },
        { event_id: EV_A, user_id: VIEWER, status: "going" },
        { event_id: EV_A, user_id: "33333333-3333-4333-8333-333333333333", status: "maybe" },
      ],
      count: 3,
    };
  }
  if (table === "channels") return { data: [{ id: ROOM_A, event_id: EV_A }, { id: ROOM_B, event_id: EV_B }] };
  if (table === "org_members") {
    assert.equal(arg(calls, "eq", "user_id"), VIEWER);
    return { data: [{ org_id: ORG1, role: "member" }, { org_id: ORG2, role: "admin" }] };
  }
  if (table === "channel_members") {
    assert.equal(arg(calls, "eq", "user_id"), VIEWER);
    return { data: [{ channel_id: ROOM_A }] };
  }
  throw new Error(`unexpected read of ${table}`);
}

test("an empty list answers an empty map and reads nothing", async () => {
  const { log } = install(() => {
    throw new Error("no read expected");
  });
  const refs = await eventRefsFor([], VIEWER);
  assert.ok(refs);
  assert.equal(refs.size, 0);
  assert.equal(log.length, 0);
});

test("the four reads, and every EventRef field per the rules of 5.5", async () => {
  const { log } = install(happy);
  const refs = await eventRefsFor(events, VIEWER, { now: NOW });
  assert.ok(refs);
  assert.deepEqual(
    log.map((l) => l.table).sort(),
    ["channel_members", "channels", "org_members", "rsvps"],
  );
  // The reads' filters: the events' ids, the two orgs, the two rooms.
  const rsvps = log.find((l) => l.table === "rsvps")!.calls;
  assert.deepEqual(arg(rsvps, "in", "event_id"), [EV_A, EV_B, EV_C]);
  assert.deepEqual(arg(rsvps, "in", "status"), ["going", "maybe"]);
  assert.deepEqual(arg(log.find((l) => l.table === "org_members")!.calls, "in", "org_id"), [ORG1, ORG2]);
  assert.deepEqual(arg(log.find((l) => l.table === "channel_members")!.calls, "in", "channel_id"), [ROOM_A, ROOM_B]);

  // A: a row on the room; live now (starts 23:30Z, now 20:00Z → soon).
  assert.deepEqual(refs.get(EV_A), {
    id: EV_A,
    title: "Fall Formal",
    starts_at: "2026-10-08T23:30:00+00:00",
    ends_at: "2026-10-09T03:00:00+00:00",
    location: "Alumni Hall",
    state: "soon",
    room_id: ROOM_A,
    viewer_status: "going",
    going_count: 2,
    maybe_count: 1,
    visibility: "members",
  });
  // B: no row, but an admin of its club; ended a week ago → closed; location "" when null;
  // no `visibility` on the row → "everyone" (Oct 22, 2026: the column's default).
  assert.deepEqual(refs.get(EV_B), {
    id: EV_B,
    title: "Bake Sale",
    starts_at: "2026-10-01T15:00:00+00:00",
    ends_at: "2026-10-01T18:00:00+00:00",
    location: "",
    state: "closed",
    room_id: ROOM_B,
    viewer_status: null,
    going_count: 0,
    maybe_count: 0,
    visibility: "everyone",
  });
  // C: no room at all → room_id null even though the viewer is a member of its club.
  assert.equal(refs.get(EV_C)?.room_id, null);
  assert.equal(refs.get(EV_C)?.state, "soon");
});

test("a member without a row on the room does not get room_id", async () => {
  install((table, calls) => {
    if (table === "org_members") return { data: [{ org_id: ORG1, role: "member" }, { org_id: ORG2, role: "member" }] };
    if (table === "channel_members") return { data: [] };
    return happy(table, calls);
  });
  const refs = await eventRefsFor(events, VIEWER, { now: NOW });
  assert.ok(refs);
  assert.equal(refs.get(EV_A)?.room_id, null);
  assert.equal(refs.get(EV_B)?.room_id, null);
});

test("counts: false skips the rsvps read and answers 0 / 0 / null", async () => {
  const { log } = install((table, calls) => {
    if (table === "rsvps") throw new Error("rsvps must not be read with counts: false");
    return happy(table, calls);
  });
  const refs = await eventRefsFor(events, VIEWER, { now: NOW, counts: false });
  assert.ok(refs);
  assert.ok(!log.some((l) => l.table === "rsvps"));
  const a = refs.get(EV_A)!;
  assert.equal(a.going_count, 0);
  assert.equal(a.maybe_count, 0);
  assert.equal(a.viewer_status, null);
  assert.equal(a.room_id, ROOM_A);
});

test("past the 500-row cap the counts and the viewer's answer are asked apart, per event", async () => {
  const { log } = install((table, calls) => {
    if (table === "rsvps") {
      const head = calls.find((c) => c[0] === "select" && (c[2] as { head?: boolean } | undefined)?.head === true);
      const eventId = arg(calls, "eq", "event_id");
      if (head) {
        const status = arg(calls, "eq", "status");
        if (eventId === EV_A) return { count: status === "going" ? 640 : 12 };
        return { count: 0 };
      }
      if (eventId !== undefined) {
        // The viewer's own row.
        return { data: eventId === EV_A ? [{ status: "maybe" }] : [] };
      }
      // The first read: more than fit in one page.
      return { data: Array.from({ length: 500 }, () => ({ event_id: EV_A, user_id: OTHER, status: "going" })), count: 652 };
    }
    return happy(table, calls);
  });
  const refs = await eventRefsFor(events, VIEWER, { now: NOW });
  assert.ok(refs);
  assert.equal(refs.get(EV_A)?.going_count, 640);
  assert.equal(refs.get(EV_A)?.maybe_count, 12);
  assert.equal(refs.get(EV_A)?.viewer_status, "maybe");
  assert.equal(refs.get(EV_B)?.going_count, 0);
  // 1 page read + 3 per event of the chunk.
  assert.equal(log.filter((l) => l.table === "rsvps").length, 1 + 3 * events.length);
});

test("a duplicate id is read once and answered once", async () => {
  const { log } = install(happy);
  const refs = await eventRefsFor([events[0], events[0], events[1]], VIEWER, { now: NOW });
  assert.ok(refs);
  assert.equal(refs.size, 2);
  assert.deepEqual(arg(log.find((l) => l.table === "rsvps")!.calls, "in", "event_id"), [EV_A, EV_B]);
});

for (const failing of ["rsvps", "channels", "org_members", "channel_members"]) {
  test(`a failed ${failing} read answers null`, async () => {
    install((table, calls) => {
      if (table === failing) return { error: { code: "57014", message: "canceling statement" } };
      return happy(table, calls);
    });
    assert.equal(await eventRefsFor(events, VIEWER, { now: NOW }), null);
  });
}

test("a database without migration A (channels.event_id missing, 42703) answers null (3.10)", async () => {
  install((table, calls) => {
    if (table === "channels") return { error: { code: "42703", message: "column channels.event_id does not exist" } };
    return happy(table, calls);
  });
  assert.equal(await eventRefsFor(events, VIEWER, { now: NOW }), null);
});

test("no service role configured answers null", async () => {
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = undefined;
  assert.equal(await eventRefsFor(events, VIEWER, { now: NOW }), null);
});

// Oct 22, 2026 ("Members only" events): `visibility` comes from the row
// given, read safely: only an exact "members" is members-only.
test("visibility: \"members\" stays, anything else reads \"everyone\"", async () => {
  install(happy);
  const odd = [
    { ...events[0], visibility: "members" },
    { ...events[1], visibility: "MEMBERS" },
    { ...events[2], visibility: null },
  ];
  const refs = await eventRefsFor(odd, VIEWER, { now: NOW, counts: false });
  assert.ok(refs);
  assert.deepEqual([EV_A, EV_B, EV_C].map((id) => refs.get(id)?.visibility), ["members", "everyone", "everyone"]);
});
