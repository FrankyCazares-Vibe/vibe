/**
 * Tests for `cards/body.ts` (handoffs/chat-redesign/wave-2-contracts.md 4.2,
 * the field names of 4.1.6).
 *
 * Run with:
 *   node --test src/lib/chat/cards/body.test.ts
 *
 * The resolve hook is for `@/lib/pgrest` (the `orgs/following.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("body.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./body.ts";
const { readCreateCardBody } = (await import(specifier)) as typeof import("./body");

const NOW = new Date("2026-10-08T21:00:00Z");
const EVENT = "0f5c2a0e-3b7d-4c8e-9a1b-2c3d4e5f6a7b";
const poll = (over: Record<string, unknown> = {}) => ({
  type: "poll",
  question: "Pizza or tacos?",
  options: [{ label: "Pizza" }, { label: "Tacos" }],
  ...over,
});
const signup = (over: Record<string, unknown> = {}) => ({
  type: "signup",
  question: "Bring a dish",
  options: [{ label: "Salad", capacity: 3 }],
  ...over,
});
type Clean = import("./body").CleanCardBody;
function ok(body: unknown): Clean {
  const r = readCreateCardBody(body, NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) throw new Error("unreachable");
  return r.value;
}
function okAs<T extends Clean["type"]>(body: unknown, type: T): Extract<Clean, { type: T }> {
  const v = ok(body);
  assert.equal(v.type, type);
  return v as Extract<Clean, { type: T }>;
}
const okPoll = (body: unknown) => okAs(body, "poll");
const okSignup = (body: unknown) => okAs(body, "signup");
const okEvent = (body: unknown) => okAs(body, "event");
const field = (body: unknown, expected: string) => {
  const r = readCreateCardBody(body, NOW);
  assert.deepEqual(r, { ok: false, field: expected }, JSON.stringify(body));
};

test("a poll: the flags default to false, closes_at to null, nothing else comes through", () => {
  assert.deepEqual(okPoll(poll({ extra: 1 })), {
    type: "poll",
    question: "Pizza or tacos?",
    options: [{ label: "Pizza" }, { label: "Tacos" }],
    anonymous: false,
    multi: false,
    closes_at: null,
  });
  assert.deepEqual(okPoll(poll({ anonymous: true, multi: true, closes_at: "2026-10-09T00:00:00Z" })), {
    type: "poll",
    question: "Pizza or tacos?",
    options: [{ label: "Pizza" }, { label: "Tacos" }],
    anonymous: true,
    multi: true,
    closes_at: "2026-10-09T00:00:00Z",
  });
});

test("a sign-up: capacities kept, no flags", () => {
  assert.deepEqual(okSignup(signup({ anonymous: true, multi: "yes" })), {
    type: "signup",
    question: "Bring a dish",
    options: [{ label: "Salad", capacity: 3 }],
    closes_at: null,
  });
});

test("an event: a uuid and a note, trimmed, blank to null", () => {
  assert.deepEqual(okEvent({ type: "event", event_id: EVENT }), { type: "event", event_id: EVENT, note: null });
  assert.deepEqual(okEvent({ type: "event", event_id: EVENT, note: "  Wear red  " }), { type: "event", event_id: EVENT, note: "Wear red" });
  assert.deepEqual(okEvent({ type: "event", event_id: EVENT, note: "   " }), { type: "event", event_id: EVENT, note: null });
  assert.deepEqual(okEvent({ type: "event", event_id: EVENT, note: null }), { type: "event", event_id: EVENT, note: null });
  assert.deepEqual(okEvent({ type: "event", event_id: EVENT, note: "x".repeat(200) }).note, "x".repeat(200));
  field({ type: "event", event_id: EVENT, note: "x".repeat(201) }, "note");
  field({ type: "event", event_id: EVENT, note: 5 }, "note");
  field({ type: "event", event_id: "not-a-uuid" }, "event_id");
  field({ type: "event" }, "event_id");
  assert.equal(okEvent({ type: "event", event_id: EVENT.toUpperCase(), question: "ignored" }).type, "event", "case does not matter; unknown keys are ignored");
});

test("type: one of the three, else the body is not a card at all", () => {
  field({}, "type");
  field(null, "type");
  field("poll", "type");
  field([], "type");
  field({ type: "quiz" }, "type");
  field({ type: "Poll" }, "type");
});

test("question: a string, trimmed, 1 to 200 characters (code points)", () => {
  field(poll({ question: undefined }), "question");
  field(poll({ question: 5 }), "question");
  field(poll({ question: "   " }), "question");
  assert.equal(okPoll(poll({ question: "  Pizza?  " })).question, "Pizza?");
  assert.equal(okPoll(poll({ question: "x".repeat(200) })).question, "x".repeat(200));
  field(poll({ question: "x".repeat(201) }), "question");
  assert.equal(okPoll(poll({ question: "🎉".repeat(200) })).question, "🎉".repeat(200), "200 astral characters, 400 UTF-16 units");
  field(poll({ question: "🎉".repeat(201) }), "question");
});

test("options: an array, poll 2 to 10, sign-up 1 to 10", () => {
  field(poll({ options: undefined }), "options");
  field(poll({ options: "Pizza" }), "options");
  field(poll({ options: [{ label: "Pizza" }] }), "options");
  field(signup({ options: [] }), "options");
  const eleven = Array.from({ length: 11 }, (_, i) => ({ label: `o${i}` }));
  field(poll({ options: eleven }), "options");
  assert.equal(okPoll(poll({ options: eleven.slice(0, 10) })).options.length, 10);
  assert.equal(okSignup(signup({ options: [{ label: "One", capacity: 1 }] })).options.length, 1);
});

test("options.<n>: a label, trimmed and collapsed, 1 to 80; the index is the bad one's", () => {
  field(poll({ options: [{ label: "Pizza" }, "Tacos"] }), "options.1");
  field(poll({ options: [{ label: "Pizza" }, {}] }), "options.1");
  field(poll({ options: [{ label: "   " }, { label: "Tacos" }] }), "options.0");
  field(poll({ options: [{ label: "Pizza" }, { label: "x".repeat(81) }] }), "options.1");
  const v = okPoll(poll({ options: [{ label: "  Deep \n dish\tpizza  " }, { label: "x".repeat(80) }] }));
  assert.deepEqual(v?.options, [{ label: "Deep dish pizza" }, { label: "x".repeat(80) }]);
});

test("capacity: a sign-up wants an integer 1 to 50; a poll option may not carry one", () => {
  field(signup({ options: [{ label: "Salad" }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: 0 }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: 51 }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: 2.5 }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: "3" }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: null }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: 3 }, { label: "Bread", capacity: 999 }] }), "options.1");
  assert.equal(okSignup(signup({ options: [{ label: "Salad", capacity: 50 }] })).options[0].capacity, 50);
  field(poll({ options: [{ label: "Pizza" }, { label: "Tacos", capacity: 3 }] }), "options.1");
  field(poll({ options: [{ label: "Pizza" }, { label: "Tacos", capacity: null }] }), "options.1");
});

test("anonymous and multi: booleans or absent", () => {
  field(poll({ anonymous: "yes" }), "anonymous");
  field(poll({ anonymous: 1 }), "anonymous");
  field(poll({ multi: null }), "multi");
  assert.equal(okPoll(poll({ anonymous: false, multi: true })).type, "poll");
});

test("closes_at: absent or null is null; a parseable time after now is kept as sent; else the field", () => {
  assert.equal(okPoll(poll({ closes_at: null })).closes_at, null);
  assert.equal(okPoll(poll({ closes_at: "2026-10-08T21:00:01Z" })).closes_at, "2026-10-08T21:00:01Z");
  assert.equal(okSignup(signup({ closes_at: "2026-10-09T01:00:00+00:00" })).closes_at, "2026-10-09T01:00:00+00:00");
  field(poll({ closes_at: "2026-10-08T21:00:00Z" }), "closes_at");
  field(poll({ closes_at: "2026-10-08T20:59:59Z" }), "closes_at");
  field(poll({ closes_at: "tomorrow" }), "closes_at");
  field(poll({ closes_at: "" }), "closes_at");
  field(poll({ closes_at: 1791234567890 }), "closes_at");
  field(signup({ closes_at: "2020-01-01T00:00:00Z" }), "closes_at");
});

test("the first bad field wins, in the rules' order", () => {
  field(poll({ question: "", options: "x", anonymous: "x" }), "question");
  field(poll({ options: "x", anonymous: "x", closes_at: "x" }), "options");
  field(poll({ anonymous: "x", closes_at: "x" }), "anonymous");
  field(poll({ multi: "x", closes_at: "x" }), "multi");
});
