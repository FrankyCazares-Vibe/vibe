/**
 * Tests for the Trending counter (`count-tags.ts`).
 *
 * Run with:
 *   node --test src/lib/trending/count-tags.test.ts
 *
 * NO LISTED TERM IS TYPED IN THIS FILE: word-filter positives are built from
 * `filterTerms()` and failure messages name a list index, never a term.
 *
 * WHY THE RESOLVE HOOK: count-tags.ts → ../posts/tags → ../moderation/…
 * are extensionless relative imports; Node's type stripping adds no
 * extension. Same hook as src/lib/posts/tags.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("count-tags.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { countTrendingTags, TRENDING_MIN_AUTHORS } = await import("./count-tags");
const { isValidPostTag } = await import("../posts/tags");
const { filterTerms } = await import("../moderation/text-filter-list");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const ALL = { limit: 20, minAuthors: 1 };

test("the pilot floor is 1 (raise to 2 at the student launch)", () => {
  assert.equal(TRENDING_MIN_AUTHORS, 1);
});

test("one author posting a tag twenty times counts once", () => {
  const rows = Array.from({ length: 20 }, () => ({ tags: ["campus_life"], user_id: A }));
  assert.deepEqual(countTrendingTags(rows, ALL), [{ tag: "campus_life", count: 1 }]);
});

test("a tag repeated inside one post counts once", () => {
  const rows = [{ tags: Array(10).fill("spam"), user_id: A }];
  assert.deepEqual(countTrendingTags(rows, ALL), [{ tag: "spam", count: 1 }]);
});

test("the count is different people; '#Foo' and 'foo' are the same tag", () => {
  const rows = [
    { tags: ["foo", "bar"], user_id: A },
    { tags: ["#Foo"], user_id: B },
    { tags: [" FOO "], user_id: C },
    { tags: ["bar"], user_id: A },
  ];
  assert.deepEqual(countTrendingTags(rows, ALL), [
    { tag: "foo", count: 3 },
    { tag: "bar", count: 1 },
  ]);
});

test("tags outside the stored grammar never count", () => {
  const bad = ["café", "½", "²", "Ⅻ", "", "   ", "#", "a b", "a-b", "<b>", "x".repeat(33), 7, null];
  const rows = [{ tags: [...bad, "ok"], user_id: A }, { tags: bad, user_id: B }];
  assert.deepEqual(countTrendingTags(rows, ALL), [{ tag: "ok", count: 1 }]);
});

test("listed terms never trend, alone or underscore-glued", () => {
  const terms = filterTerms();
  let covered = 0;
  terms.forEach(({ term }, i) => {
    const t = term.replace(/ /g, "_");
    const variants = [t, `${t}_lol`, `lol_${t}`].filter((v) => isValidPostTag(v.toLowerCase()));
    if (variants.length === 0) return;
    covered += 1;
    const rows = [A, B, C].map((user_id) => ({ tags: [...variants, "fine"], user_id }));
    const out = countTrendingTags(rows, ALL);
    assert.deepEqual(out, [{ tag: "fine", count: 3 }], `term #${i}`);
  });
  assert.ok(covered > 0, "no listed term fits the tag grammar; the test proves nothing");
});

test("rows without an author or a tags array are skipped", () => {
  const rows = [
    { tags: ["aa"], user_id: null },
    { tags: ["aa"], user_id: "" },
    { tags: ["aa"], user_id: 42 },
    { tags: "aa", user_id: A },
    { tags: null, user_id: A },
    null as unknown as { tags: unknown; user_id: unknown },
    { tags: ["bb"], user_id: B },
  ];
  assert.deepEqual(countTrendingTags(rows, ALL), [{ tag: "bb", count: 1 }]);
  assert.deepEqual(countTrendingTags(null, ALL), []);
  assert.deepEqual(countTrendingTags(undefined, ALL), []);
});

test("tags the new rule refuses never trend (Oct 19, 2026): no letter, or one character", () => {
  const rows = [
    { tags: ["1", "2026", "x", "gameday"], user_id: A },
    { tags: ["1", "2026", "x", "gameday"], user_id: B },
  ];
  assert.deepEqual(countTrendingTags(rows, ALL), [{ tag: "gameday", count: 2 }]);
});

test("the floor drops tags with too few people; it is at least 1", () => {
  const rows = [
    { tags: ["solo"], user_id: A },
    { tags: ["duo"], user_id: A },
    { tags: ["duo"], user_id: B },
  ];
  assert.deepEqual(countTrendingTags(rows, { limit: 10, minAuthors: 2 }), [{ tag: "duo", count: 2 }]);
  assert.equal(countTrendingTags(rows, { limit: 10, minAuthors: 0 }).length, 2);
  assert.equal(countTrendingTags(rows, { limit: 10, minAuthors: Number.NaN }).length, 2);
});

test("order: most people first, ties by tag; the limit cuts the tail", () => {
  const rows = [
    { tags: ["zeta", "beta", "alpha", "_x", "9lives"], user_id: A },
    { tags: ["zeta"], user_id: B },
  ];
  assert.deepEqual(countTrendingTags(rows, ALL).map((t) => t.tag), ["zeta", "9lives", "_x", "alpha", "beta"]);
  assert.deepEqual(countTrendingTags(rows, { limit: 2, minAuthors: 1 }).map((t) => t.tag), ["zeta", "9lives"]);
  assert.deepEqual(countTrendingTags(rows, { limit: 0, minAuthors: 1 }), []);
  assert.deepEqual(countTrendingTags(rows, { limit: 2.9, minAuthors: 1 }).length, 2);
});
