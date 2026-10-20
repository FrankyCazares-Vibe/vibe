/**
 * The repost line's words (Oct 19, 2026, critique M2): one name, two names,
 * "and N others" with B2's count rule, the viewer's own repost left out, a
 * missing name falling back to the @handle, and no line without a followed
 * reposter.
 *
 * Run with:
 *   node --test src/lib/feed/friend-repost-label.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

// The label imports "./compact-count" with no extension (what Next and tsc
// expect); Node's type stripping adds none. Same hook as tags.test.ts.
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("friend-repost-label.test.ts needs Node >= 22.15 (module.registerHooks)");
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./friend-repost-label.ts";
const { friendRepostLine, friendRepostText, repostFirstName } = (await import(specifier)) as typeof import("./friend-repost-label");

const MAYA = { name: "Maya Okafor", handle: "mayaokafor" };
const JONAH = { name: "Jonah Reyes", handle: "jonahreyes" };
const PRIYA = { name: "Priya", handle: "priya" };
const words = (reposters: unknown[], repostCount: number, viewerReposted = false) => {
  const line = friendRepostLine({ reposters: reposters as never, repostCount, viewerReposted });
  return line ? friendRepostText(line) : null;
};

test("one followed reposter, and nobody else: \"Maya reposted\"", () => {
  assert.equal(words([MAYA], 1), "Maya reposted");
});

test("two, when those two are the whole count: \"Maya and Jonah reposted\"", () => {
  assert.equal(words([MAYA, JONAH], 2), "Maya and Jonah reposted");
});

test("N: the post's repost count minus the person named (B2's rule)", () => {
  // 3 people you follow and 12 others: 15 in all.
  assert.equal(words([MAYA, JONAH, PRIYA], 15), "Maya and 14 others reposted");
  assert.equal(words([MAYA], 7), "Maya and 6 others reposted");
  // Two followed people plus one stranger is not "Maya and Jonah".
  assert.equal(words([MAYA, JONAH], 3), "Maya and 2 others reposted");
});

test("one other is singular", () => {
  assert.equal(words([MAYA], 2), "Maya and 1 other reposted");
});

test("the viewer's own repost is never one of the others", () => {
  assert.equal(words([MAYA], 2, true), "Maya reposted");
  assert.equal(words([MAYA, JONAH], 3, true), "Maya and Jonah reposted");
  assert.equal(words([MAYA], 8, true), "Maya and 6 others reposted");
});

test("a count behind the names never reads fewer people than were named", () => {
  assert.equal(words([MAYA, JONAH], 0), "Maya and Jonah reposted");
  assert.equal(words([MAYA, JONAH, PRIYA], 1), "Maya and 2 others reposted");
  assert.equal(words([MAYA], Number.NaN), "Maya reposted");
});

test("first names only; a missing name falls back to the @handle", () => {
  assert.equal(repostFirstName(MAYA), "Maya");
  assert.equal(repostFirstName({ name: "  ", handle: "noname_handle" }), "@noname_handle");
  assert.equal(repostFirstName({ name: null, handle: "@at" }), "@at");
  assert.equal(repostFirstName({ name: null, handle: null }), "Someone");
  assert.equal(words([{ name: null, handle: "jo" }, PRIYA], 2), "@jo and Priya reposted");
});

test("no followed reposter means no line at all", () => {
  assert.equal(friendRepostLine({ reposters: [], repostCount: 9, viewerReposted: false }), null);
  assert.equal(friendRepostLine({ reposters: undefined, repostCount: 9, viewerReposted: true }), null);
  assert.equal(friendRepostLine({ reposters: [null], repostCount: 9, viewerReposted: false }), null);
});

test("a big count prints the way the card's buttons print it (review r3)", () => {
  // 1,234 reposts: the desktop button reads "1.2K", so the line does too.
  assert.equal(words([MAYA], 1234), "Maya and 1.2K others reposted");
  assert.equal(words([MAYA], 999), "Maya and 998 others reposted");
});
