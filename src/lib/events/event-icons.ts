/**
 * Event icons (Oct 23, 2026; club view wave 3, Part 2, batch B4:
 * handoffs/2026-10-23-club-view-wave-3/PLAN.md). Franky's build order asks
 * for "a picture or a simple icon on every event", icons first. An officer
 * may pick one of twelve for an event in the create / edit form; the event
 * card and the club's past events draw it in a small tile. No icon picked
 * draws the calendar glyph in that tile.
 *
 * THE DATABASE holds only the key (`events.icon`, null = none), never a
 * path: the shapes live here. events_icon_check
 * (20261027100000_event_icons.sql) lists the same twelve keys in the same
 * order; event-icons.test.ts reads that file and fails when the two drift.
 *
 * THE SHAPES are stroke paths on a 24 grid, drawn with
 * `fill="none" stroke="currentColor"`, round caps and joins (a `h.01` is a
 * dot). One `d` string per icon, so a renderer needs a single <path>.
 *
 * Pure: no imports, so `node --test --experimental-strip-types` loads it
 * and validate.ts (also pure) can check a sent key against the list.
 */

/** The twelve keys, in the picker's order. Change with events_icon_check. */
export const EVENT_ICON_KEYS = [
  "meeting",
  "social",
  "food",
  "music",
  "sports",
  "games",
  "study",
  "talk",
  "service",
  "arts",
  "trip",
  "party",
] as const;
export type EventIconKey = (typeof EVENT_ICON_KEYS)[number];

export type EventIconShape = {
  /** What the picker says under it, and what a screen reader hears. */
  name: string;
  /** One stroke path on a 24 × 24 grid. */
  path: string;
};

/** The size of the grid every path is drawn on. */
export const EVENT_ICON_VIEWBOX = "0 0 24 24";

/** A circle as path commands (two half arcs), so each icon stays one `d`. */
function ring(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export const EVENT_ICONS: Readonly<Record<EventIconKey, EventIconShape>> = {
  // Two people, the nearer one whole.
  meeting: {
    name: "Meeting",
    path: `${ring(9, 8, 3.5)}M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.3A6 6 0 0 1 21 20`,
  },
  // A smile.
  social: {
    name: "Social",
    path: `${ring(12, 12, 9)}M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01`,
  },
  // A fork and a knife.
  food: {
    name: "Food",
    path: "M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17 21V3c-2.2 1.2-3 3.5-3 6v4h3",
  },
  // Two joined notes.
  music: {
    name: "Music",
    path: `M9 18V5l11-2v13${ring(6, 18, 3)}${ring(17, 16, 3)}`,
  },
  // A ball with its seams.
  sports: {
    name: "Sports",
    path: `${ring(12, 12, 9)}M3 12h18M12 3v18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8`,
  },
  // A die showing five.
  games: {
    name: "Games",
    path:
      "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" +
      "M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  },
  // An open book.
  study: {
    name: "Study",
    path: "M12 6.5C10 5 7.5 4.5 3 4.5v13c4.5 0 7 .5 9 2 2-1.5 4.5-2 9-2v-13c-4.5 0-7 .5-9 2zM12 6.5v13",
  },
  // A microphone on its stand.
  talk: {
    name: "Talk",
    path: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7",
  },
  // A heart.
  service: {
    name: "Service",
    path:
      "M12 20.5C6 16.5 3 13.2 3 9.5A4.5 4.5 0 0 1 7.5 5c1.9 0 3.4 1 4.5 2.6C13.1 6 14.6 5 16.5 5" +
      "A4.5 4.5 0 0 1 21 9.5c0 3.7-3 7-9 11z",
  },
  // A painter's palette.
  arts: {
    name: "Arts",
    path:
      "M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17" +
      "a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 10.5h.01M10 7h.01M14.5 7h.01M17 10.5h.01",
  },
  // A bus.
  trip: {
    name: "Trip",
    path: "M6 3h12a2 2 0 0 1 2 2v12H4V5a2 2 0 0 1 2-2zM4 11h16M7 17v3M17 17v3M7.5 14h.01M16.5 14h.01",
  },
  // A party popper and its confetti.
  party: {
    name: "Party",
    path: "M3.5 20.5 8 9l7 7zM12 7c1-1.5 1-3 0-4.5M17 12c1.5-1 3-1 4.5 0M14.5 9.5l4-4M19 3h.01M21 7h.01M15.5 3.5h.01",
  },
};

/** No icon picked: a calendar page, the glyph an event card's time line already uses. */
export const EVENT_ICON_DEFAULT: EventIconShape = {
  name: "Calendar",
  path: "M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4",
};

/** Whether `value` is exactly one of the twelve keys (no trimming, no case folding). */
export function isEventIcon(value: unknown): value is EventIconKey {
  return typeof value === "string" && (EVENT_ICON_KEYS as readonly string[]).includes(value);
}

/**
 * A stored or sent `icon`, read safely for a payload or a picture: one of
 * the twelve keys, or null (none: the calendar). Junk reads as none, never
 * as a guess. Reads only; a WRITE is checked by validate.ts's
 * `checkEventFields`, which refuses junk.
 */
export function eventIconOf(value: unknown): EventIconKey | null {
  return isEventIcon(value) ? value : null;
}

/** The shape to draw for an event's icon: its own, or the calendar when it has none. */
export function eventIconShape(value: unknown): EventIconShape {
  const key = eventIconOf(value);
  return key ? EVENT_ICONS[key] : EVENT_ICON_DEFAULT;
}
