/**
 * Tests for the word filter (`text-filter.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/moderation/text-filter.test.ts
 *
 * NO SLUR IS TYPED IN THIS FILE. Every positive case is built from the encoded
 * list itself (`filterTerms()`), so the test proves the matching works without
 * the test file becoming the thing the list is encoded to avoid. The negative
 * cases are ordinary words, typed out, because those are the ones a reader
 * needs to be able to check at a glance.
 *
 * WHY THE RESOLVE HOOK: the module imports "./text-filter-list" extensionless,
 * which is what Next and tsc expect; Node's type stripping adds no extension.
 * Same pattern as school-email-domains.test.ts.
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
  throw new Error("text-filter.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { checkChangedText, checkText, sameStoredText } = await import("./text-filter");
const { filterTerms } = await import("./text-filter-list");

const TERMS = filterTerms();

/** The list is small on purpose; if it ever balloons, that is a review moment. */
test("the list is short, categorised and lowercase", () => {
  assert.ok(TERMS.length > 0 && TERMS.length <= 60, `list length ${TERMS.length}`);
  for (const { term, category, spaced } of TERMS) {
    assert.equal(term, term.toLowerCase().trim(), term.length + "-char term is not normalised");
    assert.ok(["slur", "threat", "sexual_minor"].includes(category));
    // Separator-stripped matching is only safe for long single words.
    if (spaced) {
      assert.ok(!term.includes(" "), "a multi-word term must not be spaced-matched");
      assert.ok(term.length >= 5, `${term.length} letters is too short to squeeze`);
    }
  }
});

test("every term matches, on its own and inside a sentence", () => {
  for (const { term, category } of TERMS) {
    assert.deepEqual(checkText(term), { ok: false, category });
    assert.deepEqual(checkText(`hey ${term} ok`), { ok: false, category });
    assert.deepEqual(checkText(`HEY ${term.toUpperCase()}!`), { ok: false, category });
    // Trailing punctuation and quotes are separators, not shields.
    assert.deepEqual(checkText(`"${term}."`), { ok: false, category });
  }
});

test("leetspeak, accents and stutter do not get past it", () => {
  const leet: Record<string, string> = { o: "0", i: "1", e: "3", a: "4", s: "5", t: "7" };
  const accents: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };
  for (const { term, category } of TERMS) {
    const asLeet = [...term].map((c) => leet[c] ?? c).join("");
    if (asLeet !== term) {
      assert.deepEqual(checkText(asLeet), { ok: false, category }, `leet: ${asLeet}`);
    }
    const asAccented = [...term].map((c) => accents[c] ?? c).join("");
    if (asAccented !== term) {
      assert.deepEqual(checkText(asAccented), { ok: false, category }, "accents");
    }
    // A three-long run collapses; a zero-width space is removed.
    const stuttered = term[0].repeat(3) + term.slice(1);
    assert.deepEqual(checkText(stuttered), { ok: false, category }, "stutter");
    assert.deepEqual(checkText([...term].join("​")), { ok: false, category }, "zero-width");
  }
});

test("spaced-out spelling is caught for the terms that can take it", () => {
  for (const { term, category, spaced } of TERMS) {
    if (!spaced) continue;
    for (const sep of [" ", ".", "-", "_", "*"]) {
      const broken = [...term].join(sep);
      assert.deepEqual(checkText(`look ${broken} here`), { ok: false, category }, broken);
    }
  }
});

test("multi-word terms survive being punctuated, but not re-split", () => {
  for (const { term, category } of TERMS) {
    if (!term.includes(" ")) continue;
    for (const joined of [term.replace(/ /g, "-"), term.replace(/ /g, "_"), term.replace(/ /g, "  ")]) {
      assert.deepEqual(checkText(joined), { ok: false, category }, joined);
    }
  }
});

test("Scunthorpe: ordinary words are never blocked", () => {
  const innocent = [
    // The cases the plan names.
    "assessment",
    "Dickinson",
    "grape",
    "therapist",
    "class",
    "analysis",
    "Uranus",
    "cocktail",
    "shiitake",
    // The ones this list actually risks: each contains a term.
    "raccoon",
    "cocoon",
    "tycoon",
    "spicy",
    "despicable",
    "Scunthorpe",
    "flame retardant",
    "a bassoon recital",
    // And a few whole sentences a student would really write.
    "Anyone in my assessment class want to grab a cocktail after?",
    "My therapist says the analysis assignment is retarding my sleep schedule",
    "Chicken tikka with shiitake mushrooms at the Dickinson house tonight",
    "That workout will kill your self-esteem, not your legs",
    "Rape crisis resources are on the Title IX page if anyone needs them",
  ];
  // NOT on this list, on purpose: "a chink of light". The anti-Asian slur is
  // also an ordinary English word, and text-filter-list.ts says out loud that
  // the rare false refusal is the accepted cost of keeping it.
  for (const text of innocent) {
    assert.deepEqual(checkText(text), { ok: true }, text);
  }
});

test("empty, blank and missing text is always fine", () => {
  for (const value of ["", "   ", "\n", null, undefined]) {
    assert.deepEqual(checkText(value), { ok: true }, JSON.stringify(value));
  }
});

test("an unchanged field is never blocked", () => {
  const stored = TERMS[0].term;
  // The autosave case: the bio was written before the term was on the list.
  assert.deepEqual(checkChangedText(stored, stored), { ok: true });
  assert.deepEqual(checkChangedText(`  ${stored}  `, stored), { ok: true });
  // Editing it at all puts it back under the filter.
  assert.deepEqual(checkChangedText(`${stored} again`, stored), {
    ok: false,
    category: TERMS[0].category,
  });
  // A brand new value (no stored one) is always checked.
  assert.deepEqual(checkChangedText(stored, undefined), {
    ok: false,
    category: TERMS[0].category,
  });
  // Clearing a field that was blocked is allowed.
  assert.deepEqual(checkChangedText("", stored), { ok: true });
});

test("sameStoredText treats null, undefined and empty as one empty field", () => {
  assert.equal(sameStoredText(null, undefined), true);
  assert.equal(sameStoredText("", null), true);
  assert.equal(sameStoredText("  hi  ", "hi"), true);
  assert.equal(sameStoredText("hi", "hey"), false);
});
