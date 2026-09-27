/**
 * Turning a REQUEST into a campus scope, for the read-only campus surfaces
 * (plan wave 2 B10: map, map zone, search, trending, campus stats; since S67
 * the feed too, R10). Pure: no DB and no Next imports, so every rule here is
 * unit-tested (`campus-request.test.ts`).
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
 * WHAT IS TRUE SINCE S67 (plan §E). A verified student may READ any campus,
 * both universities, open or not: `?campus=<any known id>` resolves. The one
 * clamp left is here: a viewer with no university (unverified, or a legacy
 * row) may not name a campus at all. The HOME campus is a different question
 * (own university only, 45-day lock; `profile-campus-write.ts` and the DB
 * trigger), and so is acting on a visited campus (RSVP refuses with
 * `campus_visiting`; posts always land at home).
 *
 * NOT A PRIVACY BOUNDARY (plan §2.4 honesty note). `users`, `orgs` and
 * published `posts` are readable by any signed-in user under RLS, so every
 * rule in this file is a relevance filter. The 403 below says "verify your
 * university first", not "you may not see this".
 */

import { isVisitingOrg } from "@/lib/orgs/join-state";

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
 * BROWSING. Since S67 every verified student may look around any campus
 * (`resolveScopeV2` resolves every known id); this clamp is what keeps that
 * "verified only".
 *
 * `allowedCampusIdsFor(null)` is every campus, which is the right default for
 * a system-less straggler's own view (an empty app would be worse), but a
 * named campus would be a browse pass for an account with no university at
 * all — 4 live rows. Those routes carry no verification gate of their own,
 * so the clamp belongs here, where it is tested once instead of re-typed in
 * every route. The answer is 403 `campus_not_in_system` (the code the
 * clients already handle); an unknown id stays 400 `unknown_campus`.
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

// ── RSVP away from home (S67 E3) ───────────────────────────────────────────

/** What `PUT /api/events/[id]/rsvp` answers with its 403 `campus_visiting`. */
export const RSVP_CAMPUS_VISITING_COPY = "RSVP works on your home campus.";

/** A stored campus id → the canonical id, or null (unset, junk, unknown). */
function knownCampusId(raw: unknown): string | null {
  return typeof raw === "string" ? (campusRowById(raw)?.id ?? null) : null;
}

/**
 * The campus an event belongs to: its club's campus, else (an org-less event,
 * or a club with no campus yet) its creator's home campus. Null when neither
 * is known.
 */
export function eventCampusIdFor(orgCampusId: unknown, creatorCampusId: unknown): string | null {
  return knownCampusId(orgCampusId) ?? knownCampusId(creatorCampusId);
}

/**
 * May this viewer RSVP to this event? Looking around another campus is open
 * to every verified student; ACTING there is not: RSVP works on the viewer's
 * home campus only (plan §E). Same rule as the club visiting rule
 * (`isVisitingOrg`): refused only when BOTH campuses are known and differ,
 * so a campus-less event or a viewer with no home campus is never refused.
 * Shared Indianapolis is one id, so IU and Purdue Indy students both RSVP
 * there. Taking an RSVP back (DELETE) is never gated.
 */
export function rsvpCampusDecision(input: {
  /** `orgs.campus_id` of the event's club (null for an org-less event). */
  orgCampusId: unknown;
  /** `users.campus_id` of the event's creator. */
  creatorCampusId: unknown;
  /** The viewer's `users.campus_id`: their home campus. */
  viewerCampusId: unknown;
  /** The viewer is a member of the event's club. Members keep their clubs
   *  wherever home is (plan §E: a student who moves home after 45 days, or a
   *  visitor whose Request to join was approved), so they may RSVP. */
  viewerIsClubMember?: boolean;
}): "ok" | "campus_visiting" {
  if (input.viewerIsClubMember === true) return "ok";
  const eventCampus = eventCampusIdFor(input.orgCampusId, input.creatorCampusId);
  return isVisitingOrg(eventCampus, knownCampusId(input.viewerCampusId)) ? "campus_visiting" : "ok";
}

// ── The map of a campus that isn't open (S67 R3) ────────────────────────────

/**
 * Should the campus map and its zones answer EMPTY for this scope? True for a
 * NAMED campus that is neither the viewer's home nor open (plan §E, critique
 * product #6). A closed campus has a handful of sign-ups, and its map names
 * them: a two-person "Computer Science" zone identifies both, and the zone
 * route lists them by name. The clients hide the Map tab there; this is the
 * server half, so calling `/api/campus-map` or `/api/campus-map/zone`
 * directly doesn't get around it.
 *
 * Home is always drawn, open or not: it's the viewer's own campus. The
 * default view and `?campus=all` (own university) are unchanged. The feed,
 * events and clubs of a closed campus stay readable; only the map, which
 * lists PEOPLE by major, is held back.
 */
export function mapCampusClosed(
  scope: CampusScopeV2 | CampusScopeForbidden,
  viewer: ScopeViewer,
): boolean {
  if (scope.kind !== "campus") return false;
  const home = resolveScopeV2(null, viewer);
  if (home.kind === "campus" && home.campusId === scope.campusId) return false;
  return campusRowById(scope.campusId)?.isOpen !== true;
}
