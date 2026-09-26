import type { StripTrend, StripUpcoming } from "./strip-data";

/**
 * Pure view logic for `RollingStrip` (S67 wave 1, contracts C1), kept out of
 * the component so node tests can load it: no React, no fetch, no DOM. Only
 * `import type` from strip-data.ts, so Node's type stripping never loads the
 * hook module (which pulls in React) when this file is under test.
 *
 * What lives here: the chip order and the 14-day window, the "is there
 * anything to show" rule that hides the strip, the desktop roll decision,
 * the tag toggle, the lead-in word, and the chip copy (titles, aria-labels).
 */

/** Events shown, at most. Tags shown, at most. Days ahead an event may be. */
export const STRIP_MAX_EVENTS = 3;
export const STRIP_MAX_TAGS = 8;
export const STRIP_WINDOW_DAYS = 14;

/** The track only rolls when it overflows by more than this many pixels. */
export const ROLL_SLACK_PX = 8;

export type StripChip =
  | {
      kind: "event";
      id: string;
      title: string;
      /** "Today" / "Tmrw" / "Fri" / "Oct 3" from `formatUpcomingChip`. */
      when: string;
      status: "going" | "maybe";
      startsAt: string;
    }
  | { kind: "tag"; tag: string; count: number };

/** A chip, or the one "Couldn't load · Retry" chip a failed source gets. */
export type StripEntry =
  | StripChip
  | { kind: "failed"; source: "upcoming" | "trending"; message: string };

/** The slice of `StripData` these helpers read (structural, so tests pass literals). */
export type StripEmptyInput = {
  upcoming: readonly unknown[] | null;
  trending: readonly unknown[] | null;
  upcomingErr: { message: string } | null;
  trendingErr: { message: string } | null;
};

/**
 * Compact date word for an event chip. "Today" and "Tmrw" are the common-case
 * shortcuts; within a week it's the short weekday; anything later is a short
 * month/day. Copied from campus-home's Otto rail (W1b deletes the original).
 * `now` is injectable so the tests don't depend on the clock.
 */
export function formatUpcomingChip(startsAt: string, now: Date = new Date()): string {
  try {
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) return "";
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((startMid.getTime() - nowMid.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tmrw";
    if (diffDays > 1 && diffDays < 7) {
      return start.toLocaleDateString([], { weekday: "short" });
    }
    return start.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Chip order: the student's RSVP'd events (soonest first, at most three,
 * only those starting within the next `windowDays`), then the trending tags
 * (at most eight, in the order the route ranked them). The route already
 * asks for `limit=3&days=14`; this is the belt to that suspender, so a
 * stale or over-generous answer never widens the strip. Events with an
 * unparseable `starts_at` are dropped rather than shown with no date.
 */
export function orderChips(
  upcoming: readonly StripUpcoming[] | null,
  trending: readonly StripTrend[] | null,
  now: Date,
  limits: { maxEvents?: number; maxTags?: number; windowDays?: number } = {},
): StripChip[] {
  const {
    maxEvents = STRIP_MAX_EVENTS,
    maxTags = STRIP_MAX_TAGS,
    windowDays = STRIP_WINDOW_DAYS,
  } = limits;
  const horizon = now.getTime() + windowDays * 24 * 60 * 60 * 1000;

  const events: StripChip[] = (upcoming ?? [])
    .map((u) => ({ u, t: new Date(u.starts_at).getTime() }))
    .filter(({ t }) => !Number.isNaN(t) && t <= horizon)
    .sort((a, b) => a.t - b.t)
    .slice(0, maxEvents)
    .map(({ u }) => ({
      kind: "event" as const,
      id: u.id,
      title: u.title,
      when: formatUpcomingChip(u.starts_at, now),
      status: u.viewer_status === "going" ? ("going" as const) : ("maybe" as const),
      startsAt: u.starts_at,
    }));

  const tags: StripChip[] = (trending ?? [])
    .filter((t) => typeof t.tag === "string" && t.tag.length > 0)
    .slice(0, maxTags)
    .map((t) => ({ kind: "tag" as const, tag: t.tag, count: t.count }));

  return [...events, ...tags];
}

/**
 * Everything the strip renders, in order: events, then the upcoming failure
 * chip if that read was refused, then tags, then the trending failure chip.
 * A failure chip shows whenever its source has an error, even beside rows
 * kept from an earlier load — a refused read is never silent (plan D).
 */
export function stripEntries(
  data: StripEmptyInput & {
    upcoming: readonly StripUpcoming[] | null;
    trending: readonly StripTrend[] | null;
  },
  now: Date,
): StripEntry[] {
  const chips = orderChips(data.upcoming, data.trending, now);
  const events = chips.filter((c) => c.kind === "event");
  const tags = chips.filter((c) => c.kind === "tag");
  const out: StripEntry[] = [...events];
  if (data.upcomingErr) out.push({ kind: "failed", source: "upcoming", message: data.upcomingErr.message });
  out.push(...tags);
  if (data.trendingErr) out.push({ kind: "failed", source: "trending", message: data.trendingErr.message });
  return out;
}

/**
 * Hidden when there is nothing to say: both sources still loading, or both
 * answered empty with no error. Anything to show — one chip, or one refused
 * read — keeps the strip mounted, so a failure never reads as "nothing here".
 * The PARENT calls this too (the phone shows `FeedTagChip` only when the
 * strip is hidden), which is why it lives here and not inside the component.
 */
export function stripIsEmpty(d: StripEmptyInput): boolean {
  const hasUpcoming = !!d.upcoming && d.upcoming.length > 0;
  const hasTrending = !!d.trending && d.trending.length > 0;
  if (hasUpcoming || hasTrending) return false;
  return !d.upcomingErr && !d.trendingErr;
}

/**
 * Desktop only: roll when the single copy of the chips overflows the room it
 * has by more than the slack, and the student hasn't asked for reduced
 * motion. A track that fits, or a reduced-motion setting, means no motion at
 * all — the strip then behaves exactly like the phone's (plan D).
 */
export function shouldRoll(trackWidth: number, viewportWidth: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  if (!(trackWidth > 0) || !(viewportWidth > 0)) return false;
  return trackWidth > viewportWidth + ROLL_SLACK_PX;
}

/** Seconds for one full loop: slow enough to read, faster on a long track. */
export function rollDurationSec(trackWidth: number): number {
  return Math.max(20, trackWidth / 30);
}

/** Tapping the active tag clears the filter; tapping another one switches. */
export function nextTagFilter(current: string | null | undefined, tapped: string): string | null {
  return current === tapped ? null : tapped;
}

/** The italic coral word before the chips: `today.` at home, `there.` visiting. */
export function leadIn(visiting: boolean | undefined): string {
  return visiting ? "there." : "today.";
}

/** Tooltip on an event chip. */
export function eventChipTitle(status: "going" | "maybe"): string {
  return status === "going" ? "You're going" : "You're interested";
}

/** Screen-reader name for an event chip: title, when, and the RSVP state. */
export function eventChipLabel(title: string, when: string, status: "going" | "maybe"): string {
  const state = status === "going" ? "you're going" : "you're interested";
  return when ? `${title}, ${when}, ${state}` : `${title}, ${state}`;
}

/** Tooltip on a tag chip: how many posts carried it this week. */
export function tagChipTitle(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `${n} ${n === 1 ? "post" : "posts"} this week`;
}
