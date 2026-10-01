/**
 * Tests for `cards/refresh-event-cards.ts` (S71 amendment B2 / B4): an Event
 * card's stored text follows its event. Run with:
 *   node --test src/lib/chat/cards/refresh-event-cards.test.ts
 *
 * The client is a small in-memory fake of the two tables the module touches
 * (`messages`, `chat_event_cards`): `eq` / `is` / `in` filters, `order`,
 * `limit`, `update(...).select(...)`, so a case reads as data in, data out
 * ("skips removed rows" is a real removed row left alone, not a call-shape
 * check). `fail` injects an error or a throw per operation. The resolve hook
 * is for `../when` (the `@/` alias, as fallback.test.ts).
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
if (typeof registerHooks !== "function") throw new Error("refresh-event-cards.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./refresh-event-cards.ts";
const {
  EVENT_CARD_CAP,
  MAX_REWRITE_STATEMENTS,
  REWRITE_BUDGET_MS,
  REWRITE_CONCURRENCY,
  loadEventCardMessages,
  refreshEventCardTexts,
  rewriteEventCardTexts,
} = (await import(
  specifier
)) as typeof import("./refresh-event-cards");
type Client = Parameters<typeof loadEventCardMessages>[0];

// ── An in-memory fake of the two tables ──────────────────────────────────────

type Row = Record<string, unknown>;
type Call = [string, ...unknown[]];
type Op = { table: string; kind: "select" | "update"; calls: Call[] };
type Fault = { error: { code?: string; message: string } } | { throws: true } | undefined;

type World = {
  messages: Row[];
  chat_event_cards: Row[];
  /** Asked for every operation just before it runs. */
  fail?: (op: Op) => Fault;
};

function fakeService(world: World) {
  const ops: Op[] = [];
  // Update statements in flight at once: an update takes one turn of the event
  // loop, so statements started together overlap and the peak is observable.
  const flight = { now: 0, peak: 0 };
  const client = {
    from(table: "messages" | "chat_event_cards") {
      const op: Op = { table, kind: "select", calls: [] };
      ops.push(op);
      const builder: Record<string, unknown> = {};
      const record = (name: string) => (...args: unknown[]) => {
        if (op.calls.length === 0 && name === "update") op.kind = "update";
        op.calls.push([name, ...args]);
        return builder;
      };
      for (const m of ["select", "eq", "is", "in", "order", "limit", "update"]) builder[m] = record(m);
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(async () => {
            if (op.kind !== "update") return run(op);
            flight.now += 1;
            flight.peak = Math.max(flight.peak, flight.now);
            try {
              await new Promise((done) => setImmediate(done));
              return run(op);
            } finally {
              flight.now -= 1;
            }
          })
          .then(resolve, reject);
      return builder;
    },
  };

  function run(op: Op): { data: unknown; error: unknown } {
    const fault = world.fail?.(op);
    if (fault && "throws" in fault) throw new Error("socket hang up");
    if (fault && "error" in fault) return { data: null, error: fault.error };
    let rows = (world[op.table as "messages" | "chat_event_cards"] as Row[]).slice();
    for (const [name, col, val] of op.calls) {
      if (name === "eq") rows = rows.filter((r) => r[col as string] === val);
      if (name === "is") rows = rows.filter((r) => (r[col as string] ?? null) === val);
      if (name === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col as string]));
    }
    const order = op.calls.find((c) => c[0] === "order");
    if (order) {
      const col = order[1] as string;
      const desc = (order[2] as { ascending?: boolean } | undefined)?.ascending === false;
      rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (desc ? -1 : 1));
    }
    const limit = op.calls.find((c) => c[0] === "limit");
    if (limit) rows = rows.slice(0, limit[1] as number);
    if (op.kind === "update") {
      const patch = op.calls.find((c) => c[0] === "update")![1] as Row;
      for (const r of rows) Object.assign(r, patch);
    }
    const selected = op.calls.find((c) => c[0] === "select");
    if (op.kind === "update" && !selected) return { data: null, error: null };
    const cols = String(selected?.[1] ?? "*").split(",").map((c) => c.trim());
    return { data: rows.map((r) => (cols[0] === "*" ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c]])))), error: null };
  }

  return { client: client as unknown as Client, ops, flight };
}

const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const OTHER_EVENT = "eeeeeeee-0000-4000-8000-000000000002";
const mid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();

function card(n: number, over: Row = {}): Row {
  return {
    id: mid(n),
    kind: "event_card",
    card_event_id: EVENT,
    removed_at: null,
    content: "Event: Fall Formal · Thu Oct 8, 7:30 PM",
    created_at: stamp(n),
    ...over,
  };
}
const note = (n: number, text: string | null): Row => ({ message_id: mid(n), note: text });

const UPDATE = { kind: "update" as const, title: "Fall Formal 2", starts_at: "2026-10-09T23:30:00Z" };
const CANCEL = { kind: "cancel" as const, title: "Fall Formal" };

/** Every console.error / console.warn of the test, as argument lists. */
function capture(t: TestContext) {
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void errors.push(args));
  t.mock.method(console, "warn", (...args: unknown[]) => void warns.push(args));
  return { errors, warns };
}

const content = (world: World, n: number) => world.messages.find((r) => r.id === mid(n))!.content;
const writes = (ops: Op[]) => ops.filter((o) => o.kind === "update");

// ── loadEventCardMessages ────────────────────────────────────────────────────

test("load: the live Event cards of the event, newest first, with the exact filters and the 500 cap", async () => {
  const world: World = { messages: [card(1), card(2)], chat_event_cards: [note(1, null), note(2, "Wear red")] };
  const { client, ops } = fakeService(world);
  const got = await loadEventCardMessages(client, EVENT);
  assert.ok(got);
  assert.deepEqual(got.ids, [mid(2), mid(1)]);
  assert.equal(got.notes.get(mid(2)), "Wear red");
  assert.equal(got.notes.get(mid(1)), null);
  assert.equal(EVENT_CARD_CAP, 500);
  assert.deepEqual(ops[0].calls, [
    ["select", "id"],
    ["eq", "kind", "event_card"],
    ["eq", "card_event_id", EVENT],
    ["is", "removed_at", null],
    ["order", "created_at", { ascending: false }],
    ["limit", 500],
  ]);
  assert.equal(ops[1].table, "chat_event_cards");
  assert.deepEqual(ops[1].calls, [["select", "message_id, note"], ["in", "message_id", [mid(2), mid(1)]]]);
});

test("load: removed rows, other events' cards and other kinds are not returned", async () => {
  const world: World = {
    messages: [
      card(1),
      card(2, { removed_at: "2026-10-02T00:00:00Z" }),
      card(3, { card_event_id: OTHER_EVENT }),
      card(4, { kind: "poll", card_event_id: null }),
    ],
    chat_event_cards: [note(1, null)],
  };
  const { client } = fakeService(world);
  const got = await loadEventCardMessages(client, EVENT);
  assert.deepEqual(got?.ids, [mid(1)]);
});

test("load: no cards → an empty result and no notes read", async () => {
  const { client, ops } = fakeService({ messages: [card(1, { card_event_id: OTHER_EVENT })], chat_event_cards: [] });
  const got = await loadEventCardMessages(client, EVENT);
  assert.deepEqual(got, { ids: [], notes: new Map() });
  assert.equal(ops.length, 1, "only the messages read");
});

test("load: a card whose note row is missing has no entry (the rewrite reads it as no note)", async () => {
  const { client } = fakeService({ messages: [card(1)], chat_event_cards: [] });
  const got = await loadEventCardMessages(client, EVENT);
  assert.deepEqual(got?.ids, [mid(1)]);
  assert.equal(got?.notes.has(mid(1)), false);
});

test("load: a failed messages read → null, logged with the code and message", async (t) => {
  const { errors } = capture(t);
  const { client } = fakeService({
    messages: [card(1)],
    chat_event_cards: [],
    fail: (op) => (op.table === "messages" ? { error: { code: "XX000", message: "boom" } } : undefined),
  });
  assert.equal(await loadEventCardMessages(client, EVENT), null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "[chat/refresh-event-cards] read of the event's cards");
  assert.deepEqual(errors[0].slice(1), ["XX000", "boom"]);
});

test("load: a failed notes read → null, logged", async (t) => {
  const { errors } = capture(t);
  const { client } = fakeService({
    messages: [card(1)],
    chat_event_cards: [note(1, "x")],
    fail: (op) => (op.table === "chat_event_cards" ? { error: { code: "XX000", message: "boom" } } : undefined),
  });
  assert.equal(await loadEventCardMessages(client, EVENT), null);
  assert.equal(errors.length, 1);
});

test("load: a read that throws → null, never a throw", async (t) => {
  const { errors } = capture(t);
  const { client } = fakeService({ messages: [], chat_event_cards: [], fail: () => ({ throws: true }) });
  assert.equal(await loadEventCardMessages(client, EVENT), null);
  assert.equal(errors.length, 1);
});

test("load: a missing table or column (no chat schema) means no cards: an empty result, silently", async (t) => {
  for (const code of ["42P01", "PGRST205", "42703", "PGRST204"]) {
    const { errors, warns } = capture(t);
    const onMessages = fakeService({ messages: [], chat_event_cards: [], fail: (op) => (op.table === "messages" ? { error: { code, message: "missing" } } : undefined) });
    assert.deepEqual(await loadEventCardMessages(onMessages.client, EVENT), { ids: [], notes: new Map() }, `messages ${code}`);
    const onNotes = fakeService({ messages: [card(1)], chat_event_cards: [], fail: (op) => (op.table === "chat_event_cards" ? { error: { code, message: "missing" } } : undefined) });
    assert.deepEqual(await loadEventCardMessages(onNotes.client, EVENT), { ids: [], notes: new Map() }, `notes ${code}`);
    assert.deepEqual([errors, warns], [[], []], `${code} is silent`);
    t.mock.restoreAll();
  }
});

test("load: the 500 cap is logged once and the notes are read in chunks of 100", async (t) => {
  const { errors, warns } = capture(t);
  const messages = Array.from({ length: 501 }, (_, i) => card(i + 1));
  const { client, ops } = fakeService({ messages, chat_event_cards: [] });
  const got = await loadEventCardMessages(client, EVENT);
  assert.equal(got?.ids.length, 500, "the cap");
  assert.equal(got?.ids[0], mid(501), "the newest first");
  assert.equal(warns.length, 1, "logged once");
  assert.deepEqual(errors, []);
  const noteReads = ops.filter((o) => o.table === "chat_event_cards");
  assert.equal(noteReads.length, 5);
  for (const read of noteReads) assert.equal((read.calls[1][2] as string[]).length, 100);
});

test("load: exactly 499 cards is under the cap and says nothing", async (t) => {
  const { warns } = capture(t);
  const { client } = fakeService({ messages: Array.from({ length: 499 }, (_, i) => card(i + 1)), chat_event_cards: [] });
  assert.equal((await loadEventCardMessages(client, EVENT))?.ids.length, 499);
  assert.deepEqual(warns, []);
});

// ── rewriteEventCardTexts ────────────────────────────────────────────────────

test("rewrite (an edit): each card gets the new title and time with ITS OWN note", async () => {
  const world: World = { messages: [card(1), card(2), card(3)], chat_event_cards: [note(1, null), note(2, "Wear red"), note(3, "Wear red")] };
  const { client, ops } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  const result = await rewriteEventCardTexts(client, cards, UPDATE);
  assert.deepEqual(result, { ok: true, updated: 3 });
  assert.equal(content(world, 1), "Event: Fall Formal 2 · Fri Oct 9, 7:30 PM");
  assert.equal(content(world, 2), "Event: Fall Formal 2 · Fri Oct 9, 7:30 PM — Wear red");
  assert.equal(content(world, 3), "Event: Fall Formal 2 · Fri Oct 9, 7:30 PM — Wear red");
  const updates = writes(ops);
  assert.equal(updates.length, 2, "one statement per distinct text");
  for (const u of updates) {
    assert.deepEqual(u.calls.map((c) => c[0]), ["update", "in", "eq", "select"]);
    assert.deepEqual(u.calls[2], ["eq", "kind", "event_card"], "never a message that is not an Event card");
  }
});

test("rewrite (a cancel): every card gets 'Event cancelled: <title>', the note dropped", async () => {
  const world: World = { messages: [card(1), card(2)], chat_event_cards: [note(1, "Wear red"), note(2, null)] };
  const { client, ops } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  assert.deepEqual(await rewriteEventCardTexts(client, cards, CANCEL), { ok: true, updated: 2 });
  assert.equal(content(world, 1), "Event cancelled: Fall Formal");
  assert.equal(content(world, 2), "Event cancelled: Fall Formal");
  assert.equal(writes(ops).length, 1, "one text, one statement");
});

test("rewrite: other events' cards, removed cards and non-card messages keep their text", async () => {
  const world: World = {
    messages: [
      card(1),
      card(2, { removed_at: "2026-10-02T00:00:00Z" }),
      card(3, { card_event_id: OTHER_EVENT }),
      { ...card(4), kind: "text", card_event_id: null, content: "hello" },
    ],
    chat_event_cards: [note(1, null)],
  };
  const { client } = fakeService(world);
  const got = await refreshEventCardTexts(client, EVENT, UPDATE);
  assert.deepEqual(got, { ok: true, updated: 1 });
  assert.equal(content(world, 1), "Event: Fall Formal 2 · Fri Oct 9, 7:30 PM");
  assert.equal(content(world, 2), "Event: Fall Formal · Thu Oct 8, 7:30 PM", "a removed card is skipped");
  assert.equal(content(world, 3), "Event: Fall Formal · Thu Oct 8, 7:30 PM", "another event's card");
  assert.equal(content(world, 4), "hello");
});

test("rewrite: the kind guard holds even if a loaded id is no longer an Event card", async () => {
  const world: World = { messages: [card(1, { kind: "text", card_event_id: null, content: "hello" })], chat_event_cards: [] };
  const { client } = fakeService(world);
  const got = await rewriteEventCardTexts(client, { ids: [mid(1)], notes: new Map() }, CANCEL);
  assert.deepEqual(got, { ok: true, updated: 0 });
  assert.equal(content(world, 1), "hello");
});

test("rewrite: no cards → ok, nothing sent", async () => {
  const { client, ops } = fakeService({ messages: [], chat_event_cards: [] });
  assert.deepEqual(await rewriteEventCardTexts(client, { ids: [], notes: new Map() }, UPDATE), { ok: true, updated: 0 });
  assert.equal(ops.length, 0);
});

test("rewrite: a write that fails is logged and reported, never thrown; the next text still goes out", async (t) => {
  const { errors } = capture(t);
  const world: World = {
    messages: [card(1), card(2)],
    chat_event_cards: [note(1, "Wear red"), note(2, "Bring ID")],
    fail: (op) => (op.kind === "update" && JSON.stringify(op.calls).includes("Wear red") ? { error: { code: "XX000", message: "boom" } } : undefined),
  };
  const { client } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  const got = await rewriteEventCardTexts(client, cards, UPDATE);
  assert.deepEqual(got, { ok: false, updated: 1 });
  assert.equal(content(world, 1), "Event: Fall Formal · Thu Oct 8, 7:30 PM", "the failed one keeps its old text");
  assert.match(String(content(world, 2)), /Bring ID$/);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "[chat/refresh-event-cards] rewrite of the cards' text");
  assert.deepEqual(errors[0].slice(1), ["XX000", "boom"]);
});

test("rewrite: a write that throws → { ok: false }, never a throw", async (t) => {
  const { errors } = capture(t);
  const { client } = fakeService({ messages: [card(1)], chat_event_cards: [], fail: (op) => (op.kind === "update" ? { throws: true } : undefined) });
  assert.deepEqual(await rewriteEventCardTexts(client, { ids: [mid(1)], notes: new Map() }, CANCEL), { ok: false, updated: 0 });
  assert.equal(errors.length, 1);
});

test("rewrite: ids go in batches of 100 (250 cards = 3 statements)", async () => {
  const messages = Array.from({ length: 250 }, (_, i) => card(i + 1));
  const world: World = { messages, chat_event_cards: [] };
  const { client, ops } = fakeService(world);
  const ids = messages.map((m) => m.id as string);
  assert.deepEqual(await rewriteEventCardTexts(client, { ids, notes: new Map() }, CANCEL), { ok: true, updated: 250 });
  const updates = writes(ops);
  assert.deepEqual(updates.map((u) => (u.calls[1][2] as string[]).length), [100, 100, 50]);
});

// ── the bounds of one rewrite (S71 repair R2) ───────────────────────────────

/** `n` cards of the event, each with its OWN note: an edit needs one statement per card. */
function distinctNotes(n: number): World {
  return {
    messages: Array.from({ length: n }, (_, i) => card(i + 1, { content: `Event: Fall Formal · Thu Oct 8, 7:30 PM — note ${i + 1}` })),
    chat_event_cards: Array.from({ length: n }, (_, i) => note(i + 1, `note ${i + 1}`)),
  };
}
const OLD_TEXT = /^Event: Fall Formal · Thu Oct 8, 7:30 PM — note \d+$/;

test("rewrite bounds: the defaults are 50 statements, 10 at a time, 5 seconds", () => {
  assert.deepEqual([MAX_REWRITE_STATEMENTS, REWRITE_CONCURRENCY, REWRITE_BUDGET_MS], [50, 10, 5000]);
});

test("rewrite bounds: 500 cards with 500 distinct notes → at most 50 statements, 10 in flight, the newest 50 rewritten", async (t) => {
  const { warns } = capture(t);
  const world = distinctNotes(500);
  const { client, ops, flight } = fakeService(world);
  const got = await refreshEventCardTexts(client, EVENT, UPDATE);
  assert.equal(writes(ops).length, 50, "50 statements, not 500");
  assert.equal(flight.peak, 10, "10 in flight at once, never more");
  assert.deepEqual(got, { ok: false, updated: 50 }, "ok is false: 450 cards kept their old text");
  for (const n of [500, 499, 451]) assert.equal(content(world, n), `Event: Fall Formal 2 · Fri Oct 9, 7:30 PM — note ${n}`, `card ${n}: the newest are rewritten`);
  for (const n of [450, 100, 1]) assert.match(String(content(world, n)), OLD_TEXT, `card ${n}: past the bound, left as it was`);
  assert.equal(warns.length, 2, "the 500-card cap, then the bounds, each said once");
  assert.match(String(warns[1][0]), /over the bounds \(50 statements, 5000 ms\): 450 statements, 450 cards kept their old text/);
});

test("rewrite bounds: a cancel of 500 cards stays inside them (one text = five statements) and rewrites every card", async (t) => {
  capture(t);
  const world = distinctNotes(500);
  const { client, ops } = fakeService(world);
  assert.deepEqual(await refreshEventCardTexts(client, EVENT, CANCEL), { ok: true, updated: 500 });
  assert.equal(writes(ops).length, 5);
});

test("rewrite bounds: maxStatements cuts the list at the newest cards and says so once", async (t) => {
  const { warns } = capture(t);
  const world = distinctNotes(3);
  const { client, ops } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  assert.deepEqual(await rewriteEventCardTexts(client, cards, UPDATE, { maxStatements: 2, concurrency: 1 }), { ok: false, updated: 2 });
  assert.equal(writes(ops).length, 2);
  assert.match(String(content(world, 3)), /Fall Formal 2/);
  assert.match(String(content(world, 2)), /Fall Formal 2/);
  assert.match(String(content(world, 1)), OLD_TEXT, "the oldest of three is the one left out");
  assert.equal(warns.length, 1);
  assert.match(String(warns[0][0]), /1 statements, 1 cards kept their old text/);
});

test("rewrite bounds: the time budget stops new statements, and what was not sent is reported", async (t) => {
  const { warns } = capture(t);
  let clock = 0;
  const world = distinctNotes(30);
  world.fail = (op) => {
    if (op.kind === "update") clock += 1000; // every statement "takes" a second
    return undefined;
  };
  const { client, ops } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  const got = await rewriteEventCardTexts(client, cards, UPDATE, { concurrency: 1, now: () => clock });
  assert.equal(writes(ops).length, 5, "5 s budget, 1 s each: no sixth statement starts");
  assert.deepEqual(got, { ok: false, updated: 5 });
  assert.match(String(warns[0][0]), /25 statements, 25 cards kept their old text/);
});

test("rewrite bounds: a failure among concurrent statements is logged once each and the others still land", async (t) => {
  const { errors } = capture(t);
  const world = distinctNotes(12);
  world.fail = (op) => (op.kind === "update" && JSON.stringify(op.calls).includes("note 7") ? { error: { code: "XX000", message: "boom" } } : undefined);
  const { client } = fakeService(world);
  const cards = await loadEventCardMessages(client, EVENT);
  assert.ok(cards);
  assert.deepEqual(await rewriteEventCardTexts(client, cards, UPDATE), { ok: false, updated: 11 });
  assert.equal(errors.length, 1);
  assert.match(String(content(world, 7)), /Thu Oct 8/, "the failed one keeps its old text");
});

test("rewrite: the 300-character rule holds for a long title", async () => {
  const world: World = { messages: [card(1)], chat_event_cards: [] };
  const { client } = fakeService(world);
  await rewriteEventCardTexts(client, { ids: [mid(1)], notes: new Map() }, { kind: "cancel", title: "x".repeat(400) });
  assert.equal(Array.from(String(content(world, 1))).length, 300);
});

// ── refreshEventCardTexts ────────────────────────────────────────────────────

test("refresh: a failed read → { ok: false, updated: 0 } and nothing is written", async (t) => {
  capture(t);
  const world: World = {
    messages: [card(1)],
    chat_event_cards: [],
    fail: (op) => (op.table === "messages" ? { error: { code: "XX000", message: "boom" } } : undefined),
  };
  const { client, ops } = fakeService(world);
  assert.deepEqual(await refreshEventCardTexts(client, EVENT, UPDATE), { ok: false, updated: 0 });
  assert.equal(writes(ops).length, 0);
  assert.equal(content(world, 1), "Event: Fall Formal · Thu Oct 8, 7:30 PM");
});

test("refresh: a database without the chat schema → { ok: true, updated: 0 }, silent, nothing written", async (t) => {
  const { errors, warns } = capture(t);
  const { client, ops } = fakeService({
    messages: [],
    chat_event_cards: [],
    fail: () => ({ error: { code: "42703", message: "column messages.kind does not exist" } }),
  });
  assert.deepEqual(await refreshEventCardTexts(client, EVENT, UPDATE), { ok: true, updated: 0 });
  assert.equal(writes(ops).length, 0);
  assert.deepEqual([errors, warns], [[], []]);
});

test("refresh: the cap — only the newest 500 cards are rewritten, and the cap is logged once", async (t) => {
  const { warns } = capture(t);
  const world: World = { messages: Array.from({ length: 510 }, (_, i) => card(i + 1)), chat_event_cards: [] };
  const { client } = fakeService(world);
  assert.deepEqual(await refreshEventCardTexts(client, EVENT, CANCEL), { ok: true, updated: 500 });
  assert.equal(warns.length, 1);
  assert.equal(content(world, 510), "Event cancelled: Fall Formal", "the newest");
  assert.equal(content(world, 10), "Event: Fall Formal · Thu Oct 8, 7:30 PM", "past the cap: left as it was");
});
