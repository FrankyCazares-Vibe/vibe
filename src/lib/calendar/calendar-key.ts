/**
 * The calendar's colour key and its links (Oct 19, 2026, critique D13,
 * Franky's decisions 12 and 13).
 *
 * Why: My Calendar painted Going green and Interested amber, and a personal
 * entry could be any colour, those two included, so a green chip meant
 * nothing for sure. White words on green or amber were also hard to read.
 * The key now matches Messages:
 *   - Going: solid coral, dark words, a check
 *   - Interested: a coral outline, ink words
 *   - Yours (a personal entry): a plain chip with a thin bar in your colour
 * The stored RSVP value stays `maybe`; only the word on screen is
 * "Interested", the Policy's and the event card's word.
 *
 * Links: Vibe has no event page yet, so an event opens its club's page at
 * that event (`/orgs/<handle>?event=<id>`), which works for any campus and
 * for past events. A personal entry has nowhere to go.
 *
 * The static desktop profile copies these styles by hand (B6); batch-B8.md
 * has the CSS. No `@/` imports: node's test runner loads it bare.
 */

import type { CSSProperties } from "react";

export type CalKind = "going" | "interested" | "yours";

/** The two entry shapes of `GET /api/me/calendar`, as far as the key cares. */
export type KeyEntry =
  | { kind: "rsvp"; viewer_status: "going" | "maybe" }
  | { kind: "personal"; color?: string | null };

export const CAL_KIND_WORD: Readonly<Record<CalKind, string>> = Object.freeze({
  going: "Going",
  interested: "Interested",
  yours: "Yours",
});

export function calKind(entry: KeyEntry): CalKind {
  if (entry.kind === "personal") return "yours";
  return entry.viewer_status === "going" ? "going" : "interested";
}

/**
 * Personal colours (Oct 19, 2026, critique D13). Green and amber are gone
 * (they were Going and Interested), and so is coral, which is the RSVP
 * colour now (repair pass): a coral bar beside coral Going and Interested
 * chips read as an RSVP. The near-black was invisible in Night, so it is a
 * mid grey that shows on both. The new default is blue.
 */
export const PERSONAL_DEFAULT_COLOR = "#5A9CFF";
export const PERSONAL_COLOR_PRESETS: readonly string[] = Object.freeze([
  PERSONAL_DEFAULT_COLOR,
  "#9B7BFF",
  "#26A69A",
  "#E0559B",
  "#8A8580",
]);

/** The colours older entries were saved with, for the tests: the old
 *  presets, and the old default (`#FF5C35`, still the database default
 *  and the personal-events route's fallback). */
export const LEGACY_PERSONAL_COLORS: readonly string[] = Object.freeze([
  "#FF5C35",
  "#5BD18C",
  "#5A9CFF",
  "#9B7BFF",
  "#FFB85A",
  "#1C1C1E",
]);

/** A personal entry's colour, or a neutral bar when it isn't a plain hex
 *  (the column is the person's own words, so it is checked, not trusted). */
export function barColor(color: string | null | undefined): string {
  if (typeof color !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return "var(--ink-muted)";
  const c = color.toLowerCase();
  // The old near-black preset was the Light ink, and it vanished on Night's
  // dark chip; it follows the ink token now, so it shows in both themes.
  if (c === "#1c1c1e") return "var(--charcoal)";
  // Coral means an RSVP now. An entry saved with the old default (or the
  // old coral swatch) gets the new default's blue instead.
  if (c === "#ff5c35" || c === "#f53") return PERSONAL_DEFAULT_COLOR;
  return color;
}

/** The chip's paint by kind. Theme tokens only, so Night and Light both work. */
export function calChipStyle(kind: CalKind, color?: string | null): CSSProperties {
  if (kind === "going") {
    return { background: "var(--coral)", color: "var(--on-coral)", boxShadow: "inset 0 0 0 1px var(--coral)" };
  }
  if (kind === "interested") {
    // A faint coral wash behind the outline: coral on white paper is only
    // 2.9:1, so the line alone is a weak signal in Light.
    return { background: "var(--tag-bg)", color: "var(--charcoal)", boxShadow: "inset 0 0 0 1.5px var(--coral)" };
  }
  // The bar is a straight 3px stripe painted into the background. An inset
  // shadow or a left border would bend with the chip's rounded corner and
  // read as a bracket.
  return {
    background: `linear-gradient(90deg, ${barColor(color)} 0 3px, transparent 3px), rgba(var(--scrim-rgb),0.07)`,
    color: "var(--ink-body)",
    boxShadow: "none",
  };
}

/** The mini calendar's one mark per day: Going wins, then Interested, then Yours. */
export function dayMarkKind(entries: readonly KeyEntry[]): CalKind | null {
  let best: CalKind | null = null;
  for (const e of entries) {
    const k = calKind(e);
    if (k === "going") return "going";
    if (k === "interested") best = "interested";
    else if (best === null) best = "yours";
  }
  return best;
}

/** Still ahead or under way at `now` (an entry with no end ends when it starts). */
export function isUpcoming(entry: { starts_at: string; ends_at?: string | null }, now: Date): boolean {
  const end = Date.parse(entry.ends_at || entry.starts_at);
  return Number.isFinite(end) && end >= now.getTime();
}

/** The My Calendar badge: upcoming entries only (a past month's RSVPs aren't news). */
export function upcomingCount(entries: readonly { starts_at: string; ends_at?: string | null }[], now: Date): number {
  return entries.filter((e) => isUpcoming(e, now)).length;
}

/** The club's page, scrolled to one of its events. */
export function clubEventHref(handle: string, eventId: string): string {
  return `/orgs/${encodeURIComponent(handle)}?event=${encodeURIComponent(eventId)}`;
}

/** An event chat's deep link (the same one the week cards use). */
export function eventChatHref(roomId: string): string {
  return `/messages?channel=${encodeURIComponent(roomId)}`;
}

/** Where a calendar entry opens: its club's page at the event, or nowhere. */
export function entryHref(entry: { kind: "rsvp" | "personal"; id: string; org?: { handle: string } | null }): string | null {
  if (entry.kind !== "rsvp" || !entry.org?.handle) return null;
  return clubEventHref(entry.org.handle, entry.id);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?event=` on the club page: an event id, or null for anything else. */
export function readEventParam(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * The club page has two lists that may hold the linked event: upcoming and
 * past. Each says `found`, `missing` or `unknown` (its read failed or the
 * viewer is signed out) once it has loaded. One `found` and the card is
 * shown; both `missing` and the page says the event isn't listed anymore;
 * otherwise it waits, or stays quiet when a list couldn't tell.
 */
export type ListReport = "found" | "missing" | "unknown";
export function linkedEventOutcome(upcoming: ListReport | undefined, past: ListReport | undefined): "found" | "missing" | "wait" | "quiet" {
  if (upcoming === "found" || past === "found") return "found";
  if (upcoming === undefined || past === undefined) return "wait";
  if (upcoming === "missing" && past === "missing") return "missing";
  return "quiet";
}

export const EVENT_NOT_LISTED = "That event isn't listed anymore.";

/**
 * The two lists' word on the linked event, kept per event id while the club
 * page is open (Oct 19, 2026, critique B8 repair). `useLinkedEvent` is a thin
 * wrapper around this, so the rule is tested without React.
 *
 * Why: the toast used to fire whenever both lists said `missing`. An
 * officer's own Cancel or Delete takes the card out of the upcoming list,
 * which re-ran the check, and "That event isn't listed anymore." replaced
 * their own result toast (the toast store shows one at a time). Now only the
 * FIRST settled answer in a page view may speak: once a list has said
 * `found`, or both have answered, the event is settled and later reports
 * stay quiet.
 *
 * `join` / `leave` follow the lists mounting and unmounting. When both have
 * left, the event is forgotten, so opening the same link again later shows
 * (or says) it again.
 */
export type LinkedSource = "upcoming" | "past";
export type LinkedEventBoard = {
  join(eventId: string, source: LinkedSource): void;
  leave(eventId: string, source: LinkedSource): void;
  /** Records one list's report. True only when this report should say the event isn't listed. */
  report(eventId: string, source: LinkedSource, report: ListReport): boolean;
};

export function createLinkedEventBoard(): LinkedEventBoard {
  type Entry = { lists: Set<LinkedSource>; reports: { upcoming?: ListReport; past?: ListReport }; settled: boolean };
  const byEvent = new Map<string, Entry>();
  const entryFor = (eventId: string): Entry => {
    let entry = byEvent.get(eventId);
    if (!entry) {
      entry = { lists: new Set(), reports: {}, settled: false };
      byEvent.set(eventId, entry);
    }
    return entry;
  };
  return {
    join(eventId, source) {
      entryFor(eventId).lists.add(source);
    },
    leave(eventId, source) {
      const entry = byEvent.get(eventId);
      if (!entry) return;
      entry.lists.delete(source);
      delete entry.reports[source];
      if (entry.lists.size === 0) byEvent.delete(eventId);
    },
    report(eventId, source, report) {
      const entry = entryFor(eventId);
      entry.reports[source] = report;
      if (entry.settled) return false;
      const outcome = linkedEventOutcome(entry.reports.upcoming, entry.reports.past);
      if (outcome === "wait") return false;
      entry.settled = true;
      return outcome === "missing";
    },
  };
}
