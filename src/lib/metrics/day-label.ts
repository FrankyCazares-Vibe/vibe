/**
 * Day labels for the metrics screens — "Today", "Yesterday", "Tuesday",
 * "Sep 3", "Sep 3, 2025".
 *
 * Why a file of its own: the profile-views ledger stores two different kinds
 * of time and they must not be rendered by the same clock.
 * `profile_views.first_viewed_at` is a timestamp (a real instant, fine to read
 * in the reader's local time), while `post_views.viewed_on` and
 * `profile_views.viewed_on` are DATE columns written on the UTC calendar
 * (src/app/api/me/profile-views/route.ts does its window math in UTC). Turning
 * a UTC date into a local Date and asking it what day it is moves it a day
 * backwards for anyone west of Greenwich — a viewer who looked on Tuesday
 * reads as Monday. So the date-grained helper stays on the UTC calendar and
 * the timestamp helper stays local, and callers pick by column type.
 *
 * Second reason these words exist at all: the ledger dedupes one row per
 * viewer per day, so "2 hours ago" would be a number we never stored. A day
 * name is the finest honest grain (wave plan, handoffs/2026-09-14, rule 5).
 *
 * Pure functions, no React — the phone sheets in wave B reuse them.
 */

const DAY_MS = 86_400_000;

/** Past this many days the weekday name repeats, so it stops being a date. */
const WEEKDAY_DAYS = 6;

/**
 * Fixed locale: the alternative is the browser's, which would print a Spanish
 * weekday inside otherwise-English copy on a phone set to Spanish. One campus,
 * one voice — translating the app is a whole project, not a side effect.
 */
const LOCALE = "en-US";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight local, for counting calendar days rather than 24-hour blocks. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Midnight UTC for a YYYY-MM-DD, or null when the string isn't one. */
function utcMidnight(yyyyMmDd: string): number | null {
  const m = DATE_RE.exec(yyyyMmDd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const at = Date.UTC(year, month - 1, day);
  const back = new Date(at);
  // Round-trip rejects "2026-02-31", which Date.UTC would roll into March.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return at;
}

/**
 * Label for a timestamp column (`profile_views.first_viewed_at`), read on the
 * reader's own clock.
 *
 * Returns "" for a string that isn't a date — the caller renders nothing
 * rather than the word "Invalid Date". A timestamp in the future (clock skew
 * between the browser and the database) reads as "Today", never as a negative
 * day count.
 */
export function dayLabelFromTimestamp(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= WEEKDAY_DAYS) return then.toLocaleDateString(LOCALE, { weekday: "long" });
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
  }
  return then.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Label for a DATE column (`viewed_on`), computed entirely on the UTC
 * calendar because that is the calendar the row was written on.
 *
 * `todayUtc` defaults to today's UTC date and is a parameter so tests — and a
 * caller that already knows the server's day — don't have to mock the clock.
 * Returns "" when either string isn't a YYYY-MM-DD.
 */
export function dayLabelFromDate(
  yyyyMmDd: string,
  todayUtc: string = new Date().toISOString().slice(0, 10),
): string {
  const then = utcMidnight(yyyyMmDd);
  const today = utcMidnight(todayUtc);
  if (then === null || today === null) return "";
  const days = Math.round((today - then) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const at = new Date(then);
  if (days <= WEEKDAY_DAYS) {
    return at.toLocaleDateString(LOCALE, { weekday: "long", timeZone: "UTC" });
  }
  if (at.getUTCFullYear() === new Date(today).getUTCFullYear()) {
    return at.toLocaleDateString(LOCALE, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return at.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
