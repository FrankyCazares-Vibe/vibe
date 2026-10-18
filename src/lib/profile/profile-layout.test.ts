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
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./profile-layout.ts";
const { DEFAULT_PROFILE_LAYOUT, WIDGET_IDS, isDefaultLayout, keepStoredClubs, layoutSaveLacksClubs, sanitizeProfileLayout } =
  (await import(specifier)) as typeof import("./profile-layout");

const DEFAULT_ORDER = ["clubs", "bio", "experience", "skills", "posts", "resume", "working_on"];

test("the seven ids, clubs first then today's markup order, frozen; the default is that order, nothing hidden, bio in main", () => {
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

test("order: unknown ids dropped, dupes collapsed, a missing clubs leads, other missing ids appended in default order", () => {
  assert.deepEqual(
    sanitizeProfileLayout({ order: ["posts", "calendar", "bio", 3, null, "posts", "resume"] }).order,
    ["clubs", "posts", "bio", "resume", "experience", "skills", "working_on"],
  );
  assert.deepEqual(sanitizeProfileLayout({ order: ["skills", "skills"] }).order, [
    "clubs",
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
    "clubs",
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
    order: ["clubs", "resume", "bio", "experience", "skills", "posts", "working_on"],
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

test("clubs (Oct 18 2026): every layout saved before it still reads whole, with clubs first", () => {
  // What every stored document looked like: the six ids, maybe hidden ones.
  const OLD_DEFAULT = ["bio", "experience", "skills", "posts", "resume", "working_on"];
  const old = sanitizeProfileLayout({ v: 1, order: OLD_DEFAULT, hidden: [], bioSide: false });
  assert.deepEqual(old.order, DEFAULT_ORDER);
  assert.equal(isDefaultLayout(old), true, "an untouched old layout is still the default");
  const moved = sanitizeProfileLayout({
    v: 1,
    order: ["posts", "working_on", "bio", "resume", "skills", "experience"],
    hidden: ["resume", "skills"],
    bioSide: true,
  });
  assert.deepEqual(moved, {
    v: 1,
    order: ["clubs", "posts", "working_on", "bio", "resume", "skills", "experience"],
    hidden: ["resume", "skills"],
    bioSide: true,
  });
  // Once saved with clubs somewhere, it stays there, hidden or not.
  const placed = sanitizeProfileLayout({ order: ["bio", "resume", "working_on", "clubs"], hidden: ["clubs"] });
  assert.deepEqual(placed.order, ["bio", "resume", "working_on", "clubs", "experience", "skills", "posts"]);
  assert.deepEqual(placed.hidden, ["clubs"]);
  assert.deepEqual(sanitizeProfileLayout(placed), placed);
});

test("a save from a build older than clubs keeps the stored Clubs slot and its eye", () => {
  const SIX = ["bio", "experience", "skills", "posts", "resume", "working_on"];
  // What the old sanitizer sends: no "clubs" anywhere.
  const incoming = { v: 1, order: SIX, hidden: ["skills"], bioSide: false };
  assert.equal(layoutSaveLacksClubs(incoming), true);
  assert.equal(layoutSaveLacksClubs({ order: [...SIX, "clubs"] }), false, "a new build's save is taken as sent");
  assert.equal(layoutSaveLacksClubs({ order: "x" }), true);
  assert.equal(layoutSaveLacksClubs(null), false, "not a document: the default, nothing to keep");
  assert.equal(layoutSaveLacksClubs(["clubs"]), false);

  // Stored hidden, second in Portfolio (after experience): stays hidden, stays there.
  const stored = { v: 1, order: ["bio", "experience", "clubs", "skills", "posts", "resume", "working_on"], hidden: ["clubs"], bioSide: false };
  const kept = keepStoredClubs(sanitizeProfileLayout(incoming), stored);
  assert.deepEqual(kept, {
    v: 1,
    order: ["bio", "experience", "clubs", "skills", "posts", "resume", "working_on"],
    hidden: ["skills", "clubs"],
    bioSide: false,
  });
  assert.deepEqual(sanitizeProfileLayout(kept), kept);
  // The old build moved experience to the end: Clubs still follows experience.
  const movedIn = { order: ["bio", "skills", "posts", "resume", "working_on", "experience"], hidden: [] };
  assert.deepEqual(keepStoredClubs(sanitizeProfileLayout(movedIn), stored).order, ["bio", "skills", "posts", "resume", "working_on", "experience", "clubs"]);
  // Stored first and shown, or nothing stored: first and shown.
  for (const prev of [{ order: DEFAULT_ORDER, hidden: [] }, null, undefined]) {
    const out = keepStoredClubs(sanitizeProfileLayout(incoming), prev);
    assert.deepEqual(out.order, DEFAULT_ORDER);
    assert.deepEqual(out.hidden, ["skills"]);
  }
});

test("both layout write routes keep the stored Clubs for an older build's save", () => {
  for (const file of ["../../app/api/me/profile/route.ts", "../../app/api/me/profile-sync/route.ts"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const at = src.indexOf('if ("profile_layout" in body) {');
    const block = src.slice(at, src.indexOf("patch.profile_layout = layout;", at));
    assert.ok(at > 0 && block.length > 0, `${file}: the layout write moved`);
    assert.match(block, /if \(layoutSaveLacksClubs\(body\.profile_layout\)\) \{/, file);
    assert.match(block, /\.select\("profile_layout"\)\s*\.eq\("id", user\.id\)/, file);
    assert.match(block, /layout = keepStoredClubs\(layout, /, file);
    assert.match(block, /if \(storedErr\) \{[\s\S]*?status: 500/, `${file}: an unreadable row must fail the save, not un-hide Clubs`);
  }
});
