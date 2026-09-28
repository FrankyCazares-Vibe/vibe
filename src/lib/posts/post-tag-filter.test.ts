/**
 * Tests for `firstBlockedPostTag` (post-tag-filter.ts): the edit path's tag
 * word filter, which must match publish's (crosscheck-waveB "Tags").
 *
 * Run with:
 *   node --test src/lib/posts/post-tag-filter.test.ts
 *
 * NO LISTED TERM IS TYPED IN THIS FILE: positives are built from
 * `filterTerms()`; failure messages name a list index, never a term.
 * The resolve hook is the one from tags.test.ts (extensionless relative
 * imports).
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
  throw new Error("post-tag-filter.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { firstBlockedPostTag } = await import("./post-tag-filter");
const { captionHashtags } = await import("./caption-tags");
const { firstBlockedTag, isValidPostTag, normalizePostTags } = await import("./tags");
const { extractPostTags } = await import("./edit");
const { filterTerms } = await import("../moderation/text-filter-list");

const TERMS = filterTerms();
const asToken = (term: string) => term.replace(/ /g, "_");
/** Ten harmless tags, so an eleventh is never among the stored ones. */
const TEN = Array.from({ length: 10 }, (_, i) => `#week_${i}`).join(" ");

/** What PATCH /api/posts/[id] runs on new caption text. */
const editCheck = (caption: string) => firstBlockedPostTag(extractPostTags(caption), caption);

test("the list is not empty (every positive below is real)", () => {
  assert.ok(TERMS.length > 0);
});

test("an 11th tag with a listed term is refused on edit", () => {
  TERMS.forEach(({ term }, i) => {
    const caption = `${TEN} #${asToken(term)}_club`;
    // The stored tags stop at 10, so the old edit filter never saw it.
    assert.equal(extractPostTags(caption).length, 10);
    assert.equal(firstBlockedTag(extractPostTags(caption)), null, `term #${i}: stored tags`);
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
});

test("a #café_<term> edit is refused (non-ASCII tag, never stored whole)", () => {
  TERMS.forEach(({ term }, i) => {
    const caption = `Coffee chat #café_${asToken(term)}`;
    // extractPostTags stops at the é and stores "caf".
    assert.deepEqual(extractPostTags(caption), ["caf"], `term #${i}: stored tags`);
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
});

test("a tag over 32 characters with a listed term at the end is refused on edit", () => {
  let cutShown = 0;
  TERMS.forEach(({ term }, i) => {
    const caption = `#${"a".repeat(30)}_${asToken(term)}`;
    const stored = extractPostTags(caption);
    assert.equal(stored[0].length, 32, `term #${i}: stored tag is cut at 32`);
    if (firstBlockedTag(stored) === null) cutShown += 1;
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
  // The cut really does hide the term from the stored tags (why this exists).
  assert.ok(cutShown > 0, "every cut tag still carried its term; the gap this closes is gone");
});

test("edit and publish agree on the same caption", () => {
  const captions = [
    "Welcome week! #campus_life #iu_2026 #class_of_2027 #assessment #scunthorpe #café",
    `${TEN} #eleventh`,
    `#${"b".repeat(40)} long one`,
    ...TERMS.map(({ term }) => `${TEN} #café_${asToken(term)} #${"c".repeat(33)}_${asToken(term)}`),
  ];
  for (const caption of captions) {
    const tags = extractPostTags(caption);
    // publish-post: firstBlockedTag([...normalizePostTags(body.tags), ...captionHashtags(content)])
    const publish = firstBlockedTag([...normalizePostTags(tags), ...captionHashtags(caption)]);
    assert.equal(editCheck(caption) === null, publish === null);
  }
});

test("ordinary edits pass, and the stored tags are unchanged and valid", () => {
  for (const caption of [
    "Welcome week! #campus_life #iu_2026 #class_of_2027 #assessment #scunthorpe #café",
    `${TEN} #eleventh #${"d".repeat(40)}`,
    "no tags at all",
    "",
  ]) {
    assert.equal(editCheck(caption), null, caption.slice(0, 20));
    const tags = extractPostTags(caption);
    assert.ok(tags.length <= 10);
    for (const tag of tags) assert.ok(isValidPostTag(tag), tag);
  }
});
