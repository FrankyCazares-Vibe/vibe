/**
 * Turning a REQUEST into a campus scope, for the read-only campus surfaces
 * (plan wave 2 B10: map, map zone, search, trending, campus stats). Pure: no
 * DB and no Next imports, so every rule here is unit-tested
 * (`campus-request.test.ts`).
 *
 * WHY THIS EXISTS. Five routes each need the same two things, and getting
 * either subtly wrong is how this codebase has already shipped exact-match
 * campus bugs twice (plan §2.1):
 *
 *   1. Turn a row the route just read (`users.campus_id`, `school_system`,
 *      and the legacy `school` label) into the {@link ScopeViewer} that
 *      `resolveScopeV2` takes — {@link scopeViewerFromRow}.
 *   2. Resolve `?campus=` against that viewer, including the rule
 *      `resolveScopeV2` deliberately leaves to its callers: a viewer with no
 *      university may not browse a named campus — {@link resolveCampusRequest}.
 *
 * WHAT IS NOT HERE. The `posts` filter (campus posts plus the campus-less
 * legacy pile of the viewer's own university, critic A7) lives once, in
 * `community-scope.ts` as `feedLaneFor` + `feedLaneOrFilter`, and trending
 * calls it there. One builder, one set of tests, no chance of the feed's lane
 * and the trending strip drifting apart.
 *
 * NOT A PRIVACY BOUNDARY (plan §2.4 honesty note). `users`, `orgs` and
 * published `posts` are readable by any signed-in user under RLS, so every
 * rule in this file is a relevance filter. The 403 below says "that isn't your
 * university", not "you may not see this".
 */

import { campusIdFromLegacyLabel, campusRowById, isSchoolSystem, type SchoolSystem } from "./campuses";
import {
  CAMPUS_PARAM_ALL,
  resolveScopeV2,
  type CampusScopeForbidden,
  type CampusScopeV2,
  type ScopeViewer,
} from "./campus-scope";

/**
 * The viewer columns these routes select. A field is `undefined` when the
 * column wasn't selected or doesn't exist yet (M1 unapplied), which is a
 * different case from an explicit null (the column is there and empty).
 */
export type CampusViewerRow = {
  campus_id?: unknown;
  school_system?: unknown;
  school?: unknown;
};

/**
 * A read row → the viewer shape `resolveScopeV2` takes.
 *
 * - `school_system` that isn't "iu"/"purdue" (null, junk, a column that wasn't
 *   selected) → null system. `resolveScopeV2` then treats every campus as
 *   allowed, which keeps a system-less straggler out of an empty app without
 *   granting anything RLS doesn't already allow. What such a viewer may NOT do
 *   is browse a named campus — see {@link resolveCampusRequest}.
 * - `campus_id` is authoritative whenever the column was selected, INCLUDING
 *   when it is null: "no campus" is an answer, not a reason to guess from the
 *   legacy label (plan §2.7, "prompted, not guessed").
 * - The legacy `school` label is consulted ONLY when `campus_id` is
 *   `undefined`, i.e. the caller didn't select the column. The five B10 routes
 *   always select it (and answer their own honest fallback when the select
 *   fails on a pre-M1 database), so none of them passes `school` here — which
 *   is what keeps them working after M3 drops the column. The branch stays for
 *   a caller that reads only the legacy label.
 */
export function scopeViewerFromRow(row: CampusViewerRow | null | undefined): ScopeViewer {
  const rawSystem = row?.school_system;
  const system: SchoolSystem | null = isSchoolSystem(rawSystem) ? rawSystem : null;

  if (!row || row.campus_id === undefined) {
    const label = typeof row?.school === "string" ? row.school : null;
    return { campusId: campusIdFromLegacyLabel(label), system };
  }

  const campusId = typeof row.campus_id === "string" ? campusRowById(row.campus_id)?.id : null;
  return { campusId: campusId ?? null, system };
}

/**
 * `resolveScopeV2` plus the one rule it leaves to callers: NO UNIVERSITY, NO
 * BROWSING (Franky's Q2 — "other same-university campuses only when the
 * student explicitly switches").
 *
 * `allowedCampusIdsFor(null)` is every campus, which is the right default for
 * a system-less straggler's own view (an empty app would be worse), but it
 * would also let `?campus=purdue-west-lafayette` through from an account with
 * no university at all — 4 live rows. Those routes carry no verification gate
 * of their own, so the clamp belongs here, where it is tested once instead of
 * re-typed in three routes.
 *
 * `?campus=all` is untouched: for a system-less viewer it resolves to the same
 * set their default view already covers.
 */
export function resolveCampusRequest(
  raw: string | null | undefined,
  viewer: ScopeViewer,
): CampusScopeV2 | CampusScopeForbidden {
  const scope = resolveScopeV2(raw, viewer);
  const param = typeof raw === "string" ? raw.trim() : "";
  const named = param.length > 0 && param.toLowerCase() !== CAMPUS_PARAM_ALL;
  if (named && scope.kind === "campus" && !isSchoolSystem(viewer?.system)) {
    return { kind: "forbidden", reason: "campus_not_in_system" };
  }
  return scope;
}
