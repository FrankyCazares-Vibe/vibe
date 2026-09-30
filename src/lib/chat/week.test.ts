/**
 * Tests for `week.ts` (handoffs/chat-redesign/wave-2-contracts.md 1.4, 11.2).
 *
 * Run with:
 *   node --test src/lib/chat/week.test.ts
 *
 * Every date is built with the local `Date` constructor, so the answers hold
 * in any TZ the test runs in (the screens format in the device's zone).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./week.ts";
const { isSameLocalDay, weekDays, weekRange } = (await import(specifier)) as typeof import("./week");

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0, 0);

test("weekRange: a Thursday gives Monday 00:00 to Sunday 23:59:59.999 of that week", () => {
  const r = weekRange(local(2026, 9, 8, 21, 0)); // Thu Oct 8, 2026
  assert.equal(r.start.getTime(), local(2026, 9, 5).getTime(), "Monday Oct 5, 00:00");
  assert.equal(r.end.getTime(), new Date(2026, 9, 11, 23, 59, 59, 999).getTime(), "Sunday Oct 11, 23:59:59.999");
  assert.equal(r.label, "Oct 5 – 11");
  assert.equal(r.spoken, "October 5 to 11");
});

test("weekRange: Monday and Sunday both belong to the same week (Monday first, Sunday last)", () => {
  const mon = weekRange(local(2026, 9, 5, 0, 0));
  const sun = weekRange(local(2026, 9, 11, 23, 59));
  assert.equal(mon.label, "Oct 5 – 11");
  assert.equal(sun.label, "Oct 5 – 11");
  assert.equal(mon.start.getTime(), sun.start.getTime());
  assert.equal(mon.end.getTime(), sun.end.getTime());
});

test("weekRange: across a month the label names both months", () => {
  const r = weekRange(local(2026, 9, 1, 12, 0)); // Thu Oct 1, 2026
  assert.equal(r.start.getTime(), local(2026, 8, 28).getTime(), "Monday Sep 28");
  assert.equal(r.label, "Sep 28 – Oct 4");
  assert.equal(r.spoken, "September 28 to October 4");
});

test("weekRange: across a year the label names both months and no year", () => {
  const r = weekRange(local(2026, 11, 31, 9, 0)); // Thu Dec 31, 2026
  assert.equal(r.start.getTime(), local(2026, 11, 28).getTime(), "Monday Dec 28");
  assert.equal(r.end.getTime(), new Date(2027, 0, 3, 23, 59, 59, 999).getTime(), "Sunday Jan 3, 2027");
  assert.equal(r.label, "Dec 28 – Jan 3");
  assert.equal(r.spoken, "December 28 to January 3");
});

test("weekRange: the DST week keeps its Sunday at 23:59:59.999 local", () => {
  // US DST ends Sunday Nov 1, 2026; the week is Mon Oct 26 – Sun Nov 1.
  const r = weekRange(local(2026, 9, 28, 8, 0));
  assert.equal(r.start.getTime(), local(2026, 9, 26).getTime());
  assert.equal(r.end.getTime(), new Date(2026, 10, 1, 23, 59, 59, 999).getTime());
  assert.equal(r.label, "Oct 26 – Nov 1");
});

test("weekDays: seven local midnights from Monday, through a DST change", () => {
  const days = weekDays(local(2026, 9, 26));
  assert.equal(days.length, 7);
  assert.deepEqual(
    days.map((d) => [d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]),
    [
      [9, 26, 0, 0],
      [9, 27, 0, 0],
      [9, 28, 0, 0],
      [9, 29, 0, 0],
      [9, 30, 0, 0],
      [9, 31, 0, 0],
      [10, 1, 0, 0],
    ],
  );
  assert.equal(days[0].getDay(), 1, "Monday first");
  assert.equal(days[6].getDay(), 0, "Sunday last");
});

test("isSameLocalDay: compares calendar days in the device's zone, and refuses a bad date", () => {
  const day = local(2026, 9, 8);
  assert.equal(isSameLocalDay(local(2026, 9, 8, 23, 59), day), true);
  assert.equal(isSameLocalDay(local(2026, 9, 9, 0, 0), day), false);
  assert.equal(isSameLocalDay(local(2026, 9, 8, 19, 30).toISOString(), day), true);
  assert.equal(isSameLocalDay("not a date", day), false);
});
