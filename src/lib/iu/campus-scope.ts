/**
 * Shared campus scoping for the list endpoints that hard-scope by campus
 * (`/api/orgs?filter=discover`, `/api/events`).
 *
 * TWO CONTRACTS LIVE IN THIS FILE WHILE THE CAMPUS MIGRATION RUNS: the
 * legacy label-based `resolveCampusScope` (below, deprecated, byte-for-byte
 * unchanged) and `resolveScopeV2` (bottom), which scopes on `campus_id` and
 * the viewer's school system. See `resolveScopeV2` for the new rules.
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

import {
  ALL_CAMPUSES,
  CAMPUSES,
  campusById,
  campusByLabel,
  campusRowById,
  campusesForSystem,
  isSchoolSystem,
  type SchoolSystem,
} from "./campuses";

/**
 * @deprecated Legacy label scope; use {@link CampusScopeV2}. Last importers
 * (`api/events/route.ts`, `api/orgs/route.ts`, B8) migrate in Wave 2.
 */
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
 *
 * @deprecated Label-based and IU-only; use {@link resolveScopeV2}. Last
 * importers (`api/events/route.ts`, `api/orgs/route.ts`, B8) migrate in
 * Wave 2.
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
 *
 * @deprecated The campus-less rule is retired (plan §2.4, §2.8 row 4):
 * scope with `.eq("campus_id", …)` / `.in("campus_id", scopeCampusIds(…))`.
 * Last importers (`api/events/route.ts`, `api/orgs/route.ts`, B8) migrate in
 * Wave 2.
 */
export function campusOrFilter(column: string, label: string): string {
  return `${column}.eq."${label}",${column}.eq."",${column}.is.null`;
}

// ─────────────────────────────────────────────────────────────────────────
// SCOPE V2: campus_id + school system (plan §2.4, contract C1, critic A1/A7)
// ─────────────────────────────────────────────────────────────────────────
//
// WHAT CHANGED FROM THE LEGACY CONTRACT (plan §2.8 rows 2 and 4), and what
// S67 changed again:
// - ANY KNOWN CAMPUS CAN BE READ (S67 plan §E, Franky's "view other
//   campuses"). `?campus=<id>` resolves for every campus in `CAMPUSES`, both
//   universities, open or not; only an id no build knows is "forbidden" (400
//   `unknown_campus`). Until S67 the viewer's system limited browsing (403
//   `campus_not_in_system` for the other university); that read block is
//   gone on purpose. Do not restore it here.
// - "Verified only" is not this function's job: `resolveCampusRequest`
//   (`campus-request.ts`) refuses a named campus to a viewer with no
//   university, and every route reads through it.
// - The viewer's SYSTEM still bounds everything that is not a named campus:
//   `?campus=all` and the no-home "none" scope are the viewer's university,
//   and the HOME campus stays own-system (the DB trigger enforces it, and
//   every write checks `allowedCampusId`). Reading a campus is not joining
//   it: RSVP refuses away from home (`campus_visiting`), posts land at home.
// - Campus-less rows no longer appear in campus views; filter on the ids.
// Still a relevance rule, not secrecy: RLS lets any signed-in user read
// these rows directly (plan §2.4 honesty note).
//
// Query contract:
//   ?campus=<id>   → { kind: "campus" } for any known campus; unknown →
//                    { kind: "forbidden", reason: "unknown_campus" }
//   ?campus=all    → { kind: "system", campusIds: allowed set }
//   (absent)       → { kind: "campus" } on the viewer's home campus, or
//                    { kind: "none", campusIds: allowed set } with no home
//
// Legacy ids (`bloomington`, `northwest`) and labels are NOT accepted as
// params: no client sent `?campus=` before S67 (plan §2.3), the S67 campus
// viewer sends canonical ids only, and accepting them would keep the old
// ambiguity alive.

/** `?campus=` value meaning "every campus in the viewer's allowed set". */
export const CAMPUS_PARAM_ALL = "all";

/** What scoping needs to know about the viewer (service-read `users` columns). */
export type ScopeViewer = {
  /** `users.campus_id`. */
  campusId: string | null | undefined;
  /** `users.school_system`. */
  system: SchoolSystem | null | undefined;
};

export type CampusScopeV2 =
  /** Filter to exactly this campus. */
  | { kind: "campus"; campusId: string }
  /** The caller asked for `?campus=all`: every campus in the allowed set. */
  | { kind: "system"; campusIds: string[] }
  /**
   * No param and no (valid) home campus. Defined per critic A7 as every
   * campus in the viewer's allowed set, the same ids as "system". It is a
   * separate kind so the client can prompt "Pick your campus" instead of
   * labelling the list "All of IU".
   */
  | { kind: "none"; campusIds: string[] };

export type CampusScopeForbidden = {
  kind: "forbidden";
  /**
   * `unknown_campus` → 400; `campus_not_in_system` → 403. Since S67 only
   * `resolveCampusRequest` produces the second (a viewer with no university
   * naming a campus); `resolveScopeV2` itself answers `unknown_campus` only.
   */
  reason: "unknown_campus" | "campus_not_in_system";
};

/**
 * The allowed set as ids, in picker order (fresh array): the viewer's
 * university, which is what `?campus=all` and the no-home "none" scope cover.
 * A named `?campus=<id>` no longer has to be in it (S67).
 *
 * NULL SYSTEM → EVERY CAMPUS. A viewer without a system is unverified or a
 * legacy row the backfill didn't reach. Unverified viewers never get past
 * `enforceCampusAccess`, and M1's trigger means a row with a campus always
 * has a system. So this branch only keeps the legacy "no campus set sees
 * everything" behaviour for stragglers instead of an empty app. It is not a
 * leak (RLS already allows the read), but a route that must not serve
 * system-less viewers should check `viewer.system` itself.
 */
export function allowedCampusIdsFor(system: SchoolSystem | null | undefined): string[] {
  return (isSchoolSystem(system) ? campusesForSystem(system) : CAMPUSES).map((c) => c.id);
}

/**
 * Resolve the campus scope for a request, on `campus_id` and the viewer's
 * system. New name so the legacy {@link resolveCampusScope} keeps its
 * signature.
 *
 * @param raw    the raw `?campus=` value (null/"" when absent); trimmed, any casing
 * @param viewer the viewer's `campus_id` and `school_system`
 */
export function resolveScopeV2(
  raw: string | null | undefined,
  viewer: ScopeViewer,
): CampusScopeV2 | CampusScopeForbidden {
  const allowed = allowedCampusIdsFor(viewer?.system);
  const param = typeof raw === "string" ? raw.trim() : "";

  if (param) {
    if (param.toLowerCase() === CAMPUS_PARAM_ALL) {
      return { kind: "system", campusIds: allowed };
    }
    const row = campusRowById(param);
    if (!row) return { kind: "forbidden", reason: "unknown_campus" };
    // Any known campus, in or out of the viewer's university (S67): reading
    // is open to every verified student. No `allowed` check here.
    return { kind: "campus", campusId: row.id };
  }

  // A home campus outside the allowed set can only come from bypassing the
  // DB trigger; treat it as no home rather than trusting it.
  const home = campusRowById(viewer?.campusId);
  if (home && allowed.includes(home.id)) return { kind: "campus", campusId: home.id };

  return { kind: "none", campusIds: allowed };
}

/**
 * The campus ids a resolved scope covers, for `.in("campus_id", ids)` (fresh
 * array). Only defined for allowed scopes; handle "forbidden" first.
 */
export function scopeCampusIds(scope: CampusScopeV2): string[] {
  return scope.kind === "campus" ? [scope.campusId] : [...scope.campusIds];
}
