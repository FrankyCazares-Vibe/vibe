/**
 * The word filter for single TOKENS: #tags and @handles, which are written as
 * `a-z`, `0-9` and `_` with no spaces (S67 security wave B, shared contract B0;
 * critique-B4 §7).
 *
 * WHY `checkText` ALONE IS NOT ENOUGH. `checkText` wraps every term in `\b…\b`
 * (the Scunthorpe guard), and in a JavaScript regex `_` is a WORD character.
 * So a listed term glued to anything by an underscore (`<term>_lol`,
 * `lol_<term>`) has no word boundary and slips through; measured on the
 * encoded list, fewer than half the single-word terms were caught that way.
 * Reading `_` as a space puts the boundary back.
 *
 * TWO PASSES: the value as-is (keeps every catch `checkText` already makes,
 * including multi-word terms joined by `_`), then, only if it contains `_`,
 * the value with each run of `_` read as one space. `-` and `.` need nothing:
 * they are already separators to `checkText`.
 *
 * ACCEPTED RESIDUE: a bare concatenation (`<term>lol`) still passes, by design;
 * that is the same Scunthorpe guard that lets "assessment" through.
 *
 * Refusals never name the matched word (see text-filter.ts): callers answer
 * with the ordinary `content_blocked` line.
 *
 * Pure, no `@/` import: the relative, extensionless import is the house
 * pattern (profile-filter.ts); its test registers the same resolve hook as
 * text-filter.test.ts.
 */

import { checkText, type TextCheck } from "./text-filter";

export type { TextCheck };

/** The word-filter verdict for one tag or handle. Empty is always fine. */
export function checkToken(value: string | null | undefined): TextCheck {
  const asIs = checkText(value);
  if (!asIs.ok || typeof value !== "string" || !value.includes("_")) return asIs;
  return checkText(value.replace(/_+/g, " "));
}
