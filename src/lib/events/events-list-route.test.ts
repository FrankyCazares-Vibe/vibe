/**
 * GET /api/events (the list) with event check-in (Oct 19 2026, contract 3.6),
 * driven end to end against fakes:
 *   - `?org_id=<uuid>&when=past` is the club page's Past events: ended in the
 *     last 30 days, newest first, at most 20. The upcoming chain is unchanged,
 *     `when` means nothing without `org_id`, and a hidden club lists nothing;
 *   - `event_checkin_state` rides with the RSVP counts on the viewer's client
 *     and its rows land on the items. A failed read answers 200 with "nothing
 *     known" and a code-only log, which is what keeps the list working if
 *     this build reaches production before the migration does;
 *   - every answer, refusals included, says Cache-Control: no-store.
 *
 * Run with:
 *   node --test src/lib/events/events-list-route.test.ts
 *
 * The resolve hook as event-route.test.ts: the two Supabase clients, the
 * limiter and the moderation gates are data: modules that read their fakes
 * from globalThis; every other "@/" module (the campus rules, event-item,
 * event-checkin, pgrest) is the real file. Date is mocked, so the time
 * filters are exact strings.
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
if (typeof registerHooks !== "function") throw new Error("events-list-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__list.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__list.service; }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireCanPublish() { return null; }\n" +
      "export function contentBlockedResponse(field) { return new Response(JSON.stringify({ field }), { status: 422 }); }",
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

// A variable, so tsc doesn't read the ".ts" ending (node needs it to load the file).
const routeSpecifier = "../../app/api/events/route.ts";
const { GET } = (await import(routeSpecifier)) as typeof import("../../app/api/events/route");

// ── The world: one club, two of its events ──────────────────────────────────

const ME = "11111111-0000-4000-8000-000000000001";
const OFFICER = "22222222-0000-4000-8000-000000000002";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const EV1 = "eeeeeeee-0000-4000-8000-000000000001";
const EV2 = "eeeeeeee-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-19T20:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const row = (id: string, startsAt: string, endsAt: string) => ({
  id,
  org_id: ORG,
  creator_id: OFFICER,
  title: `Event ${id.slice(-1)}`,
  description: "",
  starts_at: startsAt,
  ends_at: endsAt,
  location: "The Union",
  created_at: "2026-10-01T00:00:00+00:00",
  creator: { id: OFFICER },
});
const ROWS = [row(EV1, "2026-10-17T23:00:00+00:00", "2026-10-18T02:00:00+00:00"), row(EV2, "2026-10-10T23:00:00+00:00", "2026-10-11T02:00:00+00:00")];

type Err = { code: string; message: string };
type World = {
  user?: { id: string } | null;
  /** Every club events read answers these. */
  events?: unknown[];
  /** The `include` read (`eq id`) answers these (Oct 19, 2026); absent, nothing. */
  included?: unknown[];
  includedError?: Err;
  hidden?: readonly string[];
  hiddenError?: Err;
  checkinState?: unknown[];
  checkinStateError?: Err;
};
type Call = [string, ...unknown[]];
type Read = { client: "cookie" | "service"; table: string; calls: Call[] };

function setup(w: World) {
  const reads: Read[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const answer = (r: Read): { data: unknown; error: unknown } => {
    const { client, table, calls } = r;
    const has = (name: string, arg?: unknown) => calls.some((c) => c[0] === name && (arg === undefined || c[1] === arg));
    if (client === "cookie" && table === "users") {
      return { data: { school: "IU Indianapolis", campus_id: "indianapolis", school_system: "iu" }, error: null };
    }
    if (client === "service" && table === "orgs") {
      if (has("not")) return { data: (w.hidden ?? []).map((id) => ({ id })), error: w.hiddenError ?? null };
      if (has("select", "id")) return { data: [{ id: ORG }], error: null };
      return { data: [{ id: ORG, handle: "sae", name: "SAE", logo_url: null, verified: true }], error: null };
    }
    // The campus list's org-less half (legacy rows): none.
    if (client === "cookie" && table === "events" && has("eq", "id")) {
      return w.includedError ? { data: null, error: w.includedError } : { data: w.included ?? [], error: null };
    }
    if (client === "cookie" && table === "events") return { data: has("is", "org_id") ? [] : w.events ?? ROWS, error: null };
    if (client === "cookie" && (table === "org_members" || table === "rsvps")) return { data: [], error: null };
    throw new Error(`unexpected ${client} read of ${table}`);
  };
  const from = (client: Read["client"]) => (table: string) => {
    const r: Read = { client, table, calls: [] };
    reads.push(r);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "not", "lt", "gte", "lte", "order", "limit", "or"]) {
      builder[m] = (...args: unknown[]) => {
        r.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve().then(() => answer(r));
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve().then(() => answer(r)).then(resolve, reject);
    return builder;
  };
  const cookie = {
    auth: { getUser: async () => ({ data: { user: w.user === undefined ? { id: ME } : w.user }, error: null }) },
    from: from("cookie"),
    rpc: async (name: string, args: { p_event_ids: string[] }) => {
      rpcs.push({ name, args });
      if (name === "event_rsvp_counts") {
        return { data: args.p_event_ids.map((event_id) => ({ event_id, going_count: 2, maybe_count: 1 })), error: null };
      }
      if (name === "event_checkin_state") {
        return w.checkinStateError ? { data: null, error: w.checkinStateError } : { data: w.checkinState ?? [], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const service = { from: from("service") };
  (globalThis as unknown as { __list: unknown }).__list = { cookie, service };
  /** The viewer's club events reads, in order. */
  const eventReads = () => reads.filter((r) => r.client === "cookie" && r.table === "events");
  return { reads, rpcs, eventReads };
}

const get = (qs = "") => GET(new Request(`http://vibe.test/api/events${qs}`));
type Item = Record<string, unknown> & { id: string };
const items = async (res: Response) => ((await res.json()) as { events: Item[] }).events;

/** Date is fixed; the route's error logs are kept to check. */
function fixed(t: TestContext): unknown[][] {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const seen: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    seen.push(args);
  });
  return seen;
}

const UPCOMING_CHAIN = (limit: number) => [
  ["gte", "ends_at", NOW.toISOString()],
  ["lte", "starts_at", iso(NOW.getTime() + 60 * DAY_MS)],
  ["order", "starts_at", { ascending: true }],
  ["limit", limit],
];

// ── The views ───────────────────────────────────────────────────────────────

test("when=past on a club's page: ended in the last 30 days, newest first, at most 20", async (t) => {
  fixed(t);
  for (const [qs, cap] of [["&limit=50", 20], ["", 20], ["&limit=5", 5]] as const) {
    const { eventReads, rpcs } = setup({});
    const res = await get(`?org_id=${ORG}&when=past${qs}`);
    assert.equal(res.status, 200);
    const [read, ...more] = eventReads();
    assert.equal(more.length, 0);
    assert.match(String(read?.calls[0]?.[1]), /,creator:users!events_creator_id_fkey!inner\(id\)$/);
    assert.deepEqual(read?.calls.slice(1), [
      ["lt", "ends_at", NOW.toISOString()],
      ["gte", "ends_at", iso(NOW.getTime() - 30 * DAY_MS)],
      ["order", "starts_at", { ascending: false }],
      ["limit", cap],
      ["eq", "org_id", ORG],
    ], qs);
    // Past events carry their check-in state too ("N were there").
    assert.deepEqual(rpcs.find((r) => r.name === "event_checkin_state")?.args, { p_event_ids: [EV1, EV2] });
    assert.deepEqual((await items(res)).map((e) => e.id), [EV1, EV2]);
  }
});

test("a club's page without when=past (or any other when) is the upcoming chain, unchanged", async (t) => {
  fixed(t);
  for (const qs of ["", "&when=soon", "&when=PAST"]) {
    const { eventReads } = setup({});
    assert.equal((await get(`?org_id=${ORG}&limit=30${qs}`)).status, 200);
    assert.deepEqual(eventReads()[0]?.calls.slice(1), [...UPCOMING_CHAIN(30), ["eq", "org_id", ORG]], qs);
  }
});

test("when=past without org_id is ignored: both campus reads are the upcoming chain", async (t) => {
  fixed(t);
  const { eventReads } = setup({});
  assert.equal((await get("?when=past")).status, 200);
  const reads = eventReads();
  assert.equal(reads.length, 2);
  for (const r of reads) {
    assert.deepEqual(r.calls.slice(1, 5), UPCOMING_CHAIN(50));
    assert.equal(r.calls.some((c) => c[0] === "lt"), false);
  }
});

test("a hidden club, or an org id that isn't a uuid, lists nothing in the past view and reads no event", async (t) => {
  fixed(t);
  for (const [w, org] of [[{ hidden: [ORG] }, ORG], [{}, "not-a-uuid"]] as const) {
    const { eventReads, rpcs } = setup(w);
    const res = await get(`?org_id=${org}&when=past`);
    assert.equal(res.status, 200);
    assert.deepEqual(await items(res), []);
    assert.deepEqual([eventReads().length, rpcs.length], [0, 0]);
  }
});

// ── include: the one linked event (Oct 19, 2026, critique B8 repair) ─────────
// My Calendar reads 180 days ahead; the club lists stop at 60 days / 50 rows
// (upcoming) and 20 rows (past). `include` adds the event a calendar chip
// opened, so the club page can show it instead of "isn't listed anymore".

const EV3 = "eeeeeeee-0000-4000-8000-000000000003";
const FAR = row(EV3, "2027-01-15T01:00:00+00:00", "2027-01-15T05:00:00+00:00");
const OLD = row(EV3, "2026-09-25T23:00:00+00:00", "2026-09-26T02:00:00+00:00");

test("include adds the linked event to a club's list, past the horizon or the row cap, in the list's own order", async (t) => {
  fixed(t);
  // Upcoming: Jan 15 is 88 days out, past the 60-day horizon.
  const up = setup({ events: [ROWS[1], ROWS[0]], included: [FAR] });
  const upRes = await get(`?org_id=${ORG}&limit=50&include=${EV3}`);
  assert.equal(upRes.status, 200);
  const [list, extra, ...more] = up.eventReads();
  assert.equal(more.length, 0);
  assert.deepEqual(list?.calls.slice(1), [...UPCOMING_CHAIN(50), ["eq", "org_id", ORG]], "the list itself is unchanged");
  assert.match(String(extra?.calls[0]?.[1]), /,creator:users!events_creator_id_fkey!inner\(id\)$/, "the club creator embed, as the list");
  assert.deepEqual(extra?.calls.slice(1), [["eq", "id", EV3], ["eq", "org_id", ORG], ["gte", "ends_at", NOW.toISOString()], ["limit", 1]], "this club's, not ended, no horizon");
  assert.deepEqual((await items(upRes)).map((e) => e.id), [EV2, EV1, EV3], "soonest first");
  // It is a full card: counts and attribution like every other row.
  setup({ events: [ROWS[1], ROWS[0]], included: [FAR] });
  const far = (await items(await get(`?org_id=${ORG}&include=${EV3}`))).find((e) => e.id === EV3)!;
  assert.deepEqual([far.going_count, (far.org as { handle: string }).handle], [2, "sae"]);

  // Past: older than the 20 newest.
  const back = setup({ included: [OLD] });
  const backRes = await get(`?org_id=${ORG}&when=past&include=${EV3}`);
  const pastExtra = back.eventReads()[1];
  assert.deepEqual(pastExtra?.calls.slice(1), [["eq", "id", EV3], ["eq", "org_id", ORG], ["lt", "ends_at", NOW.toISOString()], ["limit", 1]], "ended, no 30-day floor");
  assert.deepEqual((await items(backRes)).map((e) => e.id), [EV1, EV2, EV3], "newest first");
});

test("include is ignored when the list already holds it, when it isn't a uuid, without org_id, or for a hidden club", async (t) => {
  fixed(t);
  for (const qs of [`?org_id=${ORG}&include=${EV1}`, `?org_id=${ORG}&include=nope`, `?org_id=${ORG}&when=past&include=`]) {
    const { eventReads } = setup({ included: [FAR] });
    assert.equal((await get(qs)).status, 200);
    assert.equal(eventReads().length, 1, qs);
  }
  const campus = setup({ included: [FAR] });
  await get(`?include=${EV3}`);
  assert.equal(campus.eventReads().some((r) => r.calls.some((c) => c[0] === "eq" && c[1] === "id")), false, "the campus list never takes include");
  const hidden = setup({ hidden: [ORG], included: [FAR] });
  const res = await get(`?org_id=${ORG}&include=${EV3}`);
  assert.deepEqual([await items(res), hidden.eventReads().length], [[], 0]);
});

test("a failed include read keeps the list: 200, the rows as they were, one log", async (t) => {
  const seen = fixed(t);
  setup({ includedError: { code: "XX000", message: "boom" } });
  const res = await get(`?org_id=${ORG}&include=${EV3}`);
  assert.equal(res.status, 200);
  assert.deepEqual((await items(res)).map((e) => e.id), [EV1, EV2]);
  assert.equal(seen.filter((args) => args[0] === "[events GET include]").length, 1);
});

// ── Check-in state ──────────────────────────────────────────────────────────

test("event_checkin_state rides with the RSVP counts on the viewer's client; its rows land on the items", async (t) => {
  fixed(t);
  const { rpcs } = setup({ checkinState: [{ event_id: EV1, is_open: true, viewer_checked_in: true, checked_in_count: 12 }] });
  const list = await items(await get(`?org_id=${ORG}`));
  assert.deepEqual(rpcs.map((r) => r.name).sort(), ["event_checkin_state", "event_rsvp_counts"]);
  assert.deepEqual(rpcs.find((r) => r.name === "event_checkin_state")?.args, { p_event_ids: [EV1, EV2] });
  const fields = (e: Item | undefined) => [e?.checkin_open, e?.checked_in_count, e?.viewer_checked_in];
  assert.deepEqual(fields(list[0]), [true, 12, true]);
  assert.deepEqual(fields(list[1]), [false, null, false], "no row: nothing known");
  // Then visibility (Oct 22, 2026) and the icon (Oct 23, 2026), the last two.
  assert.deepEqual(Object.keys(list[0] ?? {}).slice(-5), ["checkin_open", "checked_in_count", "viewer_checked_in", "visibility", "icon"]);
});

test("a failed state read (check-in not installed yet): 200, every item 'nothing known', the counts kept, a code-only log", async (t) => {
  for (const code of ["PGRST202", "XX000"]) {
    const seen = fixed(t);
    setup({ checkinStateError: { code, message: `event_checkin_state({${EV1},${EV2}}) for ${ME}` } });
    const res = await get(`?org_id=${ORG}&when=past`);
    assert.equal(res.status, 200, code);
    const list = await items(res);
    assert.equal(list.length, 2);
    for (const e of list) {
      assert.deepEqual([e.checkin_open, e.checked_in_count, e.viewer_checked_in], [false, null, false]);
      assert.deepEqual([e.going_count, e.interested_count], [2, 1]);
    }
    assert.deepEqual(seen, [["[events GET checkin state]", { code }]]);
    t.mock.reset();
  }
});

test("every answer, refusals included, says no-store", async (t) => {
  fixed(t);
  for (const [w, qs, status] of [
    [{}, `?org_id=${ORG}`, 200],
    [{}, "", 200],
    [{ user: null }, "", 401],
    [{ hiddenError: { code: "XX000", message: "boom" } }, "", 500],
    [{}, "?campus=nowhere", 400],
  ] as const) {
    setup(w);
    const res = await get(qs);
    assert.equal(res.status, status, JSON.stringify([w, qs]));
    assert.equal(res.headers.get("cache-control"), "no-store", JSON.stringify([w, qs]));
  }
});
