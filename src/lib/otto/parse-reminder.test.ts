/**
 * Sanity tests for the chrono-lite parser.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/otto/parse-reminder.test.ts
 *
 * If your Node doesn't strip types, compile first:
 *   npx tsc -p . --outDir .build && node --test .build/lib/otto/parse-reminder.test.js
 *
 * These tests are deterministic against a frozen `now` so weekday math is
 * reproducible across runs and CI.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseReminder } from "./parse-reminder";

// Frozen reference: Monday 2026-05-11 12:00:00 local. The handoff stamps
// today's date as 2026-05-11; using that keeps the assertions readable.
const NOW = new Date(2026, 4, 11, 12, 0, 0, 0);

test("plain text → no time, full string preserved", () => {
  const r = parseReminder("call mom", NOW);
  assert.equal(r.title, "call mom");
  assert.equal(r.remindAt, null);
});

test("strips 'remind me to ' prefix", () => {
  const r = parseReminder("remind me to call mom", NOW);
  assert.equal(r.title, "call mom");
});

test("'tomorrow' → next day 9am, title trimmed", () => {
  const r = parseReminder("study for midterm tomorrow", NOW);
  assert.ok(r.remindAt);
  assert.equal(r.remindAt!.getDate(), 12);
  assert.equal(r.remindAt!.getHours(), 9);
  assert.equal(r.title, "study for midterm");
});

test("'tonight' → today 8pm", () => {
  const r = parseReminder("call mom tonight", NOW);
  assert.equal(r.remindAt!.getDate(), 11);
  assert.equal(r.remindAt!.getHours(), 20);
});

test("weekday alone jumps to next occurrence", () => {
  // NOW is Monday → "friday" should give the upcoming Friday (15th).
  const r = parseReminder("astro club friday", NOW);
  assert.equal(r.remindAt!.getDate(), 15);
});

test("'next monday' is a week away, not today", () => {
  const r = parseReminder("standup next monday", NOW);
  assert.equal(r.remindAt!.getDate(), 18);
});

test("'in 2 hours' adds 2 hours to now", () => {
  const r = parseReminder("leave for class in 2 hours", NOW);
  assert.equal(r.remindAt!.getHours(), 14);
  assert.equal(r.title, "leave for class");
});

test("'monday at 3pm' combines weekday + at", () => {
  const r = parseReminder("office hours monday at 3pm", NOW);
  assert.equal(r.remindAt!.getDate(), 18);
  assert.equal(r.remindAt!.getHours(), 15);
});

test("'tomorrow at 9' → 9am next day", () => {
  const r = parseReminder("breakfast tomorrow at 9", NOW);
  assert.equal(r.remindAt!.getDate(), 12);
  assert.equal(r.remindAt!.getHours(), 9);
});

test("bare 'at 3' with no anchor assumes PM today", () => {
  const r = parseReminder("coffee at 3", NOW);
  assert.equal(r.remindAt!.getHours(), 15);
});

test("past today-time bumps forward a day", () => {
  // NOW = 12:00 local — "at 11am" already past, should bump to tomorrow.
  const r = parseReminder("coffee at 11am", NOW);
  assert.equal(r.remindAt!.getDate(), 12);
  assert.equal(r.remindAt!.getHours(), 11);
});

test("unrecognized junk keeps full title, null time", () => {
  const r = parseReminder("blah blah blah", NOW);
  assert.equal(r.remindAt, null);
  assert.equal(r.title, "blah blah blah");
});
