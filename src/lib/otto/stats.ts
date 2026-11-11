/**
 * Otto's Stats card (Nov 10, 2026, the Otto build's Wave 2A): the wording and
 * the window behind "N views on your posts · last 30 days", shared by
 * GET /api/me/otto/stats and src/components/otto/OttoMetrics.tsx.
 *
 * ONE NUMBER, ON PURPOSE. The board split views into Events / Announcements /
 * Posts. Only posts have a view ledger (`post_views`): events and the Board's
 * announcements count no opens, so a split would be two invented rows. It
 * stays one number until those exist. No "things Otto did" either: Otto does
 * nothing on his own yet (BUILD-ORDER.md, "Calls raised by the build").
 *
 * THE WINDOW is the one /api/me/creator-stats uses for its 30-day tile (now
 * minus 30 days, compared as the ledger's `YYYY-MM-DD` date), so the two
 * screens agree on the same account.
 *
 * Pure: no imports, so `node --test` loads it (stats.test.ts).
 */

export const STATS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The club a card counts for: the one an officer is acting as. */
export type StatsClub = { name: string; handle: string };

/** GET /api/me/otto/stats, checked. */
export type OttoStats = {
  /** Views in the window, the poster's own left out. */
  views: number;
  /** Posts the number is counted across. */
  posts: number;
  /** First and last ledger day of the window, `YYYY-MM-DD`. */
  since: string;
  until: string;
  club: StatsClub | null;
};

/** The window's first and last day as the ledger writes them (UTC dates). */
export function statsWindow(now: Date): { since: string; until: string } {
  return {
    since: new Date(now.getTime() - STATS_DAYS * DAY_MS).toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };
}

/** Ledger rows on or after `since` (both dates `YYYY-MM-DD`, so they sort as strings). */
export function countViewsSince(rows: ReadonlyArray<{ viewed_on: string }>, since: string): number {
  let n = 0;
  for (const r of rows) if (r.viewed_on >= since) n += 1;
  return n;
}

/** "2026-10-11" → "Oct 11". Anything else → "". */
export function shortDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : "";
}

/** "Oct 11 to Nov 10", the dates the card's number covers. */
export function rangeLabel(since: string, until: string): string {
  const a = shortDay(since);
  const b = shortDay(until);
  return a && b ? `${a} to ${b}` : "";
}

/** The words after the big number: whose posts. */
export function viewsWhat(club: StatsClub | null, views: number): string {
  const noun = views === 1 ? "view" : "views";
  return club ? `${noun} on ${club.name}’s posts` : `${noun} on your posts`;
}

/** The small line under it: the range and how many posts. */
export function viewsSub(posts: number): string {
  return `Last ${STATS_DAYS} days · across ${posts} ${posts === 1 ? "post" : "posts"}`;
}

/**
 * What the number counts, in plain words. The ledger keeps one row per person
 * per post per day (its primary key), so "every open" would overcount the
 * claim; the poster's own opens are dropped (honest-views.ts). The card shows
 * a number only, never who.
 */
export function viewsCounts(club: StatsClub | null): string {
  const own = club ? "The poster\u2019s own opens are left out." : "Your own opens are left out.";
  return `each person once a day per post. ${own} Only the number shows here, never who.`;
}

/** The profile card's line: its ledger is one row per visitor per day too. */
export const PROFILE_COUNTS = "each visitor once a day.";

/** The route's body, checked: anything off is null, which the card shows as "couldn't count", never 0. */
export function parseStats(raw: unknown): OttoStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (!whole(r.views) || !whole(r.posts)) return null;
  if (typeof r.since !== "string" || typeof r.until !== "string") return null;
  let club: StatsClub | null = null;
  if (r.club !== null && r.club !== undefined) {
    const c = r.club as Record<string, unknown>;
    if (typeof c !== "object" || typeof c.name !== "string" || typeof c.handle !== "string") return null;
    club = { name: c.name, handle: c.handle };
  }
  return { views: r.views as number, posts: r.posts as number, since: r.since, until: r.until, club };
}

/** A `?club=` value worth looking up: a plain handle, never filter syntax. */
export function isStatsClubParam(v: string | null): v is string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9_.-]{0,63}$/.test(v);
}
