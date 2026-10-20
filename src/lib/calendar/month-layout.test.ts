/**
 * My Calendar's month layout (Oct 19, 2026, critique B8 repair). Run with:
 *   node --test src/lib/calendar/month-layout.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./month-layout.ts";
const { CAL_MIN_DAY_HEIGHT, chipsThatFit, monthRowCount, rowHeightFor } = (await import(specifier)) as typeof import("./month-layout");

test("a month draws only the rows it needs", () => {
  assert.equal(monthRowCount(2026, 9), 5, "Oct 2026 starts on a Thursday: 4 + 31 = 35");
  assert.equal(monthRowCount(2026, 10), 5, "Nov 2026");
  assert.equal(monthRowCount(2026, 4), 6, "May 2026 starts on a Friday: 5 + 31 = 36");
  assert.equal(monthRowCount(2026, 7), 6, "Aug 2026 starts on a Saturday");
  assert.equal(monthRowCount(2015, 1), 4, "Feb 2015: Sunday the 1st, 28 days");
});

test("rows share the height, never under 64px", () => {
  assert.equal(rowHeightFor(530, 5), 101.2, "(530 - 4 gaps of 6) / 5");
  assert.equal(rowHeightFor(300, 6), CAL_MIN_DAY_HEIGHT);
  assert.equal(rowHeightFor(100, 0), 0);
});

test("chips per day: up to two, fewer when the row is short, with room for +N more", () => {
  // The old fixed 96px day: two chips and the "+N more" line.
  assert.equal(chipsThatFit(96, 4), 2);
  assert.equal(chipsThatFit(96, 2), 2);
  // 1366x768 with a six-row month (about 87px): two alone fit, two plus "+N more" don't.
  assert.equal(chipsThatFit(87, 2), 2);
  assert.equal(chipsThatFit(87, 3), 1);
  // The 64px floor: one chip alone, or only "+N more".
  assert.equal(chipsThatFit(64, 1), 1);
  assert.equal(chipsThatFit(64, 3), 0);
  // Never more chips than entries, and the height not known yet: the full two.
  assert.equal(chipsThatFit(400, 1), 1);
  assert.equal(chipsThatFit(400, 0), 0);
  assert.equal(chipsThatFit(null, 5), 2);
});
