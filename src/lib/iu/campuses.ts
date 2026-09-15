/**
 * Indiana University campuses — the canonical list behind Vibe's campus
 * scoping. Client-safe (no server-only imports).
 *
 * TWO MODELS LIVE IN THIS FILE WHILE THE CAMPUS MIGRATION RUNS
 * (handoffs/2026-09-15-indy-campus-onboarding-plan.md §2, contract C1,
 * critic A1):
 *
 *   1. LEGACY (top half): `IU_CAMPUSES`, label-based, stored in
 *      `users.school` / `orgs.school`. Every export keeps its exact signature
 *      and behaviour until its last importer migrates; each one carries a
 *      `@deprecated` tag naming the wave that moves that importer.
 *   2. CAMPUS MODEL (bottom half): `CAMPUSES`, id-based, mirrors the
 *      `public.campuses` seed (plan §2.3 / §5.1), and knows the school SYSTEM
 *      (IU or Purdue) that the verified email proves. New code uses only this
 *      half.
 *
 * The rest of this header describes the LEGACY half.
 *
 * WHY THIS EXISTS: IU issues @iu.edu addresses university-wide, so the
 * school-email check in `lib/auth/school-email-domains.ts` proves a user is
 * part of IU but NOT which campus they attend. Campus is therefore
 * SELF-DECLARED: the user picks it, we store the label in `users.school`,
 * and nothing verifies it.
 *
 * That makes campus a convenience for filtering and ranking, never a
 * privacy boundary. Do not gate anything sensitive on it — a user can change
 * their campus in settings at any time. (The legal drafts say exactly this.)
 *
 * STORAGE FORMAT: the canonical `label` string, not the id. `users.school`
 * and `orgs.school` are plain text columns that existing code already
 * compares with equality (`/api/events`, `/api/me/suggested-connections`)
 * and renders directly as the profile badge, so storing the label keeps all
 * of that working without a migration.
 */

/**
 * @deprecated Legacy label model; use {@link Campus}. Last importers
 * (SettingsClient B15, OnboardingMobile B12, ProfileMobile B16) migrate in
 * Wave 3.
 */
export type IuCampus = {
  /** Stable key for URLs and query params (`?campus=indianapolis`). */
  id: string;
  /** Canonical value stored in `users.school` / `orgs.school`. */
  label: string;
  /** Compact form for chips and badges where the full label is too long. */
  shortLabel: string;
  /** City, for disambiguation in the picker. */
  city: string;
};

/**
 * @deprecated Legacy label model; use {@link CAMPUSES} /
 * {@link campusesForSystem}. Last importers (SettingsClient B15,
 * OnboardingMobile B12, ProfileMobile B16) migrate in Wave 3.
 */
export const IU_CAMPUSES: IuCampus[] = [
  { id: "indianapolis", label: "IU Indianapolis", shortLabel: "Indianapolis", city: "Indianapolis" },
  { id: "bloomington", label: "IU Bloomington", shortLabel: "Bloomington", city: "Bloomington" },
  { id: "east", label: "IU East", shortLabel: "East", city: "Richmond" },
  { id: "fort-wayne", label: "IU Fort Wayne", shortLabel: "Fort Wayne", city: "Fort Wayne" },
  { id: "kokomo", label: "IU Kokomo", shortLabel: "Kokomo", city: "Kokomo" },
  { id: "northwest", label: "IU Northwest", shortLabel: "Northwest", city: "Gary" },
  { id: "south-bend", label: "IU South Bend", shortLabel: "South Bend", city: "South Bend" },
  { id: "southeast", label: "IU Southeast", shortLabel: "Southeast", city: "New Albany" },
  { id: "online", label: "IU Online", shortLabel: "Online", city: "Online" },
];

/**
 * The pilot campus — the default selection in pickers.
 *
 * @deprecated The campus model has no default; onboarding asks (plan §2.8
 * row 5). Last importer (OnboardingMobile B12) migrates in Wave 3.
 */
export const DEFAULT_CAMPUS_ID = "indianapolis";

/**
 * Sentinel used by list endpoints to mean "every campus, don't filter".
 *
 * @deprecated Use `CAMPUS_PARAM_ALL` from `./campus-scope`, which means
 * "every campus in the viewer's university". Last importers
 * (`api/events/route.ts`, `api/orgs/route.ts`, B8) migrate in Wave 2.
 */
export const ALL_CAMPUSES = "all";

const BY_ID = new Map(IU_CAMPUSES.map((c) => [c.id, c]));
const BY_LABEL = new Map(IU_CAMPUSES.map((c) => [c.label.toLowerCase(), c]));

/**
 * @deprecated Returns the legacy {@link IuCampus} shape; use
 * {@link campusRowById}. Its only importer is the deprecated
 * `resolveCampusScope`, which goes when B8 migrates in Wave 2.
 */
export function campusById(id: string | null | undefined): IuCampus | null {
  return BY_ID.get((id ?? "").trim().toLowerCase()) ?? null;
}

/**
 * Resolve a stored `school` value (a label) back to its campus entry.
 *
 * @deprecated Use {@link campusIdFromLegacyLabel} + {@link campusRowById}.
 * Importers migrate in Wave 2 (feed + suggested-connections B9,
 * profile-bootstrap + build-vibe-user-v1 B6) and Wave 3 (SettingsClient B15,
 * ProfileMobile B16), which is the last.
 */
export function campusByLabel(label: string | null | undefined): IuCampus | null {
  return BY_LABEL.get((label ?? "").trim().toLowerCase()) ?? null;
}

/**
 * Coerce untrusted input (an id OR a label, any casing) to the canonical
 * label for storage. Returns null when it matches no known campus, so
 * callers can reject rather than write junk into `school`.
 *
 * @deprecated Use {@link allowedCampusId} for writes and
 * {@link campusIdFromLegacyLabel} for legacy input; dual-write the label with
 * {@link legacyLabel}. Last importers (profile + profile-sync B6, orgs routes
 * B8; onboarding-prefill B5 may move in Wave 1) migrate in Wave 2.
 */
export function normalizeCampusLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return (campusById(v) ?? campusByLabel(v))?.label ?? null;
}

/**
 * Badge text for a profile. Campus when the user picked one, otherwise the
 * honest fallback: we know they hold an IU address, not where they study.
 * Never falls back to the raw email domain (that rendered the literal
 * string "iu.edu" on every profile before campuses existed).
 *
 * @deprecated Always says "IU"; use {@link campusBadgeFor}. Last importer
 * (build-vibe-user-v1 B6) migrates in Wave 2.
 */
export function campusBadgeLabel(school: string | null | undefined): string {
  return campusByLabel(school)?.label ?? "IU verified";
}

// ─────────────────────────────────────────────────────────────────────────
// CAMPUS MODEL: IU + Purdue, one shared Indianapolis (plan §2, contract C1)
// ─────────────────────────────────────────────────────────────────────────
//
// SYSTEM vs CAMPUS. The verified school email proves the SYSTEM (every IU
// campus uses @iu.edu; Purdue West Lafayette and Purdue Indianapolis both use
// @purdue.edu). The CAMPUS is self-declared, but only from the student's own
// system's list. Indianapolis is ONE row that both systems share, so scoping
// is plain `campus_id = 'indianapolis'` equality and the badge still says IU
// or Purdue because it is derived from the system.
//
// Still a relevance rule, not secrecy: RLS on users/orgs/events is
// `USING (true)` for signed-in users (plan §2.4 honesty note, critic D2).

/**
 * The university a verified school email proves (plan §2.2). Stamped by the
 * server at verification (`users.school_system`), never chosen by the
 * student.
 */
export type SchoolSystem = "iu" | "purdue";

/** Every system, in display order. */
export const SCHOOL_SYSTEMS: readonly SchoolSystem[] = Object.freeze(["iu", "purdue"]);

/** Narrow an untrusted value (a DB column, a request body) to a system. */
export function isSchoolSystem(value: unknown): value is SchoolSystem {
  return value === "iu" || value === "purdue";
}

/**
 * One campus community. Mirrors a `public.campuses` row (migration M1, plan
 * §5.1); the SQL seed (B3) must carry the same ids, names, systems and sort.
 */
export type Campus = {
  /** `campuses.id`; stored in `users.campus_id`, `orgs.campus_id`, `posts.campus_id`. */
  id: string;
  /** Picker sub-line and single-system badge ("IU Bloomington"); "Indianapolis" when shared. */
  name: string;
  /** Picker title ("Bloomington"); the shared badge is `SYSTEM_LABEL[s] + " " + shortName`. */
  shortName: string;
  /** City, for disambiguation. */
  city: string;
  /** Systems whose students may call this home. Two entries = a shared community. */
  systems: SchoolSystem[];
  /** The admin "open" switch (settled 09-12 §3). Closed campuses stay selectable. */
  isOpen: boolean;
  /** Picker order after shared campuses; lower first, ties by name. */
  sort: number;
};

export const SYSTEM_LABEL: Record<SchoolSystem, "IU" | "Purdue"> = Object.freeze({
  iu: "IU",
  purdue: "Purdue",
});

/**
 * The seed list (plan §2.3). Mirrors the INSERT in
 * `supabase/migrations/20260916100000_campuses_school_system.sql` row for
 * row (id, name, short_name, city, systems, is_open, sort).
 *
 * Two shared communities (both universities call them home):
 * - Indianapolis, the only campus open at launch.
 * - Fort Wayne (Franky, plan §7 Q4, settled 2026-09-15): IU Fort Wayne sits
 *   on Purdue Fort Wayne's campus, so it's ONE row, closed at launch. The
 *   badge ("IU Fort Wayne" / "Purdue Fort Wayne") and the picker copy
 *   ("IU Fort Wayne · one community with Purdue Fort Wayne") come from the
 *   generic shared-campus rules below. Its id is the legacy `IU_CAMPUSES` id,
 *   so a legacy "IU Fort Wayne" row maps straight onto it, and
 *   `singleCampusForEmail("…@pfw.edu")` (B2) returns the same id.
 *
 * Dropped on purpose: IU Online (0 live rows), Purdue Global, Purdue
 * Polytechnic's statewide teaching sites. Non-shared ids carry a system
 * prefix because a bare legacy id (`northwest`) would collide across systems.
 */
const CAMPUS_ROWS: Campus[] = [
  // Shared: one community for both universities.
  { id: "indianapolis", name: "Indianapolis", shortName: "Indianapolis", city: "Indianapolis", systems: ["iu", "purdue"], isOpen: true, sort: 0 },
  { id: "fort-wayne", name: "Fort Wayne", shortName: "Fort Wayne", city: "Fort Wayne", systems: ["iu", "purdue"], isOpen: false, sort: 10 },
  // IU
  { id: "iu-bloomington", name: "IU Bloomington", shortName: "Bloomington", city: "Bloomington", systems: ["iu"], isOpen: false, sort: 20 },
  { id: "iu-columbus", name: "IU Columbus", shortName: "Columbus", city: "Columbus", systems: ["iu"], isOpen: false, sort: 30 },
  { id: "iu-east", name: "IU East", shortName: "East", city: "Richmond", systems: ["iu"], isOpen: false, sort: 30 },
  { id: "iu-kokomo", name: "IU Kokomo", shortName: "Kokomo", city: "Kokomo", systems: ["iu"], isOpen: false, sort: 30 },
  { id: "iu-northwest", name: "IU Northwest", shortName: "Northwest", city: "Gary", systems: ["iu"], isOpen: false, sort: 30 },
  { id: "iu-south-bend", name: "IU South Bend", shortName: "South Bend", city: "South Bend", systems: ["iu"], isOpen: false, sort: 30 },
  { id: "iu-southeast", name: "IU Southeast", shortName: "Southeast", city: "New Albany", systems: ["iu"], isOpen: false, sort: 30 },
  // Purdue
  { id: "purdue-west-lafayette", name: "Purdue West Lafayette", shortName: "West Lafayette", city: "West Lafayette", systems: ["purdue"], isOpen: false, sort: 20 },
  { id: "purdue-northwest", name: "Purdue Northwest", shortName: "Northwest", city: "Hammond / Westville", systems: ["purdue"], isOpen: false, sort: 30 },
];

/** True when students of more than one system share this community. */
export function isSharedCampus(c: Campus): boolean {
  return c.systems.length > 1;
}

/** Picker order: shared campuses first, then `sort`, then name. */
function pickerOrder(a: Campus, b: Campus): number {
  const shared = Number(isSharedCampus(b)) - Number(isSharedCampus(a));
  if (shared !== 0) return shared;
  if (a.sort !== b.sort) return a.sort - b.sort;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function freezeCampus(c: Campus): Campus {
  Object.freeze(c.systems);
  return Object.freeze(c);
}

/**
 * Every campus, in picker order (shared first). Rows are frozen: this table
 * is shared by every caller in the process.
 */
export const CAMPUSES: readonly Campus[] = Object.freeze(CAMPUS_ROWS.map(freezeCampus).sort(pickerOrder));

const ROW_BY_ID = new Map(CAMPUSES.map((c) => [c.id, c]));

/**
 * Look up a campus row by id (trimmed, any casing). New name so the legacy
 * {@link campusById} keeps returning {@link IuCampus}. Legacy ids that were
 * renamed (`bloomington`, `northwest`, …) return null here; map them with
 * {@link campusIdFromLegacyLabel}. (`indianapolis` and `fort-wayne` kept their
 * ids, so they resolve either way.) When storing, write the returned row's
 * `id`, never the raw input.
 */
export function campusRowById(id: string | null | undefined): Campus | null {
  if (typeof id !== "string") return null;
  return ROW_BY_ID.get(id.trim().toLowerCase()) ?? null;
}

/**
 * The allowed set for a system, in picker order: shared campuses first
 * (Indianapolis at index 0, then Fort Wayne), then by `sort` and name. Returns a fresh
 * array; an invalid system returns [].
 */
export function campusesForSystem(s: SchoolSystem): Campus[] {
  if (!isSchoolSystem(s)) return [];
  return CAMPUSES.filter((c) => c.systems.includes(s));
}

/**
 * Canonical campus id when `id` names a campus in `s`'s allowed set, else
 * null. A null/unknown system allows nothing: an unverified student can't
 * pick a campus. Use this to validate a write.
 */
export function allowedCampusId(id: unknown, s: SchoolSystem | null | undefined): string | null {
  if (!isSchoolSystem(s) || typeof id !== "string") return null;
  const row = campusRowById(id);
  return row && row.systems.includes(s) ? row.id : null;
}

/** Whether `id` is in the allowed set for `s` (same rules as {@link allowedCampusId}). */
export function isCampusAllowed(id: string | null | undefined, s: SchoolSystem | null | undefined): boolean {
  return allowedCampusId(id, s) !== null;
}

/** Badge wording for a campus row the student is allowed on (plan §2.5). */
function badgeText(c: Campus, s: SchoolSystem): string {
  return isSharedCampus(c) ? `${SYSTEM_LABEL[s]} ${c.shortName}` : c.name;
}

/**
 * Legacy `IuCampus.id` → campus id. Covers EVERY entry of `IU_CAMPUSES`, so
 * every label the old picker could write has an answer (the test pins this).
 * "online" → null: IU Online isn't a student community in the new list
 * (plan §2.3; 0 live rows), so such a row is campus-less and gets prompted.
 */
const LEGACY_ID_TO_CAMPUS_ID = new Map<string, string | null>([
  ["indianapolis", "indianapolis"],
  ["bloomington", "iu-bloomington"],
  ["east", "iu-east"],
  ["fort-wayne", "fort-wayne"],
  ["kokomo", "iu-kokomo"],
  ["northwest", "iu-northwest"],
  ["south-bend", "iu-south-bend"],
  ["southeast", "iu-southeast"],
  ["online", null],
]);

/**
 * Labels the campus model itself produces (every name, and every
 * {@link legacyLabel} for each system), lowercased → id. Lets a dual-written
 * "Purdue Indianapolis" or "IU Columbus" round-trip.
 */
const MODEL_LABEL_TO_ID = new Map<string, string>();
for (const c of CAMPUSES) {
  MODEL_LABEL_TO_ID.set(c.name.toLowerCase(), c.id);
  for (const s of c.systems) MODEL_LABEL_TO_ID.set(badgeText(c, s).toLowerCase(), c.id);
}

/**
 * Coerce anything a legacy `school` column or a pre-migration client can
 * carry to a campus id: an `IU_CAMPUSES` label ("IU Indianapolis" →
 * "indianapolis", "IU Fort Wayne" → "fort-wayne"), a legacy id
 * ("bloomington" → "iu-bloomington"), a label this model dual-wrote
 * ("Purdue Indianapolis" → "indianapolis"), or an already-new id. Trimmed,
 * any casing. Returns null for "", junk ("iu.edu") and "IU Online".
 *
 * It does NOT check the system: pass the result through
 * {@link allowedCampusId} before storing it.
 */
export function campusIdFromLegacyLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const v = label.trim();
  if (!v) return null;
  const legacy = campusByLabel(v) ?? campusById(v);
  if (legacy) return LEGACY_ID_TO_CAMPUS_ID.get(legacy.id) ?? null;
  return MODEL_LABEL_TO_ID.get(v.toLowerCase()) ?? campusRowById(v)?.id ?? null;
}

/**
 * The `users.school` / `orgs.school` value to dual-write next to `campus_id`
 * for one release (plan §5.5 step 4), until M3 drops the column.
 *
 * RULE: legacy label = the badge text for that campus and system.
 * - IU, at a campus the old list had: exactly its `IU_CAMPUSES` label
 *   ("indianapolis" + "iu" → "IU Indianapolis"; "fort-wayne" + "iu" → "IU
 *   Fort Wayne"). Old readers (`campusByLabel`, `campusBadgeLabel`, the exact
 *   `school.eq` filters, the feed boost) behave exactly as they do today.
 * - IU Columbus (new): "IU Columbus". Old readers don't know it and treat it
 *   as "no campus", the same as writing "", but equality readers still match
 *   two Columbus students to each other.
 * - PURDUE: "Purdue Indianapolis", "Purdue West Lafayette", "Purdue Fort
 *   Wayne", "Purdue Northwest". Deliberately NOT "IU Indianapolis": that would
 *   show a Purdue student as IU in every display-only reader left until M3
 *   (critic C1 list). Old label-model readers see an unknown label, which
 *   they read as "no campus": scope falls open to everything and the old
 *   `campusBadgeLabel` would say "IU verified". That is acceptable only
 *   because Purdue signups stay off (`PURDUE_SIGNUPS_ENABLED`) until wave 2
 *   has moved every scoping read and the badge onto `campus_id` +
 *   `school_system`.
 * - An unknown id, a campus outside the system, or no system: "" (the
 *   column default, meaning "no campus").
 *
 * Round trip: `campusIdFromLegacyLabel(legacyLabel(id, s)) === id` for every
 * allowed pair.
 */
export function legacyLabel(id: string | null | undefined, s: SchoolSystem | null | undefined): string {
  if (!isSchoolSystem(s)) return "";
  const row = campusRowById(allowedCampusId(id, s));
  return row ? badgeText(row, s) : "";
}

/**
 * Profile badge (plan §2.5). New name so the legacy {@link campusBadgeLabel}
 * keeps its one-argument signature.
 * - shared campus → "IU Indianapolis" / "Purdue Indianapolis"
 * - single-system campus → its name ("IU Bloomington", "Purdue West Lafayette")
 * - verified with no campus → "IU verified" / "Purdue verified". A campus
 *   outside the student's system (only reachable by bypassing the DB trigger)
 *   gets this too: never a badge claiming the other university's campus.
 * - no system (unverified) → null, meaning no badge
 */
export function campusBadgeFor(
  campusId: string | null | undefined,
  system: SchoolSystem | null | undefined,
): string | null {
  if (!isSchoolSystem(system)) return null;
  const row = campusRowById(allowedCampusId(campusId, system));
  return row ? badgeText(row, system) : `${SYSTEM_LABEL[system]} verified`;
}

/**
 * Former names, said once and only in the picker (plan §2.5 copy rules).
 * Never use "IUI", "PUI" or "UIndy".
 */
const FORMERLY = new Map<string, string>([["indianapolis", "IUPUI"]]);

/**
 * Picker sub-line for a SHARED campus, seen from system `s` (plan §3.5):
 *   IU:     "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"
 *   Purdue: "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)"
 *   IU:     "IU Fort Wayne · one community with Purdue Fort Wayne"
 *   Purdue: "Purdue Fort Wayne · one community with IU Fort Wayne"
 * Null for a single-system campus, or when `s` can't call `c` home.
 */
export function sharedWithCopy(c: Campus, s: SchoolSystem): string | null {
  if (!c || !isSchoolSystem(s) || !isSharedCampus(c) || !c.systems.includes(s)) return null;
  const others = c.systems.filter((o) => o !== s).map((o) => `${SYSTEM_LABEL[o]} ${c.shortName}`);
  const formerly = FORMERLY.get(c.id);
  return `${badgeText(c, s)} · one community with ${others.join(" and ")}${formerly ? ` (formerly ${formerly})` : ""}`;
}

/**
 * Picker card sub-line (plan §3.5): the shared-with copy for a shared campus,
 * otherwise the full name ("IU Bloomington"). The card title is `shortName`.
 */
export function campusPickerSub(c: Campus, s: SchoolSystem): string {
  return sharedWithCopy(c, s) ?? c.name;
}
