/**
 * Tests for `cards/fallback.ts` (handoffs/chat-redesign/wave-2-contracts.md 5.1).
 *
 * Run with:
 *   node --test src/lib/chat/cards/fallback.test.ts
 *
 * The resolve hook is for `../when`, which reaches `CAMPUS_TIME_ZONE`
 * through the "@/…" alias (the `orgs/following.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("fallback.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./fallback.ts";
const { FALLBACK_MAX, cardFallbackContent } = (await import(specifier)) as typeof import("./fallback");

test("the four shapes", () => {
  assert.equal(cardFallbackContent({ type: "poll", question: "Pizza or tacos?" }), "Poll: Pizza or tacos?");
  assert.equal(cardFallbackContent({ type: "signup", question: "Bring a dish" }), "Sign-up: Bring a dish");
  assert.equal(
    cardFallbackContent({ type: "event", title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z", note: null }),
    "Event: Fall Formal · Thu Oct 8, 7:30 PM",
  );
  assert.equal(
    cardFallbackContent({ type: "event", title: "Fall Formal", starts_at: "2026-10-08T23:00:00Z", note: "Wear red" }),
    "Event: Fall Formal · Thu Oct 8, 7 PM — Wear red",
  );
  assert.equal(cardFallbackContent({ type: "event_cancelled", title: "Fall Formal" }), "Event cancelled: Fall Formal");
});

test("a cancelled event: whitespace collapsed, the 300-character cut, an astral title, never empty", () => {
  assert.equal(cardFallbackContent({ type: "event_cancelled", title: " Fall\n\n Formal\t" }), "Event cancelled: Fall Formal");
  const exact = cardFallbackContent({ type: "event_cancelled", title: "x".repeat(283) });
  assert.equal(exact.length, 300);
  assert.equal(exact.endsWith("x"), true, "300 is kept whole");
  const over = cardFallbackContent({ type: "event_cancelled", title: "x".repeat(284) });
  assert.equal(over.length, 300);
  assert.equal(over.endsWith("x…"), true);
  assert.equal(over.slice(0, 299), `Event cancelled: ${"x".repeat(282)}`);
  const emoji = cardFallbackContent({ type: "event_cancelled", title: "🎉".repeat(300) });
  assert.equal(Array.from(emoji).length, 300);
  assert.equal(emoji.endsWith("🎉…"), true);
  assert.equal(cardFallbackContent({ type: "event_cancelled", title: "" }), "Event cancelled:");
});

test("a cancelled event has no time: the zone plays no part", () => {
  assert.equal(
    cardFallbackContent({ type: "event_cancelled", title: "Fall Formal" }, "Mars/Olympus"),
    "Event cancelled: Fall Formal",
  );
});

test("the event's time is campus time by default, or the zone given", () => {
  const input = { type: "event" as const, title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z", note: null };
  assert.equal(cardFallbackContent(input, "UTC"), "Event: Fall Formal · Thu Oct 8, 11:30 PM");
  assert.equal(cardFallbackContent(input, "America/Indiana/Indianapolis"), cardFallbackContent(input));
});

test("a blank note adds nothing", () => {
  const base = { type: "event" as const, title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z" };
  assert.equal(cardFallbackContent({ ...base, note: "" }), "Event: Fall Formal · Thu Oct 8, 7:30 PM");
  assert.equal(cardFallbackContent({ ...base, note: "   " }), "Event: Fall Formal · Thu Oct 8, 7:30 PM");
});

test("whitespace is collapsed, newlines included", () => {
  assert.equal(cardFallbackContent({ type: "poll", question: "  Pizza \n\n or\ttacos?  " }), "Poll: Pizza or tacos?");
  assert.equal(
    cardFallbackContent({ type: "event", title: " Fall\nFormal ", starts_at: "2026-10-08T23:30:00Z", note: " Wear\n red " }),
    "Event: Fall Formal · Thu Oct 8, 7:30 PM — Wear red",
  );
});

test("cut to 300 characters, the 300th replaced by an ellipsis; counted in code points", () => {
  assert.equal(FALLBACK_MAX, 300);
  const exact = cardFallbackContent({ type: "poll", question: "x".repeat(294) });
  assert.equal(exact.length, 300);
  assert.equal(exact.endsWith("x"), true, "300 is kept whole");
  const over = cardFallbackContent({ type: "poll", question: "x".repeat(295) });
  assert.equal(over.length, 300);
  assert.equal(over.endsWith("x…"), true);
  assert.equal(over.slice(0, 299), `Poll: ${"x".repeat(293)}`);
  const emoji = cardFallbackContent({ type: "poll", question: "🎉".repeat(300) });
  assert.equal(Array.from(emoji).length, 300);
  assert.equal(emoji.endsWith("🎉…"), true, "an astral character is one character, never split");
});

test("never empty: a title alone, a bad date, or a bad zone still leaves the label", () => {
  assert.equal(cardFallbackContent({ type: "event", title: "Fall Formal", starts_at: "nope", note: null }), "Event: Fall Formal ·");
  assert.equal(cardFallbackContent({ type: "event", title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z", note: null }, "Mars/Olympus"), "Event: Fall Formal ·");
});
