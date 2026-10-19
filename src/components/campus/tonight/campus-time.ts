/**
 * Campus time for the Tonight surfaces (Oct 19 2026): which calendar day it
 * is ON CAMPUS and how a time reads there ("5:00 PM", "Thu 5", "Sat, Nov 7").
 *
 * WHY NOT THE DEVICE'S CLOCK ZONE. A student visiting home in California at
 * 9 PM is still asking about tonight in Indianapolis, and the school's
 * calendars are written in campus time. So every answer here goes through
 * Intl with the campus zone, never `new Date().getHours()`.
 *
 * WHY DAYS ARE BUILT FROM WALL DATES. Nov 1 2026 is 25 hours long on campus
 * (clocks fall back) and Mar 14 2027 is 23. Stepping by 24 h would land an
 * hour off on those days, so a day is "local midnight to the next local
 * midnight", found from the wall date each time.
 *
 * PURE: no React, no DOM. `CAMPUS_TIME_ZONE` comes from a file with only
 * type imports, so node:test and the client can both load this.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.1.
 */
import { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

/** One campus calendar day: "2026-11-07", "Sat, Nov 7", and its bounds in ms (end exclusive). */
export type CampusDay = { key: string; label: string; start: number; end: number };

/** The campus wall clock's numbers at one instant. */
type WallNumbers = { year: number; month: number; day: number; hour: number; minute: number; second: number };

// Built once: an Intl formatter is slow to make and these run per row.
// `hourCycle: "h23"` because some engines print midnight as "24" with
// `hour12: false`.
const NUMERIC = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});
// The names carry their own day number, so "Thu 5" is one call, not two.
const SHORT_NAMES = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const LONG_NAMES = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "long",
  month: "short",
  day: "numeric",
});
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Newer ICU puts a narrow no-break space before "PM". The boards and the
 * live app print a plain space, and the server's ICU and the browser's can
 * differ, so every string is normalized to plain spaces.
 */
function plainSpaces(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
}

function partsOf(fmt: Intl.DateTimeFormat, ms: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(ms)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/**
 * The numbers only (one Intl call). The names are a separate call, so the
 * hour checks that run for every row (midnight, "Tonight" after 5 PM) and the
 * day maths never pay for weekday and month names they don't print.
 */
function wallNumbers(ms: number): WallNumbers {
  const n = partsOf(NUMERIC, ms);
  return {
    year: Number(n.year),
    month: Number(n.month),
    day: Number(n.day),
    hour: Number(n.hour) % 24,
    minute: Number(n.minute),
    second: Number(n.second),
  };
}

/** "Sat", "Nov", "7" (or "Saturday" with `long`), in one Intl call. */
function wallNames(ms: number, long = false): { weekday: string; month: string; day: string } {
  const n = partsOf(long ? LONG_NAMES : SHORT_NAMES, ms);
  return { weekday: n.weekday ?? "", month: n.month ?? "", day: n.day ?? "" };
}

/** How far campus wall time is ahead of UTC at `ms` (negative: Indiana is behind). */
function offsetAt(ms: number): number {
  const w = wallNumbers(ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The UTC ms of a campus wall time. Guess with today's offset, then check it
 * once more: the offset can differ on the far side of a clock change.
 * Midnight is never inside a skipped or repeated hour on campus (the clocks
 * change at 2 AM), so midnight always has exactly one answer.
 */
function wallToMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = guess - offsetAt(guess);
  const second = guess - offsetAt(first);
  return second;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The day that starts at campus midnight of this wall date (month1 is 1-12; overflow rolls). */
function dayFromWallDate(year: number, month1: number, day: number): CampusDay {
  // Date.UTC normalizes "Nov 31" to "Dec 1", which is what adding days needs.
  const norm = new Date(Date.UTC(year, month1 - 1, day));
  const y = norm.getUTCFullYear();
  const m = norm.getUTCMonth() + 1;
  const d = norm.getUTCDate();
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const start = wallToMs(y, m, d, 0, 0);
  const end = wallToMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0);
  const w = wallNames(start);
  return {
    key: `${y}-${pad2(m)}-${pad2(d)}`,
    label: `${w.weekday}, ${w.month} ${d}`,
    start,
    end,
  };
}

/** The campus calendar day holding `ms` (DST-safe: Nov 1 2026 is 25 h, Mar 14 2027 is 23 h). */
export function campusDay(ms: number): CampusDay {
  const w = wallNumbers(ms);
  return dayFromWallDate(w.year, w.month, w.day);
}

/** `n` campus days later (or earlier), by wall date, never by 24 h steps. */
export function addCampusDays(day: CampusDay, n: number): CampusDay {
  const [y, m, d] = day.key.split("-").map(Number);
  return dayFromWallDate(y, m, d + Math.trunc(n));
}

/** "5:00 PM" in campus time. */
export function campusClock(ms: number): string {
  return plainSpaces(CLOCK.format(ms));
}

/** "Thu 5": the week tiles and the next-up rows. */
export function campusShortDay(ms: number): string {
  const w = wallNames(ms);
  return `${w.weekday} ${w.day}`;
}

/** "Thursday, Nov 5": what a week tile reads aloud. */
export function campusLongDay(ms: number): string {
  const w = wallNames(ms, true);
  return `${w.weekday}, ${w.month} ${w.day}`;
}

/** "Wed, Nov 11 · 6:30 PM": the school cards in "Coming up". */
export function campusDateTime(ms: number): string {
  const w = wallNames(ms);
  return `${w.weekday}, ${w.month} ${w.day} · ${campusClock(ms)}`;
}

/** True at 12:00 AM on campus: an event that ends then reads " to midnight", not " to 12:00 AM". */
export function isCampusMidnight(ms: number): boolean {
  const w = wallNumbers(ms);
  return w.hour === 0 && w.minute === 0;
}

/** The campus hour, 0-23 ("Tonight" starts at 17). */
export function campusHour(ms: number): number {
  return wallNumbers(ms).hour;
}
