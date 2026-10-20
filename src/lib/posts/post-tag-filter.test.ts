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
const { POST_TAG_MAX, firstBlockedTag, isValidPostTag, normalizePostTags } = await import("./tags");
const { extractPostTags } = await import("./edit");
const { filterTerms } = await import("../moderation/text-filter-list");

const TERMS = filterTerms();
const asToken = (term: string) => term.replace(/ /g, "_");
/**
 * A full post's worth of harmless tags (5 since Oct 19, 2026), so one more is
 * never among the stored ones.
 */
const FULL = Array.from({ length: POST_TAG_MAX }, (_, i) => `#week_${i}`).join(" ");

/** What PATCH /api/posts/[id] runs on new caption text. */
const editCheck = (caption: string) => firstBlockedPostTag(extractPostTags(caption), caption);

test("the list is not empty (every positive below is real)", () => {
  assert.ok(TERMS.length > 0);
});

test("a tag past the cap with a listed term is refused on edit", () => {
  assert.equal(POST_TAG_MAX, 5);
  TERMS.forEach(({ term }, i) => {
    const caption = `${FULL} #${asToken(term)}_club`;
    // The stored tags stop at 5, so a filter over them alone never sees it.
    assert.equal(extractPostTags(caption).length, POST_TAG_MAX);
    assert.equal(firstBlockedTag(extractPostTags(caption)), null, `term #${i}: stored tags`);
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
});

test("a #café_<term> edit is refused (non-ASCII tag, never stored)", () => {
  TERMS.forEach(({ term }, i) => {
    const caption = `Coffee chat #café_${asToken(term)}`;
    // Since Oct 19, 2026 a tag that runs on into an accented letter is no
    // tag at all (it used to store "caf"); the caption check still sees it.
    assert.deepEqual(extractPostTags(caption), [], `term #${i}: stored tags`);
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
});

test("a tag over 32 characters with a listed term at the end is refused on edit", () => {
  TERMS.forEach(({ term }, i) => {
    const caption = `#${"a".repeat(30)}_${asToken(term)}`;
    // Since Oct 19, 2026 an over-long tag is never stored (it used to be cut
    // to 32, which hid the term): only the caption check can catch it.
    assert.deepEqual(extractPostTags(caption), [], `term #${i}: never stored, never cut`);
    assert.notEqual(editCheck(caption), null, `term #${i}: edit`);
  });
});

test("edit and publish agree on the same caption", () => {
  const captions = [
    "Welcome week! #campus_life #iu_2026 #class_of_2027 #assessment #scunthorpe #café",
    `${FULL} #one_more`,
    `#${"b".repeat(40)} long one`,
    ...TERMS.map(({ term }) => `${FULL} #café_${asToken(term)} #${"c".repeat(33)}_${asToken(term)}`),
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
    `${FULL} #one_more #${"d".repeat(40)}`,
    "no tags at all",
    "",
  ]) {
    assert.equal(editCheck(caption), null, caption.slice(0, 20));
    const tags = extractPostTags(caption);
    assert.ok(tags.length <= POST_TAG_MAX);
    for (const tag of tags) assert.ok(isValidPostTag(tag), tag);
  }
});
