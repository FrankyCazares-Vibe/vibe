/**
 * "Active now" from 5 up (Franky, Oct 14 2026). Since step 2 of the use
 * totals (20261014150000) every page checks in, so an exact small count
 * would show whether one person on a quiet campus has Vibe open. The number
 * is shown only when it is 5 or more; under that, the header leaves it out.
 *
 * THREE PLACES HOLD THE LINE, on purpose:
 *   - the database: public.users_active_count counts each campus on its own
 *     and leaves out any campus where fewer than 5 people other than the
 *     caller are active, or fewer than 5 other than the caller are not (who
 *     is NOT on, Franky, Oct 14), so a campus under 10 people never shows
 *     (20261014150000). A direct call can't get a small number, adding
 *     campuses together can't either (5 at one campus plus 1 at another
 *     answers 5, not 6), and the caller switching their own check-in on and
 *     off decides neither floor ("exactly 4 others" on, or not on). So a
 *     shown number can be lower than everyone active.
 *   - GET /api/stats/campus floors what it answers at 5 (`floorActiveNow`).
 *     That covers only what the header prints, and not the second floor:
 *     until that file is applied, a direct call still gets the exact count.
 *   - the campus header (`campusStatsLine`) drops the " · N active now" part
 *     under 5, and never says "0 active now".
 * The Privacy Policy (section 3d, "Last active") says so: a change here
 * changes the policy the same day.
 *
 * No imports and only erasable TypeScript, so the route, the header and
 * `node --test` all load it as is.
 */

/** "Active now" is shown only from this many people up. The database's floor is the same 5. */
export const ACTIVE_NOW_MIN = 5;

/**
 * What the stats route answers: the count from 5 up, else 0, which means
 * "not shown" (the response keeps its shape: open tabs read a number). Not a
 * count (null, NaN) is 0 too.
 */
export function floorActiveNow(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n >= ACTIVE_NOW_MIN ? n : 0;
}

/** The number the header prints, or null when it prints none (under 5, or not a count). */
export function activeNowShown(n: number | null | undefined): number | null {
  const floored = floorActiveNow(n);
  return floored === 0 ? null : floored;
}

/** The campus header's numbers, as GET /api/stats/campus answers them. */
export type CampusStats = {
  totalUsers: number;
  activeNow: number;
  campusUsers: number | null;
  campusActiveNow: number | null;
  /** The campus the stats route counted (null when it counted none). */
  campusId: string | null;
};

/**
 * "{n} at Indianapolis · {m} active now", or "{total} on Vibe · …" with no
 * campus. The " · {m} active now" part only from 5 up: under it the line is
 * just "{n} at Indianapolis" or "{total} on Vibe". The two answers come from
 * different requests on different clocks (a campus switched on another
 * device shows up in the 30 s stats poll before the campus re-read), so the
 * campus count is only printed under the name of the campus it actually
 * counted. No answer yet is no line.
 */
export function campusStatsLine(
  stats: CampusStats | null,
  label: string | null,
  campusId: string | null,
): string {
  if (!stats) return "";
  const line = (head: string, active: number | null) => {
    const shown = activeNowShown(active);
    return shown === null ? head : `${head} · ${shown.toLocaleString()} active now`;
  };
  if (label && campusId && stats.campusId === campusId && stats.campusUsers !== null) {
    return line(`${stats.campusUsers.toLocaleString()} at ${label}`, stats.campusActiveNow);
  }
  return line(`${stats.totalUsers.toLocaleString()} on Vibe`, stats.activeNow);
}
