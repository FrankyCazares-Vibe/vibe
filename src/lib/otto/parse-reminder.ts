/**
 * Tiny natural-language time parser for Otto's "remind me to ___" input.
 *
 * Deliberately not an LLM. Just enough rules to catch the most common shapes
 * a student types when scheduling a reminder. Anything we don't recognize is
 * preserved as a no-time reminder (remind_at = null) so the user always gets
 * a row back even if Otto can't pin down a date.
 *
 * Recognized:
 *   today | tonight | tomorrow
 *   next (mon|tue|wed|thu|fri|sat|sun|week|month)
 *   weekday names alone (next occurrence — if it's already that day, jump 7d)
 *   in N (min|minute|hour|day|week)s?
 *   at H | H:MM (am|pm optional, 24h ok)
 *   combined: "tomorrow at 9", "monday at 3pm"
 *
 * Output: { title, remindAt }
 *   - title: original input with the time phrase stripped + leading "to" trimmed
 *   - remindAt: Date | null
 *
 * Today's date is interpreted in the *server's* local TZ (Vercel = UTC), which
 * is close enough for the founder demo. A future pass can take a tz hint.
 */

export type ParsedReminder = {
  title: string;
  remindAt: Date | null;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

function nextWeekday(from: Date, targetDow: number): Date {
  const d = new Date(from);
  const cur = d.getDay();
  let delta = targetDow - cur;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

function setTime(d: Date, hours: number, minutes: number): Date {
  const out = new Date(d);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

/**
 * Strip "remind me to ", "remind me ", leading "to " — Otto's prompt is
 * "remind me to ___" so users will often retype the prefix.
 */
function stripImperative(s: string): string {
  return s
    .replace(/^\s*remind me to\s+/i, "")
    .replace(/^\s*remind me\s+/i, "")
    .replace(/^\s*to\s+/i, "")
    .trim();
}

export function parseReminder(input: string, now: Date = new Date()): ParsedReminder {
  const original = input.trim();
  if (!original) return { title: "", remindAt: null };

  let s = stripImperative(original);
  let base: Date | null = null;
  let consumed = "";

  // ── relative day anchors ────────────────────────────────────────────
  const todayRe = /\b(today)\b/i;
  const tonightRe = /\b(tonight)\b/i;
  const tomorrowRe = /\b(tomorrow|tmrw|tmw)\b/i;

  if (tomorrowRe.test(s)) {
    base = new Date(now);
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    consumed = (s.match(tomorrowRe) || [""])[0];
    s = s.replace(tomorrowRe, "").trim();
  } else if (tonightRe.test(s)) {
    base = setTime(now, 20, 0);
    consumed = (s.match(tonightRe) || [""])[0];
    s = s.replace(tonightRe, "").trim();
  } else if (todayRe.test(s)) {
    base = setTime(now, Math.max(now.getHours() + 1, 9), 0);
    consumed = (s.match(todayRe) || [""])[0];
    s = s.replace(todayRe, "").trim();
  }

  // ── "next <weekday|week|month>" ─────────────────────────────────────
  const nextRe = /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|week|month)\b/i;
  const nextMatch = s.match(nextRe);
  if (!base && nextMatch) {
    const tok = nextMatch[1]!.toLowerCase();
    if (tok === "week") {
      base = new Date(now);
      base.setDate(base.getDate() + 7);
      base.setHours(9, 0, 0, 0);
    } else if (tok === "month") {
      base = new Date(now);
      base.setMonth(base.getMonth() + 1);
      base.setHours(9, 0, 0, 0);
    } else {
      const dow =
        WEEKDAY_SHORT[tok] ?? WEEKDAYS.indexOf(tok as (typeof WEEKDAYS)[number]);
      if (dow >= 0) base = nextWeekday(now, dow);
    }
    s = s.replace(nextRe, "").trim();
  }

  // ── weekday name alone ──────────────────────────────────────────────
  if (!base) {
    const dowRe = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i;
    const m = s.match(dowRe);
    if (m) {
      const tok = m[1]!.toLowerCase();
      const dow =
        WEEKDAY_SHORT[tok] ?? WEEKDAYS.indexOf(tok as (typeof WEEKDAYS)[number]);
      if (dow >= 0) base = nextWeekday(now, dow);
      s = s.replace(dowRe, "").trim();
    }
  }

  // ── "in N units" — wins over base if present (more specific) ────────
  const inRe = /\bin\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)\b/i;
  const inMatch = s.match(inRe);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2]!.toLowerCase();
    const d = new Date(now);
    if (unit.startsWith("min")) d.setMinutes(d.getMinutes() + n);
    else if (unit.startsWith("hr") || unit.startsWith("hour"))
      d.setHours(d.getHours() + n);
    else if (unit.startsWith("day")) d.setDate(d.getDate() + n);
    else if (unit.startsWith("week")) d.setDate(d.getDate() + n * 7);
    base = d;
    s = s.replace(inRe, "").trim();
  }

  // ── "at H[:MM] (am|pm)?" — applies to base, otherwise today ─────────
  const atRe = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const atMatch = s.match(atRe);
  if (atMatch) {
    let hour = Number(atMatch[1]);
    const minute = atMatch[2] ? Number(atMatch[2]) : 0;
    const ampm = atMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    // No AM/PM and 1-7? Assume PM (kids don't schedule 3 AM reminders).
    if (!ampm && hour >= 1 && hour <= 7) hour += 12;
    const anchor = base ?? new Date(now);
    base = setTime(anchor, hour, minute);
    // If anchor was "today" and the resulting time has already passed, bump
    // forward a day so we don't return a remindAt in the past.
    if (!consumed && base.getTime() <= now.getTime()) {
      base.setDate(base.getDate() + 1);
    }
    s = s.replace(atRe, "").trim();
  }

  // Tidy up title: collapse whitespace, strip stray prepositions left
  // dangling by the regex removal ("remind me on" → "on" → drop).
  let title = s
    .replace(/\s{2,}/g, " ")
    .replace(/^(on|by|for)\s+/i, "")
    .replace(/\s+(on|by|for)$/i, "")
    .trim();
  if (!title) title = stripImperative(original);
  if (!title) title = original;

  return { title, remindAt: base };
}
