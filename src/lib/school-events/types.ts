/**
 * School events on Campus ("What's the vibe tonight?", Oct 19 2026): the wire
 * types of GET /api/school-events, shared by the route, the screens and the
 * tests. PURE: types only, no imports.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md.
 */

/**
 * A school calendar Vibe reads. The list is fixed in code (sources.ts), never
 * taken from a request. Indianapolis keeps its first three names (the live
 * off switch and Next's cache tags use them); Bloomington's start with "iub-"
 * (Oct 19, 2026).
 */
export type SchoolSourceKey =
  | "athletics"
  | "iu-student-affairs"
  | "iu-featured"
  | "iub-athletics"
  | "iub-student-life"
  | "iub-featured";

export type SchoolSource = {
  key: SchoolSourceKey;
  /** The office beside the "School event" tag: "Athletics", "Student Affairs", "IU Indianapolis". */
  host: string;
  /** The credit, plain text: "From the IU Indy athletics calendar", "From the IU Athletics calendar". */
  credit: string;
  /** The calendar's public page, https on the source's own host: what the credit links to. */
  calendar_url: string;
  /**
   * "athletics": the campus's home games (what "Home games this week" reads);
   * "calendar": a school events calendar. Added Oct 19, 2026, so the screens
   * stop looking for the one key "athletics" (Bloomington's is "iub-athletics").
   * Optional only because an older server's answer lacks it.
   */
  role?: "athletics" | "calendar";
  /** The calendar's short name for a heading: "IU Indy Athletics", "IU Athletics", "IU Bloomington Student Life". */
  label?: string;
};

export type SchoolEvent = {
  /** "athletics:<UID>" or "iu:<LiveWhale id>". Stable across refreshes. Never an events-table uuid. */
  id: string;
  source: SchoolSourceKey;
  /** "game": a HOME game from the campus's athletics calendar. "event": anything else. */
  kind: "game" | "event";
  /** Plain text, at most 120 characters. Games: "IU Indy vs UT Martin", "IU vs Purdue". */
  title: string;
  /** Games: the two sides, for the italic "vs". Null for events, or a game whose title didn't parse. */
  matchup: { home: string; away: string } | null;
  /** Games: sentence case, "Men's basketball". Null for events. */
  sport: string | null;
  /** Games: the promo after " - " in the feed ("Senior Day"). Null otherwise. */
  promo: string | null;
  /** ISO 8601, UTC. */
  starts_at: string;
  /** ISO 8601, UTC. Games: the feed's end when it is at most 6 h after the start, else start + 2 h. */
  ends_at: string;
  /** Plain-text place ("James T. Morris Arena", "Campus Center"), or null. */
  location: string | null;
  /** Copied from the source, so a row needs no lookup. */
  host: string;
  /** This event's own page on its calendar: https, on the source's own host. Null when the feed has none. */
  url: string | null;
  /** "Tickets": https, a ticketmaster.com host, games only. Null when the feed lists none. */
  tickets_url: string | null;
  /** "Watch on ESPN+": only when the feed says "TV: ESPN+" and lists an espn.com stream. */
  watch_url: string | null;
  /**
   * From a calendar marked `featured` in sources.ts: only Indy's Featured
   * Events (iu-featured). Bloomington's group 341 counts as a plain calendar
   * (Franky, Oct 19, 2026). Only this can lead as "Featured by your school".
   */
  featured: boolean;
};

/**
 * GET /api/school-events (signed in). Every 200 carries this shape, also when
 * a calendar is down (that calendar's events are just missing).
 */
export type SchoolEventsResponse = {
  ok: true;
  /**
   * False when the switch is off, the campus on screen has no school calendar
   * (every campus but Indianapolis and Bloomington, Oct 19 2026), or the answer is not for one campus
   * (`?campus=all`, no home campus). The screens then hide every school part.
   */
  school_on: boolean;
  /** The campus the answer is for, by the `?campus=` rule of GET /api/events; null when not one campus. */
  campus_id: string | null;
  /** Starting from 4 days ago up to 8 days ahead, ended ones included, soonest first, at most 200. [] when off. */
  events: SchoolEvent[];
  /** The calendars that are switched on, in fixed order (their credits). [] when off. */
  sources: SchoolSource[];
};
