/**
 * Tests for compose/sheet-rules.ts (handoffs/chat-redesign/wave-2-contracts.md
 * 11.7, 1.2 "The tray and the three sheets"; W2-S3): the room line, the share
 * CTA, the counters and the validity of the three bodies.
 *
 * Run with:
 *   node --test src/components/mobile/messages/compose/sheet-rules.test.ts
 *
 * The module imports only types, so no resolve hook is needed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// A variable specifier: TypeScript refuses a literal `.ts` import without
// `allowImportingTsExtensions`, while Node needs the extension to load it.
const specifier = "./sheet-rules.ts";
const s = (await import(specifier)) as typeof import("./sheet-rules");

test("charCount counts code points; cleanText collapses whitespace", () => {
  assert.equal(s.charCount("abc"), 3);
  assert.equal(s.charCount("🎉🎉"), 2);
  assert.equal(s.charCount(""), 0);
  assert.equal(s.cleanText("  Havana \n  Nights  "), "Havana Nights");
});

test("counterText / counterLabel", () => {
  assert.equal(s.counterText(24, 200), "24 / 200");
  assert.equal(s.counterLabel(24, 200), "24 of 200 characters");
});

test("sheetRoomLine: <club> · the Lounge / the Board / <event title> / <room>", () => {
  assert.equal(s.sheetRoomLine("Salsa Club", "lounge", "Lounge"), "Salsa Club · the Lounge");
  assert.equal(s.sheetRoomLine("Salsa Club", "board", "Board"), "Salsa Club · the Board");
  assert.equal(s.sheetRoomLine("Salsa Club", "event", "Fall Formal"), "Salsa Club · Fall Formal");
  assert.equal(s.sheetRoomLine("Salsa Club", "room", "Rides"), "Salsa Club · Rides");
  assert.equal(s.sheetRoomLine("Salsa Club", "officers", "Officers"), "Salsa Club · Officers");
});

test("shareCta", () => {
  assert.equal(s.shareCta("lounge", "Lounge"), "Share to the Lounge");
  assert.equal(s.shareCta("board", "Board"), "Share to the Board");
  assert.equal(s.shareCta("event", "Fall Formal"), "Share to the event chat");
  assert.equal(s.shareCta("room", "Rides"), "Share to Rides");
  assert.equal(s.shareCta("officers", "Officers"), "Share to Officers");
});

test("spotsWord / optionName / slotName / removeLabel / spotsForLabel", () => {
  assert.equal(s.spotsWord(1), "1 spot");
  assert.equal(s.spotsWord(2), "2 spots");
  assert.equal(s.optionName(1), "Option 1");
  assert.equal(s.slotName(3), "Slot 3");
  assert.equal(s.removeLabel("Havana Nights", "Option 1"), "Remove Havana Nights");
  assert.equal(s.removeLabel("   ", "Option 2"), "Remove Option 2");
  assert.equal(s.spotsForLabel("Mon 11–12", "Slot 1"), "Spots for Mon 11–12");
  assert.equal(s.spotsForLabel("", "Slot 1"), "Spots for Slot 1");
});

test("pollValid: question 1–200, 2–10 non-blank labels ≤ 80", () => {
  assert.equal(s.pollValid("Theme?", ["A", "B"]), true);
  assert.equal(s.pollValid("Theme?", ["A"]), false);
  assert.equal(s.pollValid("Theme?", ["A", "  "]), false);
  assert.equal(s.pollValid("   ", ["A", "B"]), false);
  assert.equal(s.pollValid("x".repeat(200), ["A", "B"]), true);
  assert.equal(s.pollValid("x".repeat(201), ["A", "B"]), false);
  assert.equal(s.pollValid("Theme?", ["A", "b".repeat(81)]), false);
  assert.equal(s.pollValid("Theme?", Array.from({ length: 10 }, (_, i) => `o${i}`)), true);
  assert.equal(s.pollValid("Theme?", Array.from({ length: 11 }, (_, i) => `o${i}`)), false);
});

test("signupValid: title 1–200, 1–10 slots with capacity 1–50", () => {
  assert.equal(s.signupValid("Tabling shifts", [{ label: "Mon 11–12", capacity: 2 }]), true);
  assert.equal(s.signupValid("Tabling shifts", []), false);
  assert.equal(s.signupValid("Tabling shifts", [{ label: "", capacity: 2 }]), false);
  assert.equal(s.signupValid("Tabling shifts", [{ label: "Mon", capacity: 0 }]), false);
  assert.equal(s.signupValid("Tabling shifts", [{ label: "Mon", capacity: 51 }]), false);
  assert.equal(s.signupValid("Tabling shifts", [{ label: "Mon", capacity: 2.5 }]), false);
  assert.equal(s.signupValid("", [{ label: "Mon", capacity: 2 }]), false);
});

test("eventValid: an event picked and the note ≤ 200", () => {
  assert.equal(s.eventValid("e1", ""), true);
  assert.equal(s.eventValid("e1", "n".repeat(200)), true);
  assert.equal(s.eventValid("e1", "n".repeat(201)), false);
  assert.equal(s.eventValid(null, ""), false);
  assert.equal(s.eventValid("", ""), false);
});

test("stepCapacity stays within 1–50", () => {
  assert.equal(s.stepCapacity(2, 1), 3);
  assert.equal(s.stepCapacity(1, -1), 1);
  assert.equal(s.stepCapacity(50, 1), 50);
});
