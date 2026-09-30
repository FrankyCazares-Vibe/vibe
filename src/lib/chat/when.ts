/**
 * Time and date labels for the chat screens and for the stored card
 * fallback text (handoffs/chat-redesign/wave-2-contracts.md section 1.4).
 *
 * PURE: `room-state.ts` and `push/event-notice.ts` (a constant) are the only
 * imports, so a client component may import this and `node --test` loads it
 * (when.test.ts, through the repo's resolve hook for the "@/" alias).
 *
 * Two zones:
 *   - the screens format in the DEVICE's zone (as today's `relativeTime`):
 *     `rowTime`, `rowTimeSpoken`, `eventTime`, `eventTimeShort`, `isSoon`,
 *     `moreDays` read the Date's local getters;
 *   - the server formats the stored fallback text in `CAMPUS_TIME_ZONE`
 *     (both campuses are Eastern; the server runs in UTC): `eventWhen`,
 *     `eventWhenSpoken` take a zone and read it through `Intl`.
 *
 * Every relative function takes `now`, so tests are deterministic. Strings
 * are assembled from parts, never from `toLocaleString`: ICU 72+ puts a
 * narrow no-break space before AM/PM, and the mockups' shape drops the
 * comma after the weekday and the `:00`. A date that cannot be read answers
 * "" (`moreDays`: 1); nothing here throws for a bad input.
 *
 * `weekRange` lives in week.ts (W2-S1); `eventWhenText` beside the constant
 * in event-notice.ts is NOT reused (its shape is "Fri, Oct 3, 7:00 PM").
 * Never re-format a `timestamptz` string before handing it back to a route.
 */

import { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

import { roomState } from "./room-state";

export { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long an event's chat stays open after the event ends (room-state.ts `ROOM_OPEN_AFTER_END_MS`). */
const OPEN_AFTER_END_MS = 7 * DAY_MS;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
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

/** The calendar fields of one moment, in one zone. */
type Parts = {
  year: number;
  /** 0-11 */
  month: number;
  day: number;
  /** 0 = Sunday */
  weekday: number;
  /** 0-23 */
  hour: number;
  minute: number;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** The device zone: the Date's own getters. */
function localParts(d: Date): Parts {
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    weekday: d.getDay(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

/** A named zone, through `Intl`; null when the zone is unknown. */
function zonedParts(d: Date, zone: string): Parts | null {
  let list: Intl.DateTimeFormatPart[];
  try {
    list = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "long",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(d);
  } catch {
    return null;
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => list.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday") as (typeof WEEKDAYS)[number]);
  const parts: Parts = {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday,
    // Some ICU builds write midnight as "24".
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
  if (weekday < 0 || [parts.year, parts.month, parts.day, parts.hour, parts.minute].some((n) => !Number.isFinite(n))) {
    return null;
  }
  return parts;
}

/** `7:30 PM`; `7 PM` on the hour when `dropZero`. */
function clock(p: Parts, dropZero: boolean): string {
  const h12 = p.hour % 12 || 12;
  const period = p.hour < 12 ? "AM" : "PM";
  if (dropZero && p.minute === 0) return `${h12} ${period}`;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${period}`;
}

const weekdayOf = (p: Parts, long: boolean) => (long ? WEEKDAYS[p.weekday] : WEEKDAYS[p.weekday].slice(0, 3));
const monthOf = (p: Parts, long: boolean) => (long ? MONTHS[p.month] : MONTHS[p.month].slice(0, 3));

/** Whole days since the epoch of a local calendar day, so two moments compare by date, not by 24-hour spans. */
function dayIndex(p: Parts): number {
  return Math.floor(Date.UTC(p.year, p.month, p.day) / DAY_MS);
}

/** Inbox rows, Board bylines, person rows: `8:44 PM`, `Yesterday`, `Wed`, `Oct 5`, `Oct 5, 2025`. */
export function rowTime(iso: string | Date | null | undefined, now: Date): string {
  return rowLabel(iso, now, false);
}

/** `rowTime` for `aria-label`s: `8:44 PM`, `Yesterday`, `Wednesday`, `October 5`, `October 5, 2025`. */
export function rowTimeSpoken(iso: string | Date | null | undefined, now: Date): string {
  return rowLabel(iso, now, true);
}

function rowLabel(iso: string | Date | null | undefined, now: Date, spoken: boolean): string {
  const d = toDate(iso);
  const at = toDate(now);
  if (!d || !at) return "";
  const p = localParts(d);
  const n = localParts(at);
  const days = dayIndex(n) - dayIndex(p);
  if (days === 0) return clock(p, false);
  if (days === 1) return "Yesterday";
  if (days >= 2 && days <= 6) return weekdayOf(p, spoken);
  const date = `${monthOf(p, spoken)} ${p.day}`;
  return p.year === n.year ? date : `${date}, ${p.year}`;
}

/**
 * Up next, Where/When: `Tonight · 7:30 PM` (today, starting at 17:00 or
 * later), `Today · 7:30 PM`, `Tomorrow · 7 PM`, `Fri · 7 PM` (within 6
 * days), else `Oct 8 · 7:30 PM`. Minutes only when not `:00`.
 */
export function eventTime(starts_at: string | Date | null | undefined, now: Date): string {
  return eventLabel(starts_at, now, false);
}

/** `eventTime` for week cards, chips and the state pill: `7:30 PM`, `Fri 7 PM`, `Oct 8 7:30 PM`. */
export function eventTimeShort(starts_at: string | Date | null | undefined, now: Date): string {
  return eventLabel(starts_at, now, true);
}

function eventLabel(starts_at: string | Date | null | undefined, now: Date, short: boolean): string {
  const d = toDate(starts_at);
  const at = toDate(now);
  if (!d || !at) return "";
  const p = localParts(d);
  const n = localParts(at);
  const days = dayIndex(p) - dayIndex(n);
  const time = clock(p, true);
  if (days === 0) return short ? time : `${p.hour >= 17 ? "Tonight" : "Today"} · ${time}`;
  if (days === 1) return short ? time : `Tomorrow · ${time}`;
  const day = days >= 2 && days <= 6 ? weekdayOf(p, false) : `${monthOf(p, false)} ${p.day}`;
  return short ? `${day} ${time}` : `${day} · ${time}`;
}

/** The chat is `soon` AND the event starts within 24 hours (a 1 AM event tapped at 10 PM counts). */
export function isSoon(
  starts_at: string | Date | null | undefined,
  ends_at: string | Date | null | undefined,
  now: Date,
): boolean {
  if (roomState(starts_at, ends_at, now) !== "soon") return false;
  const start = toDate(starts_at);
  const at = toDate(now);
  if (!start || !at) return false;
  return start.getTime() - at.getTime() <= DAY_MS;
}

/** The fallback text and the event card's date line, in `zone`: `Thu Oct 8, 7:30 PM` (`Thu Oct 8, 7 PM` on the hour). */
export function eventWhen(starts_at: string | Date | null | undefined, zone: string = CAMPUS_TIME_ZONE): string {
  const d = toDate(starts_at);
  const p = d ? zonedParts(d, zone) : null;
  if (!p) return "";
  return `${weekdayOf(p, false)} ${monthOf(p, false)} ${p.day}, ${clock(p, true)}`;
}

/** `eventWhen` for `aria-label`s: `Thursday October 8, 7:30 PM`. */
export function eventWhenSpoken(starts_at: string | Date | null | undefined, zone: string = CAMPUS_TIME_ZONE): string {
  const d = toDate(starts_at);
  const p = d ? zonedParts(d, zone) : null;
  if (!p) return "";
  return `${weekdayOf(p, true)} ${monthOf(p, true)} ${p.day}, ${clock(p, true)}`;
}

/** `Ended · chat open N more days`: `ceil((ends_at + 7 d − now) / 1 d)`, at least 1. */
export function moreDays(ends_at: string | Date | null | undefined, now: Date): number {
  const end = toDate(ends_at);
  const at = toDate(now);
  if (!end || !at) return 1;
  return Math.max(1, Math.ceil((end.getTime() + OPEN_AFTER_END_MS - at.getTime()) / DAY_MS));
}
