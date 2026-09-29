/**
 * Where an event's chat is in its life
 * (handoffs/chat-redesign/wave-1-contracts.md section 6.0):
 *
 *   soon    before the start
 *   live    from the start to the end, both ends included
 *   after   after the end, until the end + 7 days
 *   closed  from the end + 7 days on
 *
 * PURE: the one import is type-only (erased), so `node --test` loads this
 * file with no resolve hook (room-state.test.ts).
 *
 * The boundaries, decided once:
 *   now === starts_at           → live   (the event has begun)
 *   now === ends_at             → live   (the last moment of the event)
 *   now === ends_at + 7 days    → closed (the week is over)
 * Migration A's `can_post_org_channel` owns the real wall; this function
 * only labels rooms for screens and picks the refusal code.
 *
 * Fails closed: a date that cannot be read, a date written without its time
 * zone, or an event that ends before it starts, answers `closed`. Nobody is
 * told a chat is open on a guess.
 */

import type { RoomState } from "./types";

export type { RoomState };

/** How long an event's chat stays open after the event ends. */
export const ROOM_OPEN_AFTER_END_MS = 7 * 24 * 60 * 60 * 1000;

type DateInput = string | Date | null | undefined;
type NowInput = string | number | Date;

/**
 * The only text read as a date: a full timestamp WITH its zone, which is what
 * the database sends for a `timestamptz`. Date, "T" or a space, hours and
 * minutes, optional seconds and fraction, then "Z" or an offset ("+00",
 * "+0000" or "+00:00").
 */
const ZONED_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Milliseconds since the epoch for a zoned timestamp, or null.
 *
 * `Date.parse` is not used: it guesses. It reads "12", "2026" and "Fall
 * Formal 2026" as dates, reads a string with no zone in the machine's own
 * time zone (four hours apart between this Mac and Vercel), turns Feb 30 into
 * Mar 2, and differs between browsers. Here the parts are read by hand, so
 * the same text gives the same answer everywhere, or no answer.
 *
 * Postgres timestamps carry microseconds ("2026-10-08T23:30:00.123456+00:00");
 * they are cut to the millisecond, which is all a 7-day window needs.
 */
function zonedToMs(text: string): number | null {
  const parts = ZONED_TIMESTAMP.exec(text);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6] ?? "0");
  const milli = Number((parts[7] ?? "").slice(0, 3).padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;

  const utc = Date.UTC(year, month - 1, day, hour, minute, second, milli);
  // A day the month does not have (Feb 30, Apr 31) rolls over in Date.UTC,
  // and a year under 100 lands in the 1900s: both show up as a changed date.
  const read = new Date(utc);
  if (read.getUTCFullYear() !== year || read.getUTCMonth() !== month - 1 || read.getUTCDate() !== day) {
    return null;
  }

  const zone = parts[8].toUpperCase();
  if (zone === "Z") return utc;
  const digits = zone.slice(1).replace(":", "");
  const offsetHours = Number(digits.slice(0, 2));
  const offsetMinutes = Number(digits.slice(2, 4) || "0");
  // Postgres itself allows offsets up to 15:59 either way.
  if (offsetHours > 15 || offsetMinutes > 59) return null;
  const offsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  // "19:30-04:00" is 23:30 UTC: a zone behind UTC adds, one ahead subtracts.
  return zone.startsWith("-") ? utc + offsetMs : utc - offsetMs;
}

/** Milliseconds since the epoch, or null when the value is not a date. */
function toMs(value: unknown, epochAllowed = false): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  // Only the clock may be epoch milliseconds (Date.now()). A stored date is
  // never a bare number, so one arriving as starts_at / ends_at is a bug.
  if (typeof value === "number") return epochAllowed && Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  return zonedToMs(value.trim());
}

/**
 * The state of an event's chat at `now`. `starts_at` and `ends_at` are the
 * timestamps the database sends, zone included (a Date is accepted too);
 * `now` defaults to the present and is a parameter so tests and one request
 * share one clock. A clock given as text follows the same rule as the dates:
 * no zone, no answer.
 */
export function roomState(starts_at: DateInput, ends_at: DateInput, now: NowInput = new Date()): RoomState {
  const start = toMs(starts_at);
  const end = toMs(ends_at);
  const at = toMs(now, true);
  if (start === null || end === null || at === null) return "closed";
  if (end < start) return "closed";
  if (at < start) return "soon";
  if (at <= end) return "live";
  if (at < end + ROOM_OPEN_AFTER_END_MS) return "after";
  return "closed";
}
