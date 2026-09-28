/**
 * Tests for the token word filter (`token-filter.ts`): #tags and @handles.
 *
 * Run with:
 *   node --test src/lib/moderation/token-filter.test.ts
 *
 * NO LISTED TERM IS TYPED IN THIS FILE. Every positive case is built from the
 * encoded list (`filterTerms()`), and failure messages name a list index, never
 * a term. The negative cases are ordinary tokens, typed out.
 *
 * WHY THE RESOLVE HOOK: token-filter imports "./text-filter", which imports
 * "./text-filter-list", both extensionless (what Next and tsc expect); Node's
 * type stripping adds no extension. Same hook as text-filter.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("token-filter.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const { checkToken } = await import("./token-filter");
const { checkText } = await import("./text-filter");
const { filterTerms } = await import("./text-filter-list");

const TERMS = filterTerms();
/** A term written the way a tag or handle has to be: spaces become `_`. */
const asToken = (term: string) => term.replace(/ /g, "_");

test("every listed term is refused as a token, alone or glued with underscores", () => {
  assert.ok(TERMS.length > 0);
  TERMS.forEach(({ term, category }, i) => {
    const t = asToken(term);
    for (const token of [t, `${t}_lol`, `lol_${t}`, `go_${t}_2026`, `${t}__x`, `x___${t}`, `_${t}_`]) {
      assert.deepEqual(checkToken(token), { ok: false, category }, `term #${i} as ${token.length}-char token`);
    }
    // Upper case reaches the filter too (handles and raw tags aren't lowercased yet).
    assert.deepEqual(checkToken(`${t.toUpperCase()}_LOL`), { ok: false, category }, `term #${i} upper`);
  });
});

test("the underscore pass is load-bearing: checkText alone misses glued terms", () => {
  let missedByCheckText = 0;
  TERMS.forEach(({ term }, i) => {
    const glued = `${asToken(term)}_lol`;
    if (checkText(glued).ok) missedByCheckText += 1;
    assert.equal(checkToken(glued).ok, false, `term #${i}`);
  });
  // critique-B4 §7 measured 12 of 22 single-word terms missed; if checkText
  // ever learns underscores this drops to 0 and the extra pass is merely redundant.
  assert.ok(missedByCheckText > 0, "expected checkText to miss at least one underscore-glued term");
});

test("ordinary tags and handles pass", () => {
  const ordinary = [
    "campus_life",
    "iu_2026",
    "class_of_2027",
    "go_hoosiers",
    "boiler_up",
    "assessment_day",
    "dickinson_hall",
    "raccoon_club",
    "spicy_food",
    "therapist_office",
    "scunthorpe_united",
    "bookkeeper",
    "cocktail_party",
    "franky_c",
    "_",
    "___",
    "a_b_c_d_e",
  ];
  for (const token of ordinary) assert.deepEqual(checkToken(token), { ok: true }, token);
});

test("empty and missing values are fine", () => {
  for (const value of ["", "   ", null, undefined]) assert.deepEqual(checkToken(value), { ok: true });
});

test("without an underscore it is exactly checkText", () => {
  const samples = ["hello", "campus", "IU", "boilerup2026", ...TERMS.map(({ term }) => term)];
  for (const s of samples) assert.deepEqual(checkToken(s), checkText(s));
});
