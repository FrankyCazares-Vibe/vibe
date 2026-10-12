/**
 * Tests for the Numbers tab's pure helpers (`view.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/tally/view.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./view.ts";
const { NUMBERS_DAYS, NUMBERS_WEEK_DAYS, toOpenRows, totalOpens, utcDay, windowStart } = (await import(
  specifier
)) as typeof import("./view");

// 9:30 pm in Indiana on Oct 12 is already Oct 13 in UTC, the day the database stamps.
const NOW = new Date("2026-10-13T01:30:00Z");

test("days are UTC dates", () => {
  assert.equal(utcDay(NOW), "2026-10-13");
  assert.equal(utcDay(NOW, 1), "2026-10-12");
  assert.equal(utcDay(new Date("2026-03-01T00:00:00Z"), 1), "2026-02-28");
});

test("a window counts today: 7 days start 6 back, 30 days start 29 back", () => {
  assert.equal(NUMBERS_WEEK_DAYS, 7);
  assert.equal(NUMBERS_DAYS, 30);
  assert.equal(windowStart(NOW, NUMBERS_WEEK_DAYS), "2026-10-07");
  assert.equal(windowStart(NOW, NUMBERS_DAYS), "2026-09-14");
  assert.equal(windowStart(NOW, 1), "2026-10-13");
  assert.equal(windowStart(NOW, 0), "2026-10-13");
});

test("rows are cleaned: an unknown page, a bad day or a bad count is dropped", () => {
  const rows = toOpenRows([
    { day: "2026-10-13", page: "home", label: "ig-vibe", opens: 4 },
    { day: "2026-10-13", page: "campus", label: "", opens: 9 },
    { day: "Oct 13", page: "home", label: "", opens: 9 },
    { day: "2026-10-13", page: "home", label: "", opens: -1 },
    { day: "2026-10-13", page: "home", label: "", opens: 1.5 },
    { day: "2026-10-13", page: "home", label: "", opens: "many" },
    { day: "2026-10-13", page: "waitlist", label: null, opens: "12" },
    null,
    "home",
  ]);
  assert.deepEqual(rows, [
    { day: "2026-10-13", page: "home", label: "ig-vibe", opens: 4 },
    { day: "2026-10-13", page: "waitlist", label: "", opens: 12 },
  ]);
  assert.deepEqual(toOpenRows(null), []);
  assert.deepEqual(toOpenRows(undefined), []);
});

test("rows read newest day first, then front page, waitlist, sign-up, then the busiest label", () => {
  const rows = toOpenRows([
    { day: "2026-10-12", page: "home", label: "", opens: 3 },
    { day: "2026-10-13", page: "signup", label: "", opens: 1 },
    { day: "2026-10-13", page: "waitlist", label: "landing", opens: 5 },
    { day: "2026-10-13", page: "home", label: "b", opens: 2 },
    { day: "2026-10-13", page: "home", label: "a", opens: 2 },
    { day: "2026-10-13", page: "home", label: "ig-vibe", opens: 8 },
  ]);
  assert.deepEqual(
    rows.map((r) => `${r.day} ${r.page} ${r.label || "-"} ${r.opens}`),
    [
      "2026-10-13 home ig-vibe 8",
      "2026-10-13 home a 2",
      "2026-10-13 home b 2",
      "2026-10-13 waitlist landing 5",
      "2026-10-13 signup - 1",
      "2026-10-12 home - 3",
    ],
  );
});

test("totals per page: the last 7 days sit inside the last 30, and older or future days count in neither", () => {
  const rows = toOpenRows([
    { day: "2026-10-13", page: "home", label: "", opens: 10 },
    { day: "2026-10-13", page: "home", label: "ig-vibe", opens: 5 },
    { day: "2026-10-07", page: "home", label: "", opens: 1 }, // the 7th day back, still in the week
    { day: "2026-10-06", page: "home", label: "", opens: 100 }, // just outside the week
    { day: "2026-09-14", page: "home", label: "", opens: 1000 }, // the 30th day, still in
    { day: "2026-09-13", page: "home", label: "", opens: 7777 }, // too old
    { day: "2026-10-14", page: "home", label: "", opens: 9999 }, // a clock ahead of the server's
    { day: "2026-10-12", page: "waitlist", label: "landing", opens: 6 },
  ]);
  assert.deepEqual(totalOpens(rows, NOW), {
    home: { last7: 16, last30: 1116 },
    waitlist: { last7: 6, last30: 6 },
    signup: { last7: 0, last30: 0 },
  });
});

test("no rows: every page totals nought", () => {
  assert.deepEqual(totalOpens([], NOW), {
    home: { last7: 0, last30: 0 },
    waitlist: { last7: 0, last30: 0 },
    signup: { last7: 0, last30: 0 },
  });
});
