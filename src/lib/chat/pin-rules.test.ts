/**
 * Tests for `pin-rules.ts` (handoffs/chat-redesign/wave-3-desktop/contract.md
 * 4d.3, section 9): `PIN_CAP`, `pinQuote`, `afterCleared`, `pinnedIds`.
 *
 * Run with:
 *   node --test src/lib/chat/pin-rules.test.ts
 *
 * The module imports nothing, so no resolve hook is needed (the
 * `week.test.ts` pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./pin-rules.ts";
const rules = (await import(specifier)) as typeof import("./pin-rules");
const { PIN_CAP, afterCleared, pinQuote, pinnedIds } = rules;

test("PIN_CAP is 20, the number the pin_limit sentence names", () => {
  assert.equal(PIN_CAP, 20);
});

test("pinQuote: no content is the empty string", () => {
  assert.equal(pinQuote(null), "");
  assert.equal(pinQuote(""), "");
  assert.equal(pinQuote("   \n\t  "), "", "only whitespace");
});

test("pinQuote: a short message comes back as it is, trimmed", () => {
  assert.equal(pinQuote("Dues are due Friday"), "Dues are due Friday");
  assert.equal(pinQuote("  Dues are due Friday \n"), "Dues are due Friday");
});

test("pinQuote: every run of whitespace becomes one space (line breaks and tabs too)", () => {
  assert.equal(pinQuote("Room 204\n\nBring\t\tyour   laptop"), "Room 204 Bring your laptop");
  assert.equal(pinQuote("a\r\nb  c"), "a b c", "CRLF and no-break spaces");
});

test("pinQuote: exactly 140 characters is not cut", () => {
  const text = "x".repeat(140);
  assert.equal(pinQuote(text), text);
  assert.equal(pinQuote(`  ${text}  `), text, "the count is taken after the trim");
});

test("pinQuote: 141 characters is cut to 139 and the cut ends with …", () => {
  const got = pinQuote("x".repeat(141));
  assert.equal(got, `${"x".repeat(139)}…`);
  assert.equal(got.length, 140);
});

test("pinQuote: a long message is at most 140 characters and ends with …", () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join("  \n ");
  const got = pinQuote(long);
  assert.ok(got.length <= 140, `length ${got.length}`);
  assert.ok(got.endsWith("…"));
  assert.ok(!/\s/.test(got.replace(/ /g, "")), "single spaces only");
  assert.ok(!got.includes("  "), "no doubled space");
  assert.ok(long.replace(/\s+/g, " ").startsWith(got.slice(0, -1)), "the kept part is the start of the one-line text");
});

test("pinQuote: the cut leaves no space before the …", () => {
  // 138 letters, a space at index 138, then more: the 139-character head ends with the space.
  const got = pinQuote(`${"x".repeat(138)} and the rest of the message`);
  assert.equal(got, `${"x".repeat(138)}…`);
});

test("pinQuote: the cut never splits an emoji", () => {
  // 138 letters, then a two-unit emoji at indexes 138-139, then more text.
  const got = pinQuote(`${"x".repeat(138)}\u{1F389}${"y".repeat(10)}`);
  assert.equal(got, `${"x".repeat(138)}…`, "the half pair is dropped");
  // The whole emoji fits when it ends inside the 139 kept units.
  const fits = pinQuote(`${"x".repeat(137)}\u{1F389}${"y".repeat(10)}`);
  assert.equal(fits, `${"x".repeat(137)}\u{1F389}…`);
  assert.equal(fits.length, 140);
});

test("pinQuote: a cut text is shorter than the whole one (how the panel knows to offer Show all)", () => {
  const full = `${"Bring a laptop. ".repeat(12)}`.trim();
  assert.ok(full.length > 140);
  assert.ok(full.length > pinQuote(full).length);
});

test("afterCleared: no cleared mark means every message counts", () => {
  assert.equal(afterCleared("2026-10-03T14:05:06.123456+00:00", null), true);
  assert.equal(afterCleared("not a date", null), true, "nothing to compare with");
});

test("afterCleared: strictly after the mark, the thread read's own rule", () => {
  const mark = "2026-10-03T14:05:06.500000+00:00";
  assert.equal(afterCleared("2026-10-03T14:05:07.000000+00:00", mark), true, "a second later");
  assert.equal(afterCleared("2026-10-03T14:05:06.000000+00:00", mark), false, "half a second earlier");
  assert.equal(afterCleared(mark, mark), false, "written at the mark itself: hidden, as created_at > cleared_at hides it");
  assert.equal(afterCleared("2026-10-02T23:59:59+00:00", mark), false, "the day before");
});

test("afterCleared: two rows in the same millisecond compare by their microseconds", () => {
  const mark = "2026-10-03T14:05:06.123400+00:00";
  assert.equal(afterCleared("2026-10-03T14:05:06.123401+00:00", mark), true, "one microsecond later");
  assert.equal(afterCleared("2026-10-03T14:05:06.123399+00:00", mark), false, "one microsecond earlier");
  assert.equal(afterCleared("2026-10-03T14:05:06.123456+00:00", "2026-10-03T14:05:06.123Z"), true, "a mark written by toISOString()");
  assert.equal(afterCleared("2026-10-03T14:05:06.123Z", "2026-10-03T14:05:06.123000+00:00"), false, "the same instant, two spellings");
});

test("afterCleared: the two dates may be written in different zones and shapes", () => {
  assert.equal(afterCleared("2026-10-03T10:05:07-04:00", "2026-10-03T14:05:06+00:00"), true);
  assert.equal(afterCleared("2026-10-03T10:05:05-04:00", "2026-10-03T14:05:06Z"), false);
  assert.equal(afterCleared("2026-10-03T14:05:06.5+00:00", "2026-10-03T14:05:06.49+00:00"), true, "short fractions");
});

test("afterCleared: a date that cannot be read is not after (the pin stays hidden)", () => {
  assert.equal(afterCleared("not a date", "2026-10-03T14:05:06+00:00"), false);
  assert.equal(afterCleared("2026-10-03T14:05:06+00:00", "not a date"), false);
  assert.equal(afterCleared("", ""), false);
});

test("pinnedIds: the ids of the pins; null and an empty list are the empty set", () => {
  assert.equal(pinnedIds(null).size, 0);
  assert.equal(pinnedIds([]).size, 0);
  const ids = pinnedIds([{ message_id: "a" }, { message_id: "b" }, { message_id: "a" }]);
  assert.deepEqual([...ids].sort(), ["a", "b"]);
  assert.equal(ids.has("a"), true);
  assert.equal(ids.has("c"), false);
});

test("pinnedIds: takes whole PinnedMessage rows and gives a new set each time", () => {
  const pins = [{ message_id: "m1", pinned_at: "2026-10-03T14:05:06+00:00", text: "Dues" }];
  const first = pinnedIds(pins);
  assert.equal(first.has("m1"), true);
  assert.notEqual(pinnedIds(pins), first, "a caller that keeps one never sees another call change it");
});
