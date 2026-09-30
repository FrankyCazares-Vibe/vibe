/**
 * Tests for `cards/hydrate.ts` (handoffs/chat-redesign/wave-2-contracts.md
 * 5.2) against fakes of the two clients: every `PollCard` field per the
 * table, the hidden-voter rule (blocked and unreadable people alike), the
 * voters read on the VIEWER's client, chunks of 100, Event cards through
 * `eventRefsFor`, null on a failed read and an empty map on a database
 * without migration B (3.10).
 *
 * Run with:
 *   node --test src/lib/chat/cards/hydrate.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports "server-only" and
 * "@/lib/supabase/service" (the `profile/handle-change.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("hydrate.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
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

const specifier = "./hydrate.ts";
const { hydrateCards } = (await import(specifier)) as typeof import("./hydrate");
type CardRow = import("./hydrate").CardRow;
type Room = import("../types").Room;
type PollCard = import("../types").PollCard;
type EventCard = import("../types").EventCard;
type Client = Parameters<typeof hydrateCards>[0];

// ── A fake PostgREST client ──────────────────────────────────────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown; count?: number | null };
type Logged = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq", "gte", "lt", "gt"] as const;

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

function installService(answer: (table: string, calls: Call[]) => Answer) {
  const fake = fakeClient(answer);
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = fake.client;
  return fake;
}

function arg(calls: Call[], method: string, column: string): unknown {
  const call = calls.find((c) => c[0] === method && c[1] === column);
  return call ? call[2] : undefined;
}

const uuid = (n: number, tail = "0") => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VIEWER = uuid(1, "a");
const OTHER = uuid(2, "a");
const BLOCKED = uuid(3, "a");
const RESTRICTED = uuid(4, "a");
const POLL = uuid(1, "b");
const SIGNUP = uuid(2, "b");
const CARD = uuid(3, "b");
const CARD_CANCELLED = uuid(4, "b");
const OPT = (n: number) => uuid(n, "c");
const EVENT = uuid(1, "e");
const ORG = uuid(1, "d");
const NOW = new Date("2026-10-08T20:00:00Z");
const LOUNGE: Room = { id: uuid(9, "f"), kind: "lounge", name: "Lounge", org_id: ORG, event: null };

const person = (id: string, name: string) => ({ id, handle: name.toLowerCase(), name, avatar_url: null });
const PEOPLE = [person(VIEWER, "Viewer"), person(OTHER, "Other"), person(BLOCKED, "Blocked")];

const pollRow = { message_id: POLL, mode: "poll", question: "Pizza or tacos?", anonymous: false, multi: false, closes_at: null };
const pollOptions = [
  { id: OPT(1), poll_id: POLL, position: 0, label: "Pizza", capacity: null },
  { id: OPT(2), poll_id: POLL, position: 1, label: "Tacos", capacity: null },
  { id: OPT(3), poll_id: POLL, position: 2, label: "Neither", capacity: null },
];
// Vote order: the viewer, then a blocked person, then a readable one, then an unreadable one.
const pollVotes = [
  { option_id: OPT(1), poll_id: POLL, user_id: VIEWER },
  { option_id: OPT(1), poll_id: POLL, user_id: BLOCKED },
  { option_id: OPT(1), poll_id: POLL, user_id: OTHER },
  { option_id: OPT(1), poll_id: POLL, user_id: RESTRICTED },
  { option_id: OPT(2), poll_id: POLL, user_id: OTHER },
];

/** The service's answers for one poll, one sign-up and one Event card. */
function sideTables(table: string, calls: Call[]): Answer {
  const asked = (col: string) => (arg(calls, "in", col) as string[] | undefined) ?? [];
  if (table === "chat_polls") {
    const rows = [pollRow, { message_id: SIGNUP, mode: "signup", question: "Bring", anonymous: false, multi: true, closes_at: null }];
    return { data: rows.filter((r) => asked("message_id").includes(r.message_id)) };
  }
  if (table === "chat_poll_options") {
    const rows = [
      ...pollOptions,
      { id: OPT(4), poll_id: SIGNUP, position: 0, label: "Plates", capacity: 2 },
      { id: OPT(5), poll_id: SIGNUP, position: 1, label: "Cups", capacity: 5 },
    ];
    return { data: rows.filter((r) => asked("poll_id").includes(r.poll_id)) };
  }
  if (table === "chat_poll_votes") {
    const rows = [
      ...pollVotes,
      { option_id: OPT(4), poll_id: SIGNUP, user_id: OTHER },
      { option_id: OPT(4), poll_id: SIGNUP, user_id: BLOCKED },
    ];
    return { data: rows.filter((r) => asked("poll_id").includes(r.poll_id)) };
  }
  if (table === "chat_event_cards") {
    const rows = [{ message_id: CARD, note: "Bring a friend" }, { message_id: CARD_CANCELLED, note: null }];
    return { data: rows.filter((r) => asked("message_id").includes(r.message_id)) };
  }
  if (table === "events") {
    return {
      data: [{ id: EVENT, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", ends_at: "2026-10-09T03:00:00+00:00", location: null, org_id: ORG }],
    };
  }
  // eventRefsFor's reads.
  if (table === "rsvps") return { data: [{ event_id: EVENT, user_id: VIEWER, status: "going" }], count: 1 };
  if (table === "channels") return { data: [{ id: uuid(5, "f"), event_id: EVENT }] };
  if (table === "org_members") return { data: [{ org_id: ORG, role: "member" }] };
  if (table === "channel_members") return { data: [{ channel_id: uuid(5, "f") }] };
  throw new Error(`unexpected service read of ${table}`);
}

/** The viewer's client answers the voters read only; the restricted account's row never comes back. */
function viewerClient(over?: (table: string, calls: Call[]) => Answer | undefined) {
  return fakeClient((table, calls) => {
    const o = over?.(table, calls);
    if (o) return o;
    assert.equal(table, "users", "the cookie client reads users only");
    const ids = (arg(calls, "in", "id") as string[]) ?? [];
    return { data: PEOPLE.filter((p) => ids.includes(p.id)) };
  });
}

const rows: CardRow[] = [
  { id: uuid(7, "b"), kind: "text", user_id: OTHER, card_event_id: null },
  { id: POLL, kind: "poll", user_id: OTHER, card_event_id: null },
  { id: SIGNUP, kind: "poll", user_id: OTHER, card_event_id: null },
  { id: CARD, kind: "event_card", user_id: OTHER, card_event_id: EVENT },
  { id: CARD_CANCELLED, kind: "event_card", user_id: OTHER, card_event_id: null },
];

test("text rows only: an empty map and no read", async () => {
  const service = installService(() => {
    throw new Error("no read expected");
  });
  const cookie = viewerClient();
  const cards = await hydrateCards(cookie.client as unknown as Client, [rows[0]], VIEWER, { room: LOUNGE, blocked: new Set() });
  assert.ok(cards);
  assert.equal(cards.size, 0);
  assert.equal(service.log.length + cookie.log.length, 0);
});

test("a poll: every field of the table, the hidden-voter rule, the voters on the viewer's client", async () => {
  const service = installService(sideTables);
  const cookie = viewerClient();
  const cards = await hydrateCards(cookie.client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set([BLOCKED]), now: NOW });
  assert.ok(cards);
  assert.equal(cards.size, 4, "the text row has no card");

  // The reads: the four side tables and the events with the service role, the people on the viewer's client.
  const serviceTables = service.log.map((l) => l.table);
  for (const t of ["chat_polls", "chat_poll_options", "chat_poll_votes", "chat_event_cards", "events"]) assert.ok(serviceTables.includes(t), t);
  assert.ok(!serviceTables.includes("users"), "voters are never read with the service role");
  assert.deepEqual(cookie.log.map((l) => l.table), ["users"]);
  assert.deepEqual(arg(cookie.log[0].calls, "in", "id"), [VIEWER, BLOCKED, OTHER, RESTRICTED]);
  const options = service.log.find((l) => l.table === "chat_poll_options")!.calls;
  assert.deepEqual(options.find((c) => c[0] === "order"), ["order", "position", { ascending: true }]);
  const votes = service.log.find((l) => l.table === "chat_poll_votes")!.calls;
  assert.deepEqual(votes.filter((c) => c[0] === "order").map((c) => c[1]), ["created_at", "user_id"]);

  const poll = cards.get(POLL) as PollCard;
  assert.equal(poll.type, "poll");
  assert.equal(poll.question, "Pizza or tacos?");
  assert.equal(poll.anonymous, false);
  assert.equal(poll.multi, false);
  assert.equal(poll.closes_at, null);
  assert.equal(poll.closed, false);
  assert.equal(poll.total_voters, 4, "distinct people, blocked and unreadable included");
  assert.equal(poll.options.length, 3);
  const [pizza, tacos, neither] = poll.options;
  assert.equal(pizza.id, OPT(1));
  assert.equal(pizza.label, "Pizza");
  assert.equal(pizza.count, 4, "counts never change");
  assert.equal(pizza.capacity, null);
  assert.equal(pizza.full, false);
  assert.equal(pizza.mine, true);
  assert.deepEqual(pizza.voters.map((p) => p.id), [VIEWER, OTHER], "in vote order; the blocked and the unreadable left out");
  assert.equal(pizza.voters_more, 0);
  assert.equal(tacos.count, 1);
  assert.equal(tacos.mine, false);
  assert.deepEqual(tacos.voters.map((p) => p.id), [OTHER]);
  assert.deepEqual(neither, { id: OPT(3), label: "Neither", count: 0, capacity: null, full: false, mine: false, voters: [], voters_more: 0 });
  assert.deepEqual(pizza.voters[0], { id: VIEWER, handle: "viewer", name: "Viewer", avatar_url: null });
});

test("a sign-up: capacity, full, names always, all of the visible voters", async () => {
  installService(sideTables);
  const cards = await hydrateCards(viewerClient().client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set([BLOCKED]), now: NOW });
  const signup = cards!.get(SIGNUP) as PollCard;
  assert.equal(signup.type, "signup");
  assert.equal(signup.multi, true);
  const [plates, cups] = signup.options;
  assert.equal(plates.capacity, 2);
  assert.equal(plates.count, 2);
  assert.equal(plates.full, true, "count >= capacity, the blocked voter counted");
  assert.deepEqual(plates.voters.map((p) => p.id), [OTHER]);
  assert.equal(plates.voters_more, 0);
  assert.equal(cups.full, false);
  assert.equal(signup.total_voters, 2);
});

test("anonymous: no voters and no voters_more for anyone, the counts kept", async () => {
  installService((table, calls) => {
    if (table === "chat_polls") return { data: [{ ...pollRow, anonymous: true }] };
    return sideTables(table, calls);
  });
  const cards = await hydrateCards(viewerClient().client as unknown as Client, [rows[1]], VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
  const poll = cards!.get(POLL) as PollCard;
  assert.equal(poll.anonymous, true);
  assert.equal(poll.options[0].count, 4);
  assert.equal(poll.options[0].mine, true, "the viewer's own pick is always returned");
  for (const option of poll.options) {
    assert.deepEqual(option.voters, []);
    assert.equal(option.voters_more, 0);
  }
});

test("a poll names the first 12 visible voters and counts the rest; a sign-up names them all", async () => {
  const many = Array.from({ length: 15 }, (_, i) => uuid(100 + i, "a"));
  const votesFor = (pollId: string, optionId: string) => many.map((id) => ({ option_id: optionId, poll_id: pollId, user_id: id }));
  installService((table, calls) => {
    if (table === "chat_poll_votes") return { data: [...votesFor(POLL, OPT(1)), ...votesFor(SIGNUP, OPT(4))] };
    return sideTables(table, calls);
  });
  const cookie = fakeClient((_table, calls) => {
    const ids = (arg(calls, "in", "id") as string[]) ?? [];
    return { data: ids.map((id) => person(id, `P${id.slice(-3)}`)) };
  });
  const cards = await hydrateCards(cookie.client as unknown as Client, [rows[1], rows[2]], VIEWER, { room: LOUNGE, blocked: new Set([many[0]]), now: NOW });
  const poll = cards!.get(POLL) as PollCard;
  assert.equal(poll.options[0].count, 15);
  assert.equal(poll.options[0].voters.length, 12);
  assert.equal(poll.options[0].voters_more, 2, "14 visible (one blocked) minus the 12 named");
  assert.deepEqual(poll.options[0].voters.map((p) => p.id), many.slice(1, 13));
  const signup = cards!.get(SIGNUP) as PollCard;
  assert.equal(signup.options[0].voters.length, 14);
  assert.equal(signup.options[0].voters_more, 0);
  assert.equal(signup.options[0].full, true, "15 >= 2");
});

test("closed: past closes_at, or an event room closed by roomState; never for a Board", async () => {
  const closedRoom: Room = {
    id: uuid(8, "f"), kind: "event", name: "Bake sale", org_id: ORG,
    event: { id: EVENT, title: "Bake sale", starts_at: "2026-09-01T15:00:00+00:00", ends_at: "2026-09-01T18:00:00+00:00" },
  };
  const board: Room = { ...LOUNGE, kind: "board" };
  const cases: [string | null, Room, boolean][] = [
    ["2026-10-08T19:59:59+00:00", LOUNGE, true],
    ["2026-10-08T20:00:00+00:00", LOUNGE, true],
    ["2026-10-08T20:00:01+00:00", LOUNGE, false],
    [null, closedRoom, true],
    ["2026-12-01T00:00:00+00:00", closedRoom, true],
    [null, board, false],
    [null, null as unknown as Room, false],
  ];
  for (const [closesAt, room, closed] of cases) {
    installService((table, calls) => (table === "chat_polls" ? { data: [{ ...pollRow, closes_at: closesAt }] } : sideTables(table, calls)));
    const cards = await hydrateCards(viewerClient().client as unknown as Client, [rows[1]], VIEWER, { room, blocked: new Set(), now: NOW });
    const poll = cards!.get(POLL) as PollCard;
    assert.equal(poll.closed, closed, `closes_at ${closesAt} in ${room?.kind ?? "dm"}`);
    assert.equal(poll.closes_at, closesAt);
  }
});

test("Event cards: the note, the event through eventRefsFor, and event null when cancelled", async () => {
  const service = installService(sideTables);
  const cards = await hydrateCards(viewerClient().client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
  const card = cards!.get(CARD) as EventCard;
  assert.equal(card.type, "event");
  assert.equal(card.note, "Bring a friend");
  assert.deepEqual(card.event, {
    id: EVENT, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", ends_at: "2026-10-09T03:00:00+00:00",
    location: "", state: "soon", room_id: uuid(5, "f"), viewer_status: "going", going_count: 1, maybe_count: 0,
  });
  assert.deepEqual(cards!.get(CARD_CANCELLED), { type: "event", note: null, event: null });
  const eventsRead = service.log.find((l) => l.table === "events")!.calls;
  assert.deepEqual(arg(eventsRead, "in", "id"), [EVENT], "the cancelled card's null id is not asked");
});

test("an event the events read did not return: event null, the card kept", async () => {
  installService((table, calls) => (table === "events" ? { data: [] } : sideTables(table, calls)));
  const cards = await hydrateCards(viewerClient().client as unknown as Client, [rows[3]], VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
  assert.deepEqual(cards!.get(CARD), { type: "event", note: "Bring a friend", event: null });
});

test("a poll row with no side row is not in the map", async () => {
  installService((table, calls) => (table === "chat_polls" ? { data: [] } : sideTables(table, calls)));
  const cards = await hydrateCards(viewerClient().client as unknown as Client, [rows[1]], VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
  assert.ok(cards);
  assert.equal(cards.has(POLL), false);
});

test("ids go in chunks of 100", async () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ id: uuid(1000 + i, "b"), kind: "poll" as const, user_id: OTHER, card_event_id: null }));
  const service = installService((table) => (table === "chat_polls" || table === "chat_poll_options" || table === "chat_poll_votes" ? { data: [] } : { data: [] }));
  await hydrateCards(viewerClient().client as unknown as Client, many, VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
  const polls = service.log.filter((l) => l.table === "chat_polls");
  assert.equal(polls.length, 3);
  assert.deepEqual(polls.map((l) => (arg(l.calls, "in", "message_id") as string[]).length), [100, 100, 50]);
});

for (const code of ["42P01", "PGRST205", "42703"]) {
  test(`a database without migration B (${code}) answers an empty map (3.10)`, async () => {
    installService((table, calls) => (table === "chat_polls" ? { error: { code, message: "missing" } } : sideTables(table, calls)));
    const cards = await hydrateCards(viewerClient().client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW });
    assert.ok(cards);
    assert.equal(cards.size, 0);
  });
}

for (const failing of ["chat_polls", "chat_poll_options", "chat_poll_votes", "chat_event_cards", "events", "channels"]) {
  test(`a failed ${failing} read answers null`, async () => {
    installService((table, calls) => (table === failing ? { error: { code: "57014", message: "canceling statement" } } : sideTables(table, calls)));
    assert.equal(await hydrateCards(viewerClient().client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW }), null);
  });
}

test("a failed voters read on the viewer's client answers null", async () => {
  installService(sideTables);
  const cookie = viewerClient(() => ({ error: { code: "57014", message: "canceling statement" } }));
  assert.equal(await hydrateCards(cookie.client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set(), now: NOW }), null);
});

test("no service role configured answers null", async () => {
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = undefined;
  assert.equal(await hydrateCards(viewerClient().client as unknown as Client, rows, VIEWER, { room: LOUNGE, blocked: new Set() }), null);
});
