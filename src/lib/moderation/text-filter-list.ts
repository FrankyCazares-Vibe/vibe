/**
 * The word list behind `text-filter.ts`. Pure, no imports, loadable by
 * `node --test --experimental-strip-types`.
 *
 * WHY IT IS ENCODED: this file is read in code review, in pull requests and
 * over someone's shoulder. Base64 keeps the diff from being a wall of slurs
 * while staying trivially readable with `atob` when you actually need to. It
 * is NOT a security measure — anyone can decode it, and that is fine.
 *
 * WHAT IS ON THE LIST, and why it is short (plan §Word filter): slurs, direct
 * threats, and words that only exist to sexualise minors. Nothing else.
 * Ordinary profanity is NOT here: students swear, and a filter that blocks
 * "shit" teaches them the app is broken, not that Vibe has standards. Nothing
 * about politics, religion, drinking or sex between adults is here either.
 * Reporting handles the judgement calls; this list handles the ones that need
 * no judgement.
 *
 * ADDING A TERM: `node -e 'console.log(Buffer.from("word").toString("base64"))'`,
 * then add the row with its category. Ask two questions first:
 *   1. Would blocking it ever silence a student saying something reasonable?
 *      ("rape" and "rapist" are deliberately absent for this reason: students
 *      warn each other and share Title IX and crisis resources, and a filter
 *      that eats those posts does real harm. Directed threats are on the list
 *      instead.)
 *   2. Does it appear inside an ordinary English word? If so it must stay
 *      `spaced: false` — see the Scunthorpe cases in text-filter.test.ts.
 *
 * ONE TERM IS A KNOWN TRADE-OFF: the anti-Asian slur is also an ordinary
 * English word ("a chink of light", "a chink in the armor"). Those phrases are
 * archaic enough in student writing that keeping the slur is worth the rare
 * false refusal — but it IS a false refusal, and deleting that one row is a
 * one-line change if Franky would rather not take it.
 *
 * `spaced: true` means the term is ALSO matched after every separator in the
 * text is removed, which catches "f a g g o t" and "n-i-g-g-e-r". Only terms
 * of six letters or more that cannot appear by accident across ordinary word
 * boundaries get it: "beaner" is off it because "be a nerd" squeezes to
 * "beanerd", and "csam" is off it because "physics am" squeezes to
 * "physicsam".
 */

/** What a match means. Reported to admins; never shown to the student. */
export type FilterCategory = "slur" | "threat" | "sexual_minor";

export type FilterTerm = {
  /** Lowercase, plain text. Multi-word terms are separated by single spaces. */
  term: string;
  category: FilterCategory;
  /** Also matched with every separator in the text removed. See above. */
  spaced: boolean;
};

/** [base64 term, category, spaced]. Keep it sorted by category, then meaning. */
const ENCODED: ReadonlyArray<readonly [string, FilterCategory, boolean]> = [
  ["bmlnZ2Vy", "slur", true],
  ["bmlnZ2E=", "slur", true],
  ["ZmFnZ290", "slur", true],
  ["ZmFn", "slur", false],
  ["dHJhbm55", "slur", true],
  ["a2lrZQ==", "slur", false],
  ["Y2hpbms=", "slur", false],
  ["c3BpYw==", "slur", false],
  ["d2V0YmFjaw==", "slur", true],
  ["YmVhbmVy", "slur", false],
  ["Y29vbg==", "slur", false],
  ["Z29vaw==", "slur", false],
  ["ZHlrZQ==", "slur", false],
  ["cmV0YXJk", "slur", false],
  ["cmV0YXJkZWQ=", "slur", false],
  ["dG93ZWxoZWFk", "slur", true],
  ["cmFnaGVhZA==", "slur", true],
  ["a2lsbCB5b3Vyc2VsZg==", "threat", false],
  ["a2lsbCB1cnNlbGY=", "threat", false],
  ["a3lz", "threat", false],
  ["aGFuZyB5b3Vyc2VsZg==", "threat", false],
  ["bmVjayB5b3Vyc2VsZg==", "threat", false],
  ["c2hvb3QgdXAgdGhlIHNjaG9vbA==", "threat", false],
  ["Y2hpbGQgcG9ybg==", "sexual_minor", false],
  ["Y2hpbGRwb3Ju", "sexual_minor", true],
  ["Y3NhbQ==", "sexual_minor", false],
  ["amFpbGJhaXQ=", "sexual_minor", true],
  ["dW5kZXJhZ2UgcG9ybg==", "sexual_minor", false],
  ["bG9saWNvbg==", "sexual_minor", true],
];

let decoded: readonly FilterTerm[] | null = null;

/**
 * The decoded list, built once per process. `atob` is a global in Node and in
 * every browser, so this file needs no Buffer and no polyfill.
 */
export function filterTerms(): readonly FilterTerm[] {
  if (decoded) return decoded;
  decoded = Object.freeze(
    ENCODED.map(([encoded, category, spaced]) => ({
      term: atob(encoded),
      category,
      spaced,
    })),
  );
  return decoded;
}
