/**
 * Word filter (plan §Word filter). Pure, no server-only import and no `@/`
 * import, so `node --test --experimental-strip-types` can load it.
 *
 * WHAT IT IS FOR: the handful of things that need no judgement — slurs,
 * directed threats, and words that only exist to sexualise minors. The list
 * and the reasoning behind its size live in `text-filter-list.ts`. Everything
 * else is a report for a human to read.
 *
 * A MATCH IS A 422 `content_blocked`, and the student is told "That includes
 * words that aren't allowed on Vibe. Edit it and try again." The matched word
 * is NEVER echoed back: naming it turns the filter into a guessing game and
 * makes the refusal feel like an accusation.
 *
 * TWO PASSES, both over the same normalised text:
 *  1. word-boundary matching, which is what keeps "assessment", "Dickinson",
 *     "raccoon", "spicy", "therapist" and "Scunthorpe" posting normally;
 *  2. for the longer unambiguous terms only, matching again with every
 *     separator removed, which catches "f a g g o t" and "n-i-g-g-e-r".
 *
 * ONLY CHECK WHAT CHANGED. Names, bios and taglines are re-sent on every
 * autosave (src/app/api/me/profile-sync/route.ts saves up to 300 times per 10
 * minutes and writes all three together). A student whose stored bio predates
 * a list change would 422 on every keystroke forever, unable to fix a field
 * they cannot even see is the problem. Callers use `checkChangedText`, which
 * says "ok" when the value is the one already stored.
 */

import { filterTerms, type FilterCategory } from "./text-filter-list";

export type { FilterCategory };

export type TextCheck = { ok: true } | { ok: false; category: FilterCategory };

const OK: TextCheck = { ok: true };

/**
 * Digits people substitute for letters. Deliberately small: every entry is a
 * shape swap someone actually uses, and a bigger map means more ordinary words
 * turning into terms by accident. Always applied — "top 10" becoming "top io"
 * costs nothing, and a trailing digit is a real evasion ("…r5").
 */
const DIGIT_LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

/**
 * Punctuation people substitute for letters. Applied ONLY between two letters.
 * At the edge of a word these are ordinary punctuation, and mapping them there
 * was a real bug: "HEY <slur>!" normalised to "…!" → "…i", which glued a
 * letter to the end of the word and slipped straight past the word boundary.
 */
const SYMBOL_LEET: Readonly<Record<string, string>> = {
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

const isLetter = (c: string | undefined): boolean => c !== undefined && c >= "a" && c <= "z";

/** See {@link DIGIT_LEET} and {@link SYMBOL_LEET}. Input is already lowercased. */
function mapLeet(text: string): string {
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const digit = DIGIT_LEET[chars[i]];
    if (digit) {
      chars[i] = digit;
      continue;
    }
    const symbol = SYMBOL_LEET[chars[i]];
    if (symbol && isLetter(chars[i - 1]) && isLetter(chars[i + 1])) chars[i] = symbol;
  }
  return chars.join("");
}

/** Zero-width and invisible characters, the cheapest way to break a match. */
const INVISIBLE = /[­​-‏⁠﻿]/g;

/**
 * Lowercase, accent-folded, leet-mapped, de-stuttered text with single
 * spaces. Runs of three or more of the same character collapse to one, so
 * "niiiice" survives and "n i i i i" style padding does not help; a run of two
 * is left alone, which is what keeps "assessment" and "bookkeeper" intact.
 */
function normalize(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{Mn}+/gu, "")
    .replace(INVISIBLE, "")
    .toLowerCase();
  // Leet mapping needs the lowercased text, and the collapse needs the mapped
  // text ("n11l" → "niil" → "nil"), so these are two steps, not one chain.
  return mapLeet(folded)
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Regex-safe copy of a term (the list holds letters and spaces, but never assume). */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CompiledTerm = { pattern: RegExp; squeezed: string | null; category: FilterCategory };

let compiled: CompiledTerm[] | null = null;

/**
 * One regex per term, built once.
 *
 * - `\b` at both ends is the Scunthorpe guard.
 * - A space inside a term matches any one to three separators, so
 *   "kill yourself" also catches "kill-yourself" and "kill_your self" without
 *   the separator-stripping pass, which would eat "kill your self-esteem".
 * - A trailing `(e?s|z)` catches the plural of a single word.
 */
function compile(): CompiledTerm[] {
  if (compiled) return compiled;
  compiled = filterTerms().map(({ term, category, spaced }) => {
    const normalized = normalize(term);
    const body = normalized
      .split(" ")
      .map(escapeRe)
      .join("[^a-z0-9]{1,3}");
    const plural = normalized.includes(" ") ? "" : "(?:e?s|z)?";
    return {
      pattern: new RegExp(`\\b${body}${plural}\\b`),
      squeezed: spaced ? normalized.replace(/[^a-z0-9]/g, "") : null,
      category,
    };
  });
  return compiled;
}

/**
 * Check one value. Empty, blank and missing text is always fine — a student
 * clearing their bio is not a moderation event.
 */
export function checkText(text: string | null | undefined): TextCheck {
  if (typeof text !== "string" || !text.trim()) return OK;

  const normalized = normalize(text);
  if (!normalized) return OK;
  const squeezed = normalized.replace(/[^a-z0-9]/g, "");

  for (const { pattern, squeezed: bare, category } of compile()) {
    if (pattern.test(normalized)) return { ok: false, category };
    if (bare && squeezed.includes(bare)) return { ok: false, category };
  }
  return OK;
}

/**
 * True when a field is being saved with the value it already holds. Null,
 * undefined and "" all mean the same empty field, so switching between them
 * counts as unchanged.
 */
export function sameStoredText(
  next: string | null | undefined,
  previous: string | null | undefined,
): boolean {
  return (next ?? "").trim() === (previous ?? "").trim();
}

/**
 * The check every profile-shaped route should use: an unchanged field is
 * always allowed through, whatever the list says today. See the header —
 * without this, one list change locks a student out of their own autosave.
 *
 * `previous` is the value currently stored. Pass `undefined` for a field the
 * route is creating (a new post, a new comment), where every value is new.
 */
export function checkChangedText(
  next: string | null | undefined,
  previous: string | null | undefined,
): TextCheck {
  if (previous !== undefined && sameStoredText(next, previous)) return OK;
  return checkText(next);
}
