/**
 * Tests for `cards/snapshot.ts` (handoffs/chat-redesign/wave-2-contracts.md
 * 5.3) against a fake of the service-role client: the two shapes with no
 * voter names and no ids of people, null for a text message, a missing card
 * row, a failed read, and a database without migration B (3.10).
 *
 * Run with:
 *   node --test src/lib/chat/cards/snapshot.test.ts
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
if (typeof registerHooks !== "function") throw new Error("snapshot.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./snapshot.ts";
const { snapshotCard } = (await import(specifier)) as typeof import("./snapshot");

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown };
type Logged = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq"] as const;

function installService(answer: (table: string, calls: Call[]) => Answer) {
  const log: Logged[] = [];
  const settle = (table: string, calls: Call[]) => {
    const a = answer(table, calls);
    return { data: a.data ?? null, error: a.error ?? null, count: null };
  };
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
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
    },
  };
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = client;
  return log;
}

const arg = (calls: Call[], method: string, column: string): unknown => calls.find((c) => c[0] === method && c[1] === column)?.[2];

const POLL = "bbbbbbbb-0000-4000-8000-000000000001";
const CARD = "bbbbbbbb-0000-4000-8000-000000000003";
const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const OPT = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;

function tables(table: string, calls: Call[]): Answer {
  const id = arg(calls, "eq", "id") ?? arg(calls, "eq", "message_id") ?? arg(calls, "eq", "poll_id");
  if (table === "messages") {
    if (id === POLL) return { data: { kind: "poll", card_event_id: null } };
    if (id === CARD) return { data: { kind: "event_card", card_event_id: EVENT } };
    return { data: { kind: "text", card_event_id: null } };
  }
  if (table === "chat_polls") return { data: { mode: "signup", question: "Bring", anonymous: false, multi: true, closes_at: "2026-10-09T00:00:00+00:00" } };
  if (table === "chat_poll_options") {
    return { data: [{ id: OPT(2), position: 1, label: "Cups", capacity: 5 }, { id: OPT(1), position: 0, label: "Plates", capacity: 2 }] };
  }
  if (table === "chat_poll_votes") return { data: [{ option_id: OPT(1) }, { option_id: OPT(1) }, { option_id: OPT(2) }] };
  if (table === "chat_event_cards") return { data: { note: "Bring a friend" } };
  if (table === "events") return { data: { id: EVENT, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00" } };
  throw new Error(`unexpected read of ${table}`);
}

test("a poll / sign-up: the shape of 5.3, options in position order, counts and no people", async () => {
  const log = installService(tables);
  const snap = await snapshotCard(POLL);
  assert.deepEqual(snap, {
    type: "signup",
    question: "Bring",
    anonymous: false,
    multi: true,
    closes_at: "2026-10-09T00:00:00+00:00",
    options: [
      { label: "Plates", capacity: 2, count: 2 },
      { label: "Cups", capacity: 5, count: 1 },
    ],
  });
  const votes = log.find((l) => l.table === "chat_poll_votes")!.calls;
  assert.deepEqual(votes.find((c) => c[0] === "select"), ["select", "option_id"], "no user_id is ever selected");
  assert.equal(JSON.stringify(snap).includes("user"), false);
  assert.ok(!log.some((l) => l.table === "users"));
});

test("an Event card: event_id, title, starts_at, note", async () => {
  installService(tables);
  assert.deepEqual(await snapshotCard(CARD), {
    type: "event",
    event_id: EVENT,
    title: "Fall Formal",
    starts_at: "2026-10-08T23:30:00+00:00",
    note: "Bring a friend",
  });
});

test("a cancelled event: the three event fields null, the note kept, no events read", async () => {
  const log = installService((table, calls) =>
    table === "messages" ? { data: { kind: "event_card", card_event_id: null } } : tables(table, calls),
  );
  assert.deepEqual(await snapshotCard(CARD), { type: "event", event_id: null, title: null, starts_at: null, note: "Bring a friend" });
  assert.ok(!log.some((l) => l.table === "events"));
});

test("a text message, a missing message, a missing card row: null", async () => {
  installService(tables);
  assert.equal(await snapshotCard("bbbbbbbb-0000-4000-8000-000000000009"), null);
  installService((table, calls) => (table === "messages" ? { data: null } : tables(table, calls)));
  assert.equal(await snapshotCard(POLL), null);
  installService((table, calls) => (table === "chat_polls" ? { data: null } : tables(table, calls)));
  assert.equal(await snapshotCard(POLL), null);
  installService((table, calls) => (table === "chat_event_cards" ? { data: null } : tables(table, calls)));
  assert.equal(await snapshotCard(CARD), null);
});

for (const code of ["42P01", "PGRST205", "PGRST202"]) {
  test(`a database without migration B (${code}) answers null (3.10)`, async () => {
    installService((table, calls) => (table === "chat_polls" ? { error: { code, message: "missing" } } : tables(table, calls)));
    assert.equal(await snapshotCard(POLL), null);
  });
}

for (const failing of ["messages", "chat_polls", "chat_poll_options", "chat_poll_votes", "chat_event_cards", "events"]) {
  test(`a failed ${failing} read answers null`, async () => {
    installService((table, calls) => (table === failing ? { error: { code: "57014", message: "canceling statement" } } : tables(table, calls)));
    assert.equal(await snapshotCard(failing === "chat_event_cards" || failing === "events" ? CARD : POLL), null);
  });
}

test("no service role configured answers null", async () => {
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = undefined;
  assert.equal(await snapshotCard(POLL), null);
});
