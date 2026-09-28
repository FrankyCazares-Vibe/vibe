/**
 * Tests for `captionHashtags` (caption-tags.ts) and its use with the tag
 * word filter on the publish path.
 *
 * Run with:
 *   node --test src/lib/posts/caption-tags.test.ts
 *
 * NO LISTED TERM IS TYPED IN THIS FILE: positives are built from
 * `filterTerms()`; failure messages name a list index, never a term.
 * The resolve hook is the one from tags.test.ts (tags.ts has extensionless
 * relative imports).
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
  throw new Error("caption-tags.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { captionHashtags } = await import("./caption-tags");
const { firstBlockedTag, normalizePostTags } = await import("./tags");
const { checkText } = await import("../moderation/text-filter");
const { filterTerms } = await import("../moderation/text-filter-list");

test("every #tag in caption order, lower-case, no #, de-duplicated", () => {
  assert.deepEqual(captionHashtags("Hi #Foo and ##bar, #FOO again #baz_9!"), ["foo", "bar", "baz_9"]);
  assert.deepEqual(captionHashtags("#café #日本 #½"), ["café", "日本", "½"]);
  assert.deepEqual(captionHashtags("no tags here"), []);
  assert.deepEqual(captionHashtags("# alone and a#b"), ["b"]);
  for (const notString of [undefined, null, 7, ["#a"], { a: "#b" }]) {
    assert.deepEqual(captionHashtags(notString), []);
  }
});

test("no cap: the eleventh tag and a 40-character tag are still returned", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `#t${i}`).join(" ");
  assert.equal(captionHashtags(eleven).length, 11);
  assert.deepEqual(captionHashtags(`#${"x".repeat(40)}`), ["x".repeat(40)]);
});

test("publish path: an underscore-glued listed term in the caption is refused", () => {
  let gapShown = 0;
  filterTerms().forEach(({ term }, i) => {
    const t = term.replace(/ /g, "_");
    for (const caption of [`Party #${t}_lol tonight`, `#${"a".repeat(3)} x #café_${t}`]) {
      // Stored tags alone may miss it (non-ASCII, too long); the caption scan must not.
      const tags = normalizePostTags([]);
      assert.notEqual(firstBlockedTag([...tags, ...captionHashtags(caption)]), null, `term #${i}`);
      if (checkText(caption).ok) gapShown += 1;
    }
  });
  // The caption's own filter really does miss some of these (why this exists).
  assert.ok(gapShown > 0, "checkText caught every glued term; the gap this closes is gone");
});

test("ordinary captions pass", () => {
  const caption = "Welcome week! #campus_life #iu_2026 #class_of_2027 #assessment #scunthorpe #café";
  assert.equal(firstBlockedTag(captionHashtags(caption)), null);
});
