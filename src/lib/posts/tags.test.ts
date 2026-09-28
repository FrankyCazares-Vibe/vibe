/**
 * Tests for the post tag rule (`tags.ts`).
 *
 * Run with:
 *   node --test src/lib/posts/tags.test.ts
 *
 * NO LISTED TERM IS TYPED IN THIS FILE: word-filter positives are built from
 * `filterTerms()` and failure messages name a list index, never a term.
 *
 * WHY THE RESOLVE HOOK: tags.ts → ../moderation/token-filter → ./text-filter
 * → ./text-filter-list are extensionless relative imports (what Next and tsc
 * expect); Node's type stripping adds no extension. Same hook as
 * text-filter.test.ts. Copy it into any test that loads tags.ts.
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
  throw new Error("tags.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { POST_TAG_MAX, POST_TAG_MAX_LEN, POST_TAG_RE, isValidPostTag, normalizePostTags, firstBlockedTag } =
  await import("./tags");
const { extractPostTags } = await import("./edit");
const { filterTerms } = await import("../moderation/text-filter-list");

const TERMS = filterTerms();
const asToken = (term: string) => term.replace(/ /g, "_");
/** Odd inputs every normalizer output must survive (the DB trigger's view). */
const WEIRD = [
  "café", "½", "²", "Ⅻ", "٣", "日本", "ａｂｃ", "Kelvin", "İstanbul", "ſtar",
  "a​b", "é", "a b", "a-b", "a.b", "<b>", "a\nb", "a\n", "\tx\t", "#", "##", "",
  "#UPPER", "#Mixed_Case_9", "x".repeat(POST_TAG_MAX_LEN + 1), "y".repeat(POST_TAG_MAX_LEN),
];

test("the grammar: 1-32 of a-z, 0-9, _ (the SQL twin's pattern)", () => {
  assert.equal(POST_TAG_MAX, 10);
  assert.equal(POST_TAG_MAX_LEN, 32);
  assert.equal(POST_TAG_RE.source, "^[a-z0-9_]{1,32}$");
  for (const ok of ["a", "_", "campus_life", "iu_2026", "0", "z".repeat(32)]) {
    assert.equal(isValidPostTag(ok), true, ok);
  }
  const bad: unknown[] = ["", "z".repeat(33), "Foo", "café", "½", "²", "Ⅻ", "٣", "ａ", "a b", "a-b", "#a", "a\n", "<b>", null, 7, ["a"]];
  for (const value of bad) assert.equal(isValidPostTag(value), false, JSON.stringify(value));
});

test("normalize: trim, lower-case, strip leading #, drop (never truncate) the invalid", () => {
  assert.deepEqual(normalizePostTags(["#Foo", "##Bar", "  #Baz_9  ", "qux"]), ["foo", "bar", "baz_9", "qux"]);
  assert.deepEqual(normalizePostTags(["café", "½", "²", "Ⅻ", "a b", "a-b", "#", "", "   ", "<b>"]), []);
  assert.deepEqual(normalizePostTags(["x".repeat(33), "y".repeat(32)]), ["y".repeat(32)]);
  assert.deepEqual(normalizePostTags(["ok", 7, null, { tag: "x" }, ["y"], "fine"]), ["ok", "fine"]);
  for (const notArray of [undefined, null, "foo", "#foo,#bar", 42, { 0: "a", length: 1 }]) {
    assert.deepEqual(normalizePostTags(notArray), []);
  }
});

test("normalize: duplicates collapse to the first; at most 10 valid tags", () => {
  assert.deepEqual(normalizePostTags(["Foo", "#foo", "FOO", "bar", "#BAR"]), ["foo", "bar"]);
  const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
  assert.deepEqual(normalizePostTags(eleven), eleven.slice(0, 10));
  // Invalid entries and duplicates don't use up the 10.
  const noisy = ["café", "t0", "#T0", "½", ...eleven.slice(1)];
  assert.deepEqual(normalizePostTags(noisy), eleven.slice(0, 10));
});

test("every normalize output is a tag the database stores", () => {
  const inputs = [WEIRD, [...WEIRD].reverse(), WEIRD.map((w) => `#${w}`), WEIRD.map((w) => w.toUpperCase())];
  for (const input of inputs) {
    const out = normalizePostTags(input);
    assert.ok(out.length <= POST_TAG_MAX);
    assert.equal(new Set(out).size, out.length);
    for (const tag of out) assert.ok(isValidPostTag(tag), JSON.stringify(tag));
  }
});

test("every extractPostTags output (PATCH, phone composer) is a tag the database stores", () => {
  const captions = [
    "#Hello #hello #WORLD_2026 # #",
    `#${"L".repeat(40)} and #${"s".repeat(32)}`,
    "#café #日本 #½ #a-b #a.b",
    Array.from({ length: 14 }, (_, i) => `#Tag${i}`).join(" "),
    WEIRD.map((w) => `#${w}`).join(" "),
  ];
  for (const caption of captions) {
    const tags = extractPostTags(caption);
    assert.ok(tags.length <= POST_TAG_MAX);
    for (const tag of tags) assert.ok(isValidPostTag(tag), JSON.stringify(tag));
    // And normalizing them again changes nothing.
    assert.deepEqual(normalizePostTags(tags), tags);
  }
});

test("firstBlockedTag: ordinary tags pass; empty list passes", () => {
  assert.equal(firstBlockedTag([]), null);
  assert.equal(firstBlockedTag(["campus_life", "iu_2026", "class_of_2027", "assessment", "scunthorpe"]), null);
});

test("firstBlockedTag: any listed term, alone or underscore-glued, is caught; the first one wins", () => {
  TERMS.forEach(({ term }, i) => {
    const t = asToken(term);
    for (const blocked of [t, `${t}_lol`, `lol_${t}`]) {
      assert.equal(firstBlockedTag(["campus_life", blocked, "iu_2026"]), blocked, `term #${i}`);
    }
    assert.equal(firstBlockedTag([`${t}_a`, `b_${t}`]), `${t}_a`, `term #${i} first`);
  });
  // A non-string smuggled in at runtime is skipped, not thrown on.
  assert.equal(firstBlockedTag([7 as unknown as string, "ok"]), null);
});

test("publish path: normalize then filter catches a disguised tag", () => {
  let covered = 0;
  TERMS.forEach(({ term }, i) => {
    const raw = `##${asToken(term).toUpperCase()}_LOL`;
    const tags = normalizePostTags(["fine", raw]);
    if (tags.length !== 2) return; // too long or non-ASCII for a tag: dropped before the filter
    covered += 1;
    assert.equal(firstBlockedTag(tags), tags[1], `term #${i}`);
  });
  assert.ok(covered > 0, "no listed term fits the tag grammar; the test proves nothing");
});
