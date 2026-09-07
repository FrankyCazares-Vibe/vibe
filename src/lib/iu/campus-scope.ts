/**
 * Shared campus scoping for the list endpoints that hard-scope by campus
 * (`/api/orgs?filter=discover`, `/api/events`).
 *
 * FOUNDER'S DECISION: clubs and events are physically campus-bound, so a
 * Kokomo student scrolling Indianapolis events is pure noise. Those two
 * surfaces therefore filter HARD to the viewer's campus by default and offer
 * an explicit `?campus=all` escape hatch. (Feed + people are ranked, not
 * filtered — different owners, different rules.)
 *
 * NOT A PRIVACY BOUNDARY. `users.school` / `orgs.school` are self-declared
 * and unverified (see `campuses.ts`), so this is a relevance filter only.
 * Never hide anything sensitive behind it, and never treat "wrong campus" as
 * an authorization failure — `?campus=all` is always available to everyone.
 *
 * Query contract (identical on both endpoints):
 *   ?campus=<id>   → filter to that campus; unknown id → 400
 *   ?campus=all    → no campus filter
 *   (absent)       → the viewer's own campus (`users.school`); a viewer with
 *                    no campus set sees EVERYTHING rather than an empty list
 *
 * Both endpoints echo `viewerCampus` (canonical label or null) and
 * `campusScope` (the id in effect, or "all") so the client can render a
 * switcher and label which default it landed on.
 */

import { ALL_CAMPUSES, campusById, campusByLabel } from "./campuses";

export type CampusScope =
  | {
      ok: true;
      /** Campus id in effect, or "all" when nothing is filtered. */
      scope: string;
      /**
       * Canonical label to filter on, or null for "all" (no filter). Callers
       * branch on this rather than on `scope`.
       */
      campusLabel: string | null;
      /** The viewer's own campus label, or null when unset/unrecognized. */
      viewerCampus: string | null;
      /** True when the caller passed `?campus=` explicitly. */
      explicit: boolean;
    }
  | { ok: false; error: string; viewerCampus: string | null };

/**
 * Resolve the campus scope for a request.
 *
 * @param rawParam    the raw `?campus=` value (null/"" when absent)
 * @param viewerSchool the viewer's stored `users.school` value
 */
export function resolveCampusScope(
  rawParam: string | null | undefined,
  viewerSchool: string | null | undefined,
): CampusScope {
  // A stored `school` that matches no known campus (legacy junk, e.g. the
  // literal "iu.edu" some old rows carry) counts as "no campus set".
  const viewerCampus = campusByLabel(viewerSchool)?.label ?? null;

  const raw = (rawParam ?? "").trim();

  if (raw) {
    if (raw.toLowerCase() === ALL_CAMPUSES) {
      return { ok: true, scope: ALL_CAMPUSES, campusLabel: null, viewerCampus, explicit: true };
    }
    // Ids are the documented form (`?campus=fort-wayne`); a canonical label is
    // accepted too so a client can round-trip `viewerCampus` back to us
    // without a lookup table.
    const campus = campusById(raw) ?? campusByLabel(raw);
    if (!campus) {
      return { ok: false, error: `Unknown campus "${raw}"`, viewerCampus };
    }
    return { ok: true, scope: campus.id, campusLabel: campus.label, viewerCampus, explicit: true };
  }

  if (viewerCampus) {
    const campus = campusByLabel(viewerCampus)!;
    return { ok: true, scope: campus.id, campusLabel: campus.label, viewerCampus, explicit: false };
  }

  // No campus on the account (true for every live user today). Showing an
  // empty list would look like the feature is broken, so fall back to
  // everything until they pick a campus.
  return { ok: true, scope: ALL_CAMPUSES, campusLabel: null, viewerCampus: null, explicit: false };
}

/**
 * PostgREST `.or()` fragment matching rows at `label` PLUS campus-less rows.
 *
 * CAMPUS-LESS RULE: a row whose `school` is '' (the column default) or NULL
 * appears in EVERY campus view, not none. Orgs created before campuses
 * existed have no campus, and quietly deleting them from all eight campus
 * views would be a silent regression; the reverse (a stray cross-campus club
 * in your list) is merely noise the owner can fix by setting a campus.
 *
 * `label` is always one of our own constants, never user text, so embedding
 * it in the filter grammar is safe — but it is double-quoted anyway per the
 * `lib/pgrest` quoting rules.
 */
export function campusOrFilter(column: string, label: string): string {
  return `${column}.eq."${label}",${column}.eq."",${column}.is.null`;
}
