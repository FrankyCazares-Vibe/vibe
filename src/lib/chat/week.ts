/**
 * The Messages home's week (handoffs/chat-redesign/wave-2-contracts.md 1.4,
 * last-but-two row; 11.2; W2-S1). Only the home uses it (SPLIT-L4), so it
 * lives apart from `when.ts`.
 *
 * `weekRange(now)` answers Monday 00:00:00.000 to Sunday 23:59:59.999 of the
 * week `now` falls in, in the DEVICE's zone (the Date's local getters, as
 * every screen label), with the heading's `label` (`Oct 5 – 11`, an en dash
 * with spaces; `Sep 28 – Oct 4` across a month) and the strip's `spoken`
 * form (`October 5 to 11`, `September 28 to October 4`). `start` and `end`
 * are what the calendar read sends as `from` / `to` (`toISOString()`), so
 * an RSVP at 11:30 PM on Sunday is still this week's.
 *
 * S71 amendment 4 (the second half of the file): the strip swipes week to
 * week (`weekRangeAt`, `weekTitle`, `swipeDirection`, the bounds) and the
 * month sheet's grid (`monthGrid`, `monthBounds`).
 *
 * PURE: no import, no DOM. Tested in week.test.ts; every function takes `now`.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type WeekRange = {
  /** Monday, 00:00:00.000 local. */
  start: Date;
  /** Sunday, 23:59:59.999 local. */
  end: Date;
  /** `Oct 5 – 11` or `Sep 28 – Oct 4` (an en dash with spaces). */
  label: string;
  /** `October 5 to 11` or `September 28 to October 4`. */
  spoken: string;
};

/** Monday to Sunday around `now`, in the device's zone. */
export function weekRange(now: Date): WeekRange {
  // Monday is day 1; Sunday (0) closes the week, so it counts as six days in.
  const back = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const short = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
  const long = (d: Date) => MONTHS[d.getMonth()];
  const label = sameMonth
    ? `${short(start)} ${start.getDate()} – ${end.getDate()}`
    : `${short(start)} ${start.getDate()} – ${short(end)} ${end.getDate()}`;
  const spoken = sameMonth
    ? `${long(start)} ${start.getDate()} to ${end.getDate()}`
    : `${long(start)} ${start.getDate()} to ${long(end)} ${end.getDate()}`;
  return { start, end, label, spoken };
}

/**
 * The seven local midnights from `start` (the strip's days, Monday first).
 * Built by calendar arithmetic, never by adding 24 hours, so a DST change
 * inside the week keeps every day at 00:00.
 */
export function weekDays(start: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 0, 0, 0, 0));
  }
  return days;
}

/** True when `iso` falls on the local calendar day of `day` (both in the device's zone). */
export function isSameLocalDay(iso: string | Date, day: Date): boolean {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

/* ------------------------------------------------------------------------ *
 * S71 amendment 4: the week strip swipes week to week, and a month sheet.
 * Everything below is calendar arithmetic on the Date's local getters (the
 * device's zone): a week is seven calendar days, never 7 × 24 hours, so the
 * DST change of Nov 1, 2026 moves nothing.
 * ------------------------------------------------------------------------ */

/** The strip's bounds, in weeks from the device's current week (the calendar route's default window). */
export const WEEK_MIN_OFFSET = -4;
export const WEEK_MAX_OFFSET = 26;

/** An offset inside the strip's bounds (a bad number is the current week). */
export function clampWeekOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(WEEK_MAX_OFFSET, Math.max(WEEK_MIN_OFFSET, Math.trunc(offset)));
}

/** The week `offset` weeks after (before, when negative) the week `now` falls in. */
export function weekRangeAt(now: Date, offset: number): WeekRange {
  const base = weekRange(now).start;
  // Noon of that Monday: a day whose midnight a DST change skips still reads as that day.
  return weekRange(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * offset, 12, 0, 0, 0));
}

/** Whole calendar days from the epoch of a local day (compares by date, not by 24-hour spans). */
const dayNumber = (d: Date): number => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** How many weeks `day`'s week is from the week `now` falls in (0 = the same week, 1 = the next). Not clamped. */
export function weekOffsetOf(now: Date, day: Date): number {
  return Math.round((dayNumber(weekRange(day).start) - dayNumber(weekRange(now).start)) / 7);
}

/** The local midnight of `d`'s calendar day. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Whole calendar days from `from` to `to` (1 = `to` is the day after `from`). */
export function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

/** The heading: `Your week` (0), `Next week` (+1), `Last week` (−1), else the range (`Oct 12 – 18`). */
export function weekTitle(offset: number, range: WeekRange): string {
  if (offset === 0) return "Your week";
  if (offset === 1) return "Next week";
  if (offset === -1) return "Last week";
  return range.label;
}

/** What the title row announces and the strip is named: `Next week, October 12 to 18`; past ±1, `Week of October 19 to 25`. */
export function weekSpoken(offset: number, range: WeekRange): string {
  if (offset === 0 || offset === 1 || offset === -1) return `${weekTitle(offset, range)}, ${range.spoken}`;
  return `Week of ${range.spoken}`;
}

/** The week inside a sentence: `this week`, `next week`, `last week`, `the week of October 19 to 25`. */
export function weekWord(offset: number, range: WeekRange): string {
  if (offset === 0) return "this week";
  if (offset === 1) return "next week";
  if (offset === -1) return "last week";
  return `the week of ${range.spoken}`;
}

/** A swipe is at least this far sideways … */
export const SWIPE_MIN_PX = 40;
/** … and this many times further sideways than up or down. */
export const SWIPE_RATIO = 1.5;

/**
 * What a finished drag was: `left` (the finger went left: the NEXT week or
 * month), `right` (the one before), or null (too short, or mostly vertical:
 * the page's scroll is never taken). `dx` / `dy` are end − start.
 */
export function swipeDirection(dx: number, dy: number): "left" | "right" | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const ax = Math.abs(dx);
  if (ax < SWIPE_MIN_PX || ax <= SWIPE_RATIO * Math.abs(dy)) return null;
  return dx < 0 ? "left" : "right";
}

/** A press that ends within this many px of where it began is a tap … */
export const TAP_SLOP_PX = 8;

/**
 * … and anything further is a drag (the month sheet's handle is a Close
 * button AND the place the sheet is dragged from: a drag that lets go
 * without closing must not then count as a press). `dx` / `dy` are end − start.
 */
export function isTap(dx: number, dy: number): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX;
}

/** The day the month sheet opens on from the title: today when the week on screen holds it, else that week's Monday. */
export function sheetStartDay(now: Date, range: WeekRange): Date {
  const t = now.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime() ? startOfLocalDay(now) : range.start;
}

/** A calendar month: `month` is 0 (January) to 11. */
export type MonthRef = { year: number; month: number };

export function monthOf(d: Date): MonthRef {
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** `delta` months after (before) `m`, across years. */
export function addMonths(m: MonthRef, delta: number): MonthRef {
  const d = new Date(m.year, m.month + delta, 1, 12, 0, 0, 0);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Negative when `a` is before `b`, 0 for the same month. */
export function compareMonths(a: MonthRef, b: MonthRef): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** `October`. */
export function monthName(month: number): string {
  return MONTHS[((Math.trunc(month) % 12) + 12) % 12];
}

/** The sheet's bounds: the month holding the first day of the strip's earliest week, to the month holding the last day of its latest. */
export function monthBounds(now: Date): { min: MonthRef; max: MonthRef } {
  return { min: monthOf(weekRangeAt(now, WEEK_MIN_OFFSET).start), max: monthOf(weekRangeAt(now, WEEK_MAX_OFFSET).end) };
}

/** `m` inside the bounds. */
export function clampMonth(m: MonthRef, bounds: { min: MonthRef; max: MonthRef }): MonthRef {
  if (compareMonths(m, bounds.min) < 0) return bounds.min;
  if (compareMonths(m, bounds.max) > 0) return bounds.max;
  return m;
}

export type MonthGrid = MonthRef & {
  /** `October`. */
  name: string;
  /** The grid's first Monday, 00:00:00.000 local (the calendar read's `from`). */
  from: Date;
  /** The grid's last Sunday, 23:59:59.999 local (the read's `to`). */
  to: Date;
  /** Whole weeks, Monday first: the month's days as local midnights, null for a day of another month. */
  cells: (Date | null)[];
};

/** The month's grid, Monday first (4, 5 or 6 whole weeks). `month` past 0–11 rolls into the next or last year. */
export function monthGrid(year: number, month: number): MonthGrid {
  const first = new Date(year, month, 1, 0, 0, 0, 0);
  const y = first.getFullYear();
  const m = first.getMonth();
  const count = new Date(y, m + 1, 0, 12, 0, 0, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const trail = (7 - ((lead + count) % 7)) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(new Date(y, m, d, 0, 0, 0, 0));
  for (let i = 0; i < trail; i++) cells.push(null);
  return {
    year: y,
    month: m,
    name: MONTHS[m],
    from: new Date(y, m, 1 - lead, 0, 0, 0, 0),
    to: new Date(y, m, count + trail, 23, 59, 59, 999),
    cells,
  };
}
