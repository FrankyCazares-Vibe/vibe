/**
 * "What are you here for?" — the one home for the four answer tokens and the
 * copy the PROFILE shows for them.
 *
 * The question is asked in onboarding (StepProfile.tsx, onboarding.html) with
 * first-person option labels ("Showing my work"). The profile shows the same
 * answer about someone, so its labels read in the third person ("Showing
 * work"). Onboarding copy is not changed here; `looking-for.test.ts` pins the
 * tokens on every surface so they can never drift apart.
 *
 * Who sees the answer (orchestrator ruling H6, 2026-09-22): only the profile
 * owner, with an "Only you can see this" note, until Franky decides whether
 * it becomes public. Students answered it in onboarding without being told it
 * would show on their profile. The server strips it for everyone else
 * (`/api/users/[handle]/bootstrap`).
 *
 * Pure: zero imports, safe on the server, the phone bundle and in node:test.
 */

export const LOOKING_FOR_VALUES = [
  "meeting-people",
  "showing-work",
  "finding-clubs",
  "exploring",
] as const;

export type LookingFor = (typeof LOOKING_FOR_VALUES)[number];

/** Exact match on a string, no trimming. */
export function isLookingFor(v: unknown): v is LookingFor {
  return typeof v === "string" && (LOOKING_FOR_VALUES as readonly string[]).includes(v);
}

export const LOOKING_FOR_PROFILE_COPY = Object.freeze({
  rowLabel: "Here for",
  editHint: "Pick all that fit.",
  /** Ruling H6: the row is shown to its owner only, and says so. */
  ownerOnlyNote: "Only you can see this",
  labels: Object.freeze({
    "meeting-people": "Meeting people",
    "showing-work": "Showing work",
    "finding-clubs": "Finding clubs",
    exploring: "Just exploring",
  } satisfies Record<LookingFor, string>),
});

/**
 * The known tokens in `v` (each string trimmed first), deduplicated, in
 * `LOOKING_FOR_VALUES` order. Unknown tokens are dropped, never shown.
 * Anything that is not an array gives `[]`.
 */
export function lookingForForDisplay(v: unknown): LookingFor[] {
  if (!Array.isArray(v)) return [];
  const present = new Set<string>();
  for (const item of v) {
    if (typeof item === "string") present.add(item.trim());
  }
  return LOOKING_FOR_VALUES.filter((token) => present.has(token));
}

/**
 * A request body's `looking_for`:
 * - `undefined` — the field was absent: leave the column alone;
 * - `[]` — `null` clears the answer;
 * - `null` — invalid (not an array);
 * - otherwise the known tokens, canonical order (junk entries dropped
 *   silently, the rule `PATCH /api/me/profile` always had).
 */
export function parseLookingForBody(v: unknown): LookingFor[] | undefined | null {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) return null;
  return lookingForForDisplay(v);
}
