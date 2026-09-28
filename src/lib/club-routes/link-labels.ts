/**
 * The word filter on club profile LINK LABELS (security wave 2, A5b; moved
 * out of the old `club-routes/gate.ts` when its gate folded into
 * `src/lib/orgs/hidden-gate.ts`'s `officerGate`, integration I1).
 *
 * PURE ON PURPOSE: no Next, no Supabase, so `node --test` loads it. The only
 * runtime import is the word filter, which is pure as well.
 */

import { checkChangedText, checkText } from "../moderation/text-filter";

/** A club profile link as `sanitizeLinks` in `/api/orgs/[slug]` keeps it. */
export type ClubLink = { label: string; url: string };

/**
 * The labels an officer typed, run through the word filter the way every
 * other re-sent field is: ONLY WHAT CHANGED. The settings form re-sends the
 * whole links list on every save, so a label that is already stored passes
 * (text-filter.ts, "ONLY CHECK WHAT CHANGED") — otherwise one old label that
 * trips a later list change would block every future settings save.
 *
 * `stored` is the raw `orgs.links` jsonb; anything that isn't a list of
 * `{ label }` objects just means "nothing stored". Returns true when a NEW
 * label is refused.
 */
export function hasBlockedNewLinkLabel(next: readonly ClubLink[], stored: unknown): boolean {
  const storedLabels: string[] = [];
  if (Array.isArray(stored)) {
    for (const raw of stored) {
      if (raw && typeof raw === "object" && typeof (raw as { label?: unknown }).label === "string") {
        storedLabels.push((raw as { label: string }).label);
      }
    }
  }
  for (const link of next) {
    if (checkText(link.label).ok) continue;
    if (storedLabels.some((s) => checkChangedText(link.label, s).ok)) continue;
    return true;
  }
  return false;
}
