/**
 * Tests for `week.ts` (handoffs/chat-redesign/wave-2-contracts.md 1.4, 11.2;
 * S71 amendment 4: the swiped week and the month grid, from "weekRangeAt" down).
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
const week = (await import(specifier)) as typeof import("./week");
const { isSameLocalDay, weekDays, weekRange } = week;

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

/* ------------------------------ S71 amendment 4 ------------------------------ */

// Friday Oct 2, 2026, 3:00 PM on the device (its week is Sep 28 – Oct 4).
const NOW = local(2026, 9, 2, 15, 0);

test("weekRangeAt: offset 0 is weekRange(now); +1 and −1 are the weeks beside it", () => {
  assert.deepEqual(week.weekRangeAt(NOW, 0), weekRange(NOW));
  const next = week.weekRangeAt(NOW, 1);
  assert.equal(next.start.getTime(), local(2026, 9, 5).getTime(), "Monday Oct 5, 00:00");
  assert.equal(next.end.getTime(), new Date(2026, 9, 11, 23, 59, 59, 999).getTime());
  assert.equal(next.label, "Oct 5 – 11");
  const last = week.weekRangeAt(NOW, -1);
  assert.equal(last.start.getTime(), local(2026, 8, 21).getTime(), "Monday Sep 21");
  assert.equal(last.label, "Sep 21 – 27");
});

test("weekRangeAt: every week of the window starts on a Monday at 00:00 and ends on its Sunday at 23:59:59.999 (through the Nov 1 and Mar 14 DST changes)", () => {
  let before: Date | null = null;
  for (let o = week.WEEK_MIN_OFFSET; o <= week.WEEK_MAX_OFFSET; o++) {
    const r = week.weekRangeAt(NOW, o);
    assert.equal(r.start.getDay(), 1, `offset ${o} starts on a Monday`);
    assert.deepEqual([r.start.getHours(), r.start.getMinutes(), r.start.getMilliseconds()], [0, 0, 0], `offset ${o} starts at 00:00`);
    assert.equal(r.end.getDay(), 0, `offset ${o} ends on a Sunday`);
    assert.deepEqual([r.end.getHours(), r.end.getMinutes(), r.end.getSeconds(), r.end.getMilliseconds()], [23, 59, 59, 999]);
    assert.equal(week.dayDiff(r.start, r.end), 6, `offset ${o} is seven calendar days`);
    if (before) assert.equal(week.dayDiff(before, r.start), 7, `offset ${o} starts seven calendar days after the one before`);
    before = r.start;
  }
  // The DST week itself (Mon Oct 26 – Sun Nov 1, 2026) is offset +4 from Oct 2.
  assert.equal(week.weekRangeAt(NOW, 4).label, "Oct 26 – Nov 1");
  assert.equal(week.weekRangeAt(NOW, 5).start.getTime(), local(2026, 10, 2).getTime(), "the Monday after the change is Nov 2, 00:00");
});

test("weekRangeAt: the bounds are 4 weeks back and 26 ahead", () => {
  assert.equal(week.weekRangeAt(NOW, week.WEEK_MIN_OFFSET).label, "Aug 31 – Sep 6");
  assert.equal(week.weekRangeAt(NOW, week.WEEK_MAX_OFFSET).label, "Mar 29 – Apr 4");
  assert.equal(week.weekRangeAt(NOW, week.WEEK_MAX_OFFSET).start.getFullYear(), 2027);
});

test("clampWeekOffset: −4 to 26, whole weeks, a bad number is the current week", () => {
  assert.equal(week.clampWeekOffset(0), 0);
  assert.equal(week.clampWeekOffset(-4), -4);
  assert.equal(week.clampWeekOffset(-5), -4);
  assert.equal(week.clampWeekOffset(26), 26);
  assert.equal(week.clampWeekOffset(27), 26);
  assert.equal(week.clampWeekOffset(2.9), 2);
  assert.equal(week.clampWeekOffset(Number.NaN), 0);
});

test("weekOffsetOf: the weeks between today's week and a day's week, both ways and across the DST change", () => {
  assert.equal(week.weekOffsetOf(NOW, local(2026, 8, 28)), 0, "Monday of this week");
  assert.equal(week.weekOffsetOf(NOW, new Date(2026, 9, 4, 23, 59, 59, 999)), 0, "Sunday night of this week");
  assert.equal(week.weekOffsetOf(NOW, local(2026, 9, 5)), 1, "the next Monday");
  assert.equal(week.weekOffsetOf(NOW, local(2026, 8, 27, 23, 0)), -1, "last Sunday");
  assert.equal(week.weekOffsetOf(NOW, local(2026, 10, 1, 12, 0)), 4, "Sunday Nov 1 (the DST day)");
  assert.equal(week.weekOffsetOf(NOW, local(2026, 10, 2)), 5, "Monday Nov 2");
  assert.equal(week.weekOffsetOf(NOW, local(2027, 0, 1)), 13, "Jan 1, 2027 (the week of Dec 28)");
  for (let o = -6; o <= 30; o++) {
    assert.equal(week.weekOffsetOf(NOW, week.weekRangeAt(NOW, o).start), o);
    assert.equal(week.weekOffsetOf(NOW, week.weekRangeAt(NOW, o).end), o);
  }
});

test("weekTitle / weekSpoken / weekWord: Your week, Next week, Last week, else the range", () => {
  const at = (o: number) => week.weekRangeAt(local(2026, 9, 8), o); // the week of Oct 5 – 11
  assert.equal(week.weekTitle(0, at(0)), "Your week");
  assert.equal(week.weekTitle(1, at(1)), "Next week");
  assert.equal(week.weekTitle(-1, at(-1)), "Last week");
  assert.equal(week.weekTitle(2, at(2)), "Oct 19 – 25");
  assert.equal(week.weekTitle(-2, at(-2)), "Sep 21 – 27");
  assert.equal(week.weekTitle(3, at(3)), "Oct 26 – Nov 1");
  assert.equal(week.weekSpoken(0, at(0)), "Your week, October 5 to 11");
  assert.equal(week.weekSpoken(1, at(1)), "Next week, October 12 to 18");
  assert.equal(week.weekSpoken(-1, at(-1)), "Last week, September 28 to October 4");
  assert.equal(week.weekSpoken(2, at(2)), "Week of October 19 to 25");
  assert.equal(week.weekWord(0, at(0)), "this week");
  assert.equal(week.weekWord(1, at(1)), "next week");
  assert.equal(week.weekWord(-1, at(-1)), "last week");
  assert.equal(week.weekWord(3, at(3)), "the week of October 26 to November 1");
});

test("swipeDirection: at least 40px sideways and more than 1.5× the vertical move; left is the next week", () => {
  assert.equal(week.swipeDirection(-40, 0), "left");
  assert.equal(week.swipeDirection(40, 0), "right");
  assert.equal(week.swipeDirection(-39.9, 0), null, "too short");
  assert.equal(week.swipeDirection(39, 0), null);
  assert.equal(week.swipeDirection(-60, 39), "left", "60 > 1.5 × 39");
  assert.equal(week.swipeDirection(-60, 40), null, "60 is not more than 1.5 × 40");
  assert.equal(week.swipeDirection(60, -40), null);
  assert.equal(week.swipeDirection(90, -59), "right");
  assert.equal(week.swipeDirection(-10, 200), null, "a vertical scroll is never a swipe");
  assert.equal(week.swipeDirection(0, 0), null, "a tap");
  assert.equal(week.swipeDirection(Number.NaN, 0), null);
});

test("isTap: a press that ends within 8px of its start; a drag of the sheet's handle is not one", () => {
  assert.equal(week.isTap(0, 0), true, "a tap, or a key press");
  assert.equal(week.isTap(3, -8), true, "a finger's wobble");
  assert.equal(week.isTap(0, 9), false, "the sheet was dragged down and let go");
  assert.equal(week.isTap(0, 240), false, "a drag that closed it");
  assert.equal(week.isTap(-9, 0), false);
  assert.equal(week.isTap(Number.NaN, 0), false);
  assert.equal(week.TAP_SLOP_PX < week.SWIPE_MIN_PX, true, "a swipe is never also a tap");
});

test("sheetStartDay: today when the week on screen holds it, else that week's Monday", () => {
  assert.equal(week.sheetStartDay(NOW, week.weekRangeAt(NOW, 0)).getTime(), local(2026, 9, 2).getTime());
  assert.equal(week.sheetStartDay(NOW, week.weekRangeAt(NOW, 1)).getTime(), local(2026, 9, 5).getTime());
  assert.equal(week.sheetStartDay(NOW, week.weekRangeAt(NOW, -1)).getTime(), local(2026, 8, 21).getTime());
  assert.equal(week.startOfLocalDay(local(2026, 9, 2, 23, 59)).getTime(), local(2026, 9, 2).getTime());
});

test("dayDiff: calendar days, not 24-hour spans", () => {
  assert.equal(week.dayDiff(local(2026, 9, 2, 23, 59), local(2026, 9, 3, 0, 1)), 1, "two minutes apart, the next day");
  assert.equal(week.dayDiff(local(2026, 9, 2, 0, 1), local(2026, 9, 2, 23, 59)), 0);
  assert.equal(week.dayDiff(local(2026, 9, 31), local(2026, 10, 2)), 2, "across the 25-hour Nov 1");
  assert.equal(week.dayDiff(local(2026, 9, 3), local(2026, 9, 2)), -1);
});

test("monthGrid: October 2026 is five weeks, Monday first, three blanks before the 1st and one after the 31st", () => {
  const g = week.monthGrid(2026, 9);
  assert.equal(g.name, "October");
  assert.deepEqual([g.year, g.month], [2026, 9]);
  assert.equal(g.cells.length, 35);
  assert.deepEqual(g.cells.slice(0, 4).map((c) => c?.getDate() ?? null), [null, null, null, 1], "Oct 1, 2026 is a Thursday");
  assert.equal(g.cells[33]?.getDate(), 31);
  assert.equal(g.cells[34], null, "Sunday Nov 1 is a blank cell");
  assert.equal(g.from.getTime(), local(2026, 8, 28).getTime(), "the read starts on Monday Sep 28, 00:00");
  assert.equal(g.to.getTime(), new Date(2026, 10, 1, 23, 59, 59, 999).getTime(), "and ends on Sunday Nov 1, 23:59:59.999 (the DST day)");
  for (const c of g.cells) if (c) assert.deepEqual([c.getMonth(), c.getHours(), c.getMinutes()], [9, 0, 0]);
  g.cells.forEach((c, i) => {
    if (c) assert.equal((c.getDay() + 6) % 7, i % 7, `cell ${i} sits under its weekday`);
  });
});

test("monthGrid: four weeks (Feb 2027), six weeks (Aug 2026), a leap February, and a month past December", () => {
  const feb = week.monthGrid(2027, 1); // Feb 1, 2027 is a Monday; 28 days
  assert.equal(feb.cells.length, 28);
  assert.equal(feb.cells.every((c) => c !== null), true);
  assert.equal(feb.from.getTime(), local(2027, 1, 1).getTime());
  assert.equal(feb.to.getTime(), new Date(2027, 1, 28, 23, 59, 59, 999).getTime());
  const aug = week.monthGrid(2026, 7); // Aug 1, 2026 is a Saturday; 31 days
  assert.equal(aug.cells.length, 42);
  assert.equal(aug.cells.filter((c) => c !== null).length, 31);
  assert.equal(aug.from.getTime(), local(2026, 6, 27).getTime());
  assert.equal(aug.to.getTime(), new Date(2026, 8, 6, 23, 59, 59, 999).getTime());
  assert.equal(week.monthGrid(2028, 1).cells.filter((c) => c !== null).length, 29, "Feb 2028 has 29 days");
  const jan = week.monthGrid(2026, 12);
  assert.deepEqual([jan.year, jan.month, jan.name], [2027, 0, "January"]);
  // March 2027 holds the spring DST change (Mar 14): still 31 midnights.
  const mar = week.monthGrid(2027, 2);
  assert.equal(mar.cells.filter((c) => c !== null).length, 31);
  assert.equal(mar.cells.length % 7, 0);
});

test("monthBounds / clampMonth / addMonths / compareMonths / monthName", () => {
  const b = week.monthBounds(NOW);
  assert.deepEqual(b.min, { year: 2026, month: 7 }, "the week of Aug 31 – Sep 6 starts in August");
  assert.deepEqual(b.max, { year: 2027, month: 3 }, "the week of Mar 29 – Apr 4 ends in April");
  assert.deepEqual(week.clampMonth({ year: 2026, month: 6 }, b), b.min);
  assert.deepEqual(week.clampMonth({ year: 2027, month: 4 }, b), b.max);
  assert.deepEqual(week.clampMonth({ year: 2026, month: 9 }, b), { year: 2026, month: 9 });
  assert.deepEqual(week.addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(week.addMonths({ year: 2027, month: 0 }, -1), { year: 2026, month: 11 });
  assert.deepEqual(week.addMonths({ year: 2026, month: 9 }, 0), { year: 2026, month: 9 });
  assert.equal(week.compareMonths({ year: 2026, month: 11 }, { year: 2027, month: 0 }), -1);
  assert.equal(week.compareMonths({ year: 2027, month: 0 }, { year: 2027, month: 0 }), 0);
  assert.deepEqual(week.monthOf(NOW), { year: 2026, month: 9 });
  assert.equal(week.monthName(9), "October");
  assert.equal(week.monthName(-1), "December");
});
