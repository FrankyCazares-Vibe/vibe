import { campusRowById, isSchoolSystem, SYSTEM_LABEL } from "@/lib/iu/campuses";

/**
 * Pure grouping for the phone People screen's Discover tab
 * (`NetworkMobile.tsx`, wave plan B14t). Kept out of the component so node
 * tests can load it (no React).
 *
 * `/api/me/suggested-connections` tags each row with `reason_v2`
 * (`lib/iu/community-scope.ts` `suggestionReasons`). Rows from a bundle-era
 * server without it fall back to the legacy signals, including the literal
 * `reason: "same school"` for a campus match (kept for one release).
 *
 * ON PURPOSE different from the onboarding people step (B12S
 * `groupPeople`, critic W3 L3): onboarding shows a short list in five
 * groups (clubs, campus, major, system, "More people on Vibe"); this screen
 * keeps "Friends of friends" and "New on Vibe" as their own groups, with
 * friends of friends ahead of the other-campus group.
 */

export type SuggestionReasonV2 =
  | "from_your_clubs"
  | "same_campus"
  | "same_major"
  | "same_system"
  | "mutuals"
  | "new_on_vibe";

export type SuggestionCategory = "org" | "campus" | "major" | "mutuals" | "system" | "new";

/** The suggestion fields grouping reads. `ListUser` satisfies it. */
export type SuggestionSignalsRow = {
  mutual_count?: number;
  shared_org_count?: number;
  same_major?: boolean;
  reason?: string;
  reason_v2?: SuggestionReasonV2;
  campus_id?: string | null;
  school_system?: "iu" | "purdue" | null;
};

export type SuggestionGroup = {
  key: SuggestionCategory;
  label: string;
  blurb: string;
};

/** Which group a suggestion lands in. Unknown `reason_v2` values use the legacy rules. */
export function categorizeSuggestion(u: SuggestionSignalsRow): SuggestionCategory {
  switch (u.reason_v2) {
    case "from_your_clubs":
      return "org";
    case "same_campus":
      return "campus";
    case "same_major":
      return "major";
    case "same_system":
      return "system";
    case "mutuals":
      return "mutuals";
    case "new_on_vibe":
      return "new";
    default:
      break;
  }
  if ((u.mutual_count ?? 0) > 0) return "mutuals";
  if ((u.shared_org_count ?? 0) > 0) return "org";
  if (u.same_major) return "major";
  if (u.reason === "same school") return "campus";
  return "new";
}

/** "Indianapolis" for a known campus id, else null. From our own table only. */
export function campusShortNameFor(campusId: string | null | undefined): string | null {
  return campusRowById(campusId)?.shortName ?? null;
}

/** "At Indianapolis", or "On your campus" when the campus is unknown. */
export function atCampusLabel(campusId: string | null | undefined): string {
  const name = campusShortNameFor(campusId);
  return name ? `At ${name}` : "On your campus";
}

/** "Elsewhere at Purdue", or "Elsewhere at your university" when unknown. */
export function elsewhereLabel(system: unknown): string {
  return isSchoolSystem(system)
    ? `Elsewhere at ${SYSTEM_LABEL[system]}`
    : "Elsewhere at your university";
}

/** An empty bucket per category, in group order. */
export function emptySuggestionBuckets<T>(): Record<SuggestionCategory, T[]> {
  return { org: [], campus: [], major: [], mutuals: [], system: [], new: [] };
}

/** Rows bucketed by category; server order is kept within a bucket. */
export function bucketSuggestions<T extends SuggestionSignalsRow>(
  users: readonly T[],
): Record<SuggestionCategory, T[]> {
  const buckets = emptySuggestionBuckets<T>();
  for (const u of users) buckets[categorizeSuggestion(u)].push(u);
  return buckets;
}

/**
 * The six groups in display order, labelled from the buckets (computed per
 * render). The campus label uses the bucket's first known `campus_id`, the
 * system label its first known `school_system`.
 */
export function suggestionGroupOrder(
  buckets: Record<SuggestionCategory, readonly SuggestionSignalsRow[]>,
): SuggestionGroup[] {
  const campusId = buckets.campus.find((u) => campusShortNameFor(u.campus_id))?.campus_id ?? null;
  const system = buckets.system.find((u) => isSchoolSystem(u.school_system))?.school_system ?? null;
  return [
    { key: "org", label: "From your clubs", blurb: "Members of orgs you're already in" },
    { key: "campus", label: atCampusLabel(campusId), blurb: "On campus, not yet in your circle" },
    { key: "major", label: "Same major", blurb: "Other students studying what you study" },
    { key: "mutuals", label: "Friends of friends", blurb: "People your connections know" },
    { key: "system", label: elsewhereLabel(system), blurb: "Same university, another campus" },
    { key: "new", label: "New on Vibe", blurb: "Just joined" },
  ];
}
