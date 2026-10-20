/**
 * Tests for `metrics-count.ts` (Oct 19, 2026, critique B9): the Otto stats
 * page said "1 comments" and "1 saves". These pin the singulars, the short
 * form a tile shows, and the exact form a screen reader hears.
 *
 * Run with:
 *   node --test src/components/otto/metrics-count.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the extension and tsc refuses it in a static
// import, so the module is loaded through a variable (as avatar.test.ts does).
const specifier = "./metrics-count.ts";
const { countWithNoun, fmtCount, pluralNoun, spokenCount } = (await import(
  specifier
)) as typeof import("./metrics-count");

test("exactly one takes the singular; zero and many take the plural", () => {
  assert.equal(pluralNoun(1, "comment"), "comment");
  assert.equal(pluralNoun(0, "comment"), "comments");
  assert.equal(pluralNoun(2, "comment"), "comments");
  assert.equal(pluralNoun(1000, "like"), "likes");
});

test("an irregular plural can be given", () => {
  assert.equal(pluralNoun(1, "person", "people"), "person");
  assert.equal(pluralNoun(3, "person", "people"), "people");
});

test("the page's own nouns read right at 1 (the reported bug)", () => {
  assert.equal(countWithNoun(1, "comment"), "1 comment");
  assert.equal(countWithNoun(1, "like"), "1 like");
  assert.equal(countWithNoun(1, "save"), "1 save");
  assert.equal(countWithNoun(1, "repost"), "1 repost");
  assert.equal(countWithNoun(1, "post"), "1 post");
  assert.equal(countWithNoun(0, "save"), "0 saves");
  assert.equal(countWithNoun(6, "post"), "6 posts");
});

test("the short form is unchanged from the old fmt()", () => {
  assert.equal(fmtCount(0), "0");
  assert.equal(fmtCount(999), "999");
  assert.equal(fmtCount(1000), "1k");
  assert.equal(fmtCount(1234), "1.2k");
  assert.equal(fmtCount(9999), "10k");
  assert.equal(fmtCount(12345), "12k");
  assert.equal(countWithNoun(1234, "view"), "1.2k views");
});

test("a short form fits its 44px count cell: never more than 4 characters", () => {
  // 13px icon + 4px gap leaves 27px, about 4 tabular digits at 12px.
  // 999_500 used to round to "1000k" (Oct 19 review): it must be "1M".
  for (const n of [
    0, 7, 99, 999, 1000, 1049, 1050, 9949, 9950, 9999, 10000, 99_499, 999_499, 999_500,
    999_999, 1_000_000, 1_049_999, 9_949_999, 9_950_000, 99_499_999, 99_500_000, 999_499_999,
  ]) {
    assert.ok(fmtCount(n).length <= 4, `${n} -> ${fmtCount(n)}`);
  }
});

test("a million and up switches to M instead of 1000k", () => {
  assert.equal(fmtCount(999_499), "999k");
  assert.equal(fmtCount(999_500), "1M");
  assert.equal(fmtCount(999_999), "1M");
  assert.equal(fmtCount(1_000_000), "1M");
  assert.equal(fmtCount(1_250_000), "1.3M");
  assert.equal(fmtCount(9_949_999), "9.9M");
  assert.equal(fmtCount(9_950_000), "10M");
  assert.equal(fmtCount(12_345_678), "12M");
});

test("a screen reader hears the exact number, not the short form", () => {
  assert.equal(spokenCount(7, "view"), "7 views");
  assert.equal(spokenCount(1, "comment"), "1 comment");
  assert.equal(spokenCount(1234, "view"), "1,234 views");
});
