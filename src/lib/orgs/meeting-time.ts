/**
 * When a club meets (the club's view, wave 2; handoffs/2026-10-20-club-view/
 * WAVE2-DESIGN.md C8): one short line the club writes itself, such as
 * "Thursdays · 7 PM, the Lantern Room", shown on the club page to everyone
 * (Privacy Policy 5a, "Club pages"). Stored in `orgs.meeting_time`
 * (migration 20261023100000), '' when the club says nothing.
 *
 * PURE ON PURPOSE: no imports, so the Edit page (client), the route and
 * `meeting-time.test.ts` (plain `node --test`) share one rule. The word
 * filter is the route's job (`checkChangedText`); this file checks only shape.
 */

/** Matches the CHECK `orgs_meeting_time_len`: at most 60 characters (code points). */
export const MEETING_TIME_MAX = 60;

export type MeetingTimeCheck =
  | { ok: true; value: string }
  | { ok: false; code: "meeting_time_invalid"; message: string };

/**
 * Format characters (direction overrides, zero-width marks, soft hyphens,
 * tag characters): dropped, so a public line can't hide or reverse text.
 * Except the zero-width joiner (U+200D), which joined emoji need ("🏳️‍🌈"
 * would split in two without it); the word filter drops it before matching.
 */
const INVISIBLE_OR_BIDI = /(?!‍)\p{Cf}/gu;

/** Any control character left once whitespace became spaces (NUL, BEL, DEL, …). */
const CONTROL = /\p{Cc}/gu;

const TOO_LONG = `Keep it to ${MEETING_TIME_MAX} characters.`;

function refuse(message: string): MeetingTimeCheck {
  return { ok: false, code: "meeting_time_invalid", message };
}

/**
 * The line from a request body or the Edit page's input. Line breaks, tabs
 * and runs of spaces become one space; other control characters go; the
 * ends are trimmed. Empty (or blank) is allowed and clears it. The length
 * counts code points the way Postgres's char_length does, so the CHECK never
 * sees a value this passed.
 */
export function normalizeMeetingTime(raw: unknown): MeetingTimeCheck {
  if (typeof raw !== "string") return refuse("When you meet is one line of text.");
  const value = raw
    .replace(INVISIBLE_OR_BIDI, "")
    .replace(/\s+/g, " ")
    .replace(CONTROL, "")
    .replace(/ {2,}/g, " ")
    .trim();
  if (Array.from(value).length > MEETING_TIME_MAX) return refuse(TOO_LONG);
  return { ok: true, value };
}

/** A stored value as it may be shown: a non-blank string, or null (show nothing). */
export function storedMeetingTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value : null;
}
