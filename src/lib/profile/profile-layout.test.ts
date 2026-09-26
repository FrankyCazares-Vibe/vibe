/**
 * Tests for `profile-layout.ts` (S67 wave 2, contracts C3): the sanitizer
 * that stands between `users.profile_layout` and both profile surfaces.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/profile-layout.test.ts
 *
 * The module under test has zero imports, so it loads through a dynamic
 * import of its ".ts" path (the `join-copy.test.ts` pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./profile-layout.ts";
const { DEFAULT_PROFILE_LAYOUT, WIDGET_IDS, isDefaultLayout, sanitizeProfileLayout } = (await import(
  specifier
)) as typeof import("./profile-layout");

const DEFAULT_ORDER = ["bio", "experience", "skills", "posts", "resume", "working_on"];

test("the six ids in today's markup order, frozen; the default is that order, nothing hidden, bio in main", () => {
  assert.deepEqual([...WIDGET_IDS], DEFAULT_ORDER);
  assert.equal(Object.isFrozen(WIDGET_IDS), true);
  assert.deepEqual(DEFAULT_PROFILE_LAYOUT, { v: 1, order: DEFAULT_ORDER, hidden: [], bioSide: false });
  assert.equal(Object.isFrozen(DEFAULT_PROFILE_LAYOUT), true);
  assert.equal(Object.isFrozen(DEFAULT_PROFILE_LAYOUT.order), true);
  assert.equal(Object.isFrozen(DEFAULT_PROFILE_LAYOUT.hidden), true);
});

test("non-objects and arrays read as the default, with fresh arrays (not the frozen ones)", () => {
  for (const raw of [null, undefined, "bio", 7, true, ["bio"], () => {}]) {
    const l = sanitizeProfileLayout(raw);
    assert.deepEqual(l, DEFAULT_PROFILE_LAYOUT, `raw=${String(raw)}`);
    assert.notEqual(l.order, DEFAULT_PROFILE_LAYOUT.order);
    l.order.reverse(); // a caller may reorder in place; the constant must not move
    assert.deepEqual([...DEFAULT_PROFILE_LAYOUT.order], DEFAULT_ORDER);
  }
});

test("the column default '{}' is the default layout", () => {
  const l = sanitizeProfileLayout({});
  assert.deepEqual(l, DEFAULT_PROFILE_LAYOUT);
  assert.equal(isDefaultLayout(l), true);
});

test("order: unknown ids dropped, dupes collapsed, missing ids appended in default order", () => {
  assert.deepEqual(
    sanitizeProfileLayout({ order: ["posts", "calendar", "bio", 3, null, "posts", "resume"] }).order,
    ["posts", "bio", "resume", "experience", "skills", "working_on"],
  );
  assert.deepEqual(sanitizeProfileLayout({ order: ["skills", "skills"] }).order, [
    "skills",
    "bio",
    "experience",
    "posts",
    "resume",
    "working_on",
  ]);
  // Not an array: the default order.
  assert.deepEqual(sanitizeProfileLayout({ order: "bio,posts" }).order, DEFAULT_ORDER);
  assert.deepEqual(sanitizeProfileLayout({ order: { 0: "bio" } }).order, DEFAULT_ORDER);
});

test("hidden: known ids only, deduped, and never posts (it is the profile)", () => {
  assert.deepEqual(sanitizeProfileLayout({ hidden: ["posts", "bio", "nope", "bio", "resume"] }).hidden, [
    "bio",
    "resume",
  ]);
  assert.deepEqual(sanitizeProfileLayout({ hidden: ["posts"] }).hidden, []);
  assert.deepEqual(sanitizeProfileLayout({ hidden: "bio" }).hidden, []);
  // Every widget but posts can be hidden at once.
  assert.deepEqual(sanitizeProfileLayout({ hidden: [...DEFAULT_ORDER] }).hidden, [
    "bio",
    "experience",
    "skills",
    "resume",
    "working_on",
  ]);
});

test("bioSide is exactly `=== true`", () => {
  assert.equal(sanitizeProfileLayout({ bioSide: true }).bioSide, true);
  for (const v of [false, "true", 1, null, undefined, {}]) {
    assert.equal(sanitizeProfileLayout({ bioSide: v }).bioSide, false, `bioSide=${JSON.stringify(v)}`);
  }
});

test("a partial always comes out whole, v is always 1, unknown keys don't survive", () => {
  assert.deepEqual(sanitizeProfileLayout({ order: ["resume"] }), {
    v: 1,
    order: ["resume", "bio", "experience", "skills", "posts", "working_on"],
    hidden: [],
    bioSide: false,
  });
  assert.deepEqual(sanitizeProfileLayout({ hidden: ["skills"], bioSide: true }), {
    v: 1,
    order: DEFAULT_ORDER,
    hidden: ["skills"],
    bioSide: true,
  });
  assert.equal(sanitizeProfileLayout({ v: 2, order: ["bio"] }).v, 1);
  assert.equal(sanitizeProfileLayout({ v: "1" }).v, 1);
  assert.deepEqual(Object.keys(sanitizeProfileLayout({ extra: 1, order: [] })).sort(), [
    "bioSide",
    "hidden",
    "order",
    "v",
  ]);
});

test("sanitizing is idempotent", () => {
  const once = sanitizeProfileLayout({ order: ["posts", "x", "bio"], hidden: ["posts", "skills"], bioSide: true });
  assert.deepEqual(sanitizeProfileLayout(once), once);
});

test("isDefaultLayout: only the exact default", () => {
  assert.equal(isDefaultLayout(DEFAULT_PROFILE_LAYOUT), true);
  assert.equal(isDefaultLayout(sanitizeProfileLayout(undefined)), true);
  assert.equal(isDefaultLayout(sanitizeProfileLayout({ order: [...DEFAULT_ORDER], hidden: [], bioSide: false })), true);
  assert.equal(isDefaultLayout(sanitizeProfileLayout({ order: ["experience", "bio"] })), false);
  assert.equal(isDefaultLayout(sanitizeProfileLayout({ hidden: ["bio"] })), false);
  assert.equal(isDefaultLayout(sanitizeProfileLayout({ bioSide: true })), false);
  // Hiding posts is stripped, so this is still the default.
  assert.equal(isDefaultLayout(sanitizeProfileLayout({ hidden: ["posts"] })), true);
});
