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
const { readCreateCardBody, isVisiblyBlank } = (await import(specifier)) as typeof import("./body");

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

// ── S71 amendment 2, section 4: NUL and visibly blank text ───────────────────

/** Every character the visibly-blank rule removes: whitespace, text-filter's INVISIBLE, the Hangul fillers and the Braille blank. */
const INVISIBLES = ["\u00AD", "\u200B", "\u200C", "\u200D", "\u200E", "\u200F", "\u2060", "\uFEFF"];
const BLANK_LETTERS = ["\u115F", "\u1160", "\u3164", "\uFFA0", "\u2800"];

test("NUL anywhere in the question, a label or the note is that field's 400, never a 503 later", () => {
  field(poll({ question: "Pizza\u0000?" }), "question");
  field(poll({ question: "\u0000" }), "question");
  field(poll({ question: "  \u0000  " }), "question");
  field(signup({ question: "Bring\u0000 a dish" }), "question");
  field(poll({ options: [{ label: "Pizza" }, { label: "Ta\u0000cos" }] }), "options.1");
  field(poll({ options: [{ label: "\u0000Pizza" }, { label: "Tacos" }] }), "options.0");
  field(signup({ options: [{ label: "Salad", capacity: 3 }, { label: "Bread\u0000", capacity: 2 }] }), "options.1");
  field({ type: "event", event_id: EVENT, note: "Wear red\u0000" }, "note");
  field({ type: "event", event_id: EVENT, note: "\u0000" }, "note");
  field({ type: "event", event_id: EVENT, note: "   \u0000   " }, "note");
  // The first bad field still wins in the rules' order.
  field(poll({ question: "Q\u0000", options: [{ label: "\u0000" }] }), "question");
});

test("isVisiblyBlank: empty once whitespace, the invisible class and the blank letters are gone", () => {
  assert.equal(isVisiblyBlank(""), true);
  assert.equal(isVisiblyBlank(" \t\n\u00A0\u3000"), true);
  for (const c of [...INVISIBLES, ...BLANK_LETTERS]) {
    assert.equal(isVisiblyBlank(c), true, `U+${c.codePointAt(0)?.toString(16)}`);
    assert.equal(isVisiblyBlank(` ${c}${c} `), true);
    assert.equal(isVisiblyBlank(`a${c}`), false);
  }
  assert.equal(isVisiblyBlank(INVISIBLES.join("") + BLANK_LETTERS.join(" ")), true);
  assert.equal(isVisiblyBlank("."), false);
  assert.equal(isVisiblyBlank("\u3165"), false, "a real Hangul letter is visible");
  assert.equal(isVisiblyBlank("\u2801"), false, "a Braille dot is visible");
  // The g flag of the shared class never leaks state between calls.
  assert.equal(isVisiblyBlank("\u200B"), true);
  assert.equal(isVisiblyBlank("\u200B"), true);
});

test("a visibly blank question or label is refused like an empty one", () => {
  for (const c of [...INVISIBLES, ...BLANK_LETTERS]) {
    field(poll({ question: c }), "question");
    field(poll({ question: ` ${c} ${c} ` }), "question");
    field(signup({ question: c.repeat(3) }), "question");
    field(poll({ options: [{ label: "Pizza" }, { label: c }] }), "options.1");
    field(poll({ options: [{ label: ` ${c}\t${c} ` }, { label: "Tacos" }] }), "options.0");
    field(signup({ options: [{ label: c, capacity: 3 }] }), "options.0");
  }
  field(poll({ question: "\u3164\u200B\u2800\u00AD" }), "question");
});

test("a visibly blank note is stored as null, at any length; NUL is still refused", () => {
  for (const c of [...INVISIBLES, ...BLANK_LETTERS]) {
    assert.equal(okEvent({ type: "event", event_id: EVENT, note: ` ${c} ` }).note, null, `U+${c.codePointAt(0)?.toString(16)}`);
  }
  assert.equal(okEvent({ type: "event", event_id: EVENT, note: "\u3164".repeat(300) }).note, null, "over the 200 cap but blank: no note, not a 400");
  assert.equal(okEvent({ type: "event", event_id: EVENT, note: " ".repeat(300) }).note, null, "a long blank note, as today");
  field({ type: "event", event_id: EVENT, note: `x${"\u3164".repeat(200)}` }, "note");
});

test("text with something visible keeps its invisible characters: nothing is stripped", () => {
  assert.equal(okPoll(poll({ question: " Pizza\u200B? " })).question, "Pizza\u200B?");
  assert.equal(okPoll(poll({ question: "\u3164Pizza" })).question, "\u3164Pizza");
  assert.deepEqual(okPoll(poll({ options: [{ label: "Ta\u00ADcos" }, { label: "\u2800 Pizza" }] })).options, [{ label: "Ta\u00ADcos" }, { label: "\u2800 Pizza" }]);
  assert.equal(okEvent({ type: "event", event_id: EVENT, note: " Wear\u2060 red " }).note, "Wear\u2060 red");
});

test("S71b review: text Postgres cannot store is a 400 on its field (closes_at with a NUL; half a surrogate pair)", () => {
  // V8's Date.parse tolerates a trailing NUL, so closes_at needs its own check.
  field(poll({ closes_at: "2026-10-20T00:00:00Z\u0000" }), "closes_at");
  field(signup({ closes_at: "2026-10-20T00:00:00Z\u0000" }), "closes_at");
  // A lone surrogate is not valid UTF-8 once encoded: the insert could only answer "try again".
  field(poll({ question: "lone \ud800 high" }), "question");
  field(poll({ question: "lone \udc00 low" }), "question");
  field(poll({ options: [{ label: "ok" }, { label: "bad \ud83d" }] }), "options.1");
  field({ type: "event", event_id: EVENT, note: "note \udfff" }, "note");
  // A real pair (an emoji) is text like any other.
  const v = ok(poll({ question: "Pizza 🍕?", options: [{ label: "🍕" }, { label: "🌮" }] }));
  assert.equal(v.type === "poll" ? v.question : "", "Pizza 🍕?");
});

test("S71b review: visibly blank also covers format, control, separator and mark characters; emoji and real text are not blank", () => {
  for (const ch of ["⁡", "᠎", "͏", "️", "‮", "⁦", "\u{E0020}", "឵", "؜", "\u0085", "\u001F", "\u007F"]) {
    assert.equal(isVisiblyBlank(ch), true, `U+${ch.codePointAt(0)!.toString(16)}`);
    assert.equal(isVisiblyBlank(`${ch}${ch} ${ch}`), true);
    field(poll({ question: `${ch}${ch}` }), "question");
  }
  for (const text of ["a", "🍕", "é", "​x​", "❤️", "ي", "한"]) {
    assert.equal(isVisiblyBlank(text), false, JSON.stringify(text));
  }
});
