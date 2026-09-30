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
