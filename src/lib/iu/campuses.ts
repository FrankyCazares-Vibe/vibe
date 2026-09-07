/**
 * Indiana University campuses — the canonical list behind Vibe's campus
 * scoping. Client-safe (no server-only imports).
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

/** The pilot campus — the default selection in pickers. */
export const DEFAULT_CAMPUS_ID = "indianapolis";

/** Sentinel used by list endpoints to mean "every campus, don't filter". */
export const ALL_CAMPUSES = "all";

const BY_ID = new Map(IU_CAMPUSES.map((c) => [c.id, c]));
const BY_LABEL = new Map(IU_CAMPUSES.map((c) => [c.label.toLowerCase(), c]));

export function campusById(id: string | null | undefined): IuCampus | null {
  return BY_ID.get((id ?? "").trim().toLowerCase()) ?? null;
}

/** Resolve a stored `school` value (a label) back to its campus entry. */
export function campusByLabel(label: string | null | undefined): IuCampus | null {
  return BY_LABEL.get((label ?? "").trim().toLowerCase()) ?? null;
}

/**
 * Coerce untrusted input (an id OR a label, any casing) to the canonical
 * label for storage. Returns null when it matches no known campus, so
 * callers can reject rather than write junk into `school`.
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
 */
export function campusBadgeLabel(school: string | null | undefined): string {
  return campusByLabel(school)?.label ?? "IU verified";
}
