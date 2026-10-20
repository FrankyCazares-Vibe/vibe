/**
 * Drift test for `engagement-icons.tsx` (Oct 19, 2026, critique B9).
 *
 * The shared icons are copies of campus-home.tsx's private ones, and
 * campus-home keeps its copies until a later clean-up. Until then a post's
 * counts must look the same on the feed and on Otto's stats page, so this
 * reads BOTH source files and compares each icon's drawing: the viewBox and
 * every path `d`, circle and stroke width. Change one and this fails until
 * the other moves too.
 *
 * Oct 19, 2026 review: once campus-home imports an icon from the shared file
 * instead of keeping a copy, that icon's drift check skips itself (nothing
 * left to drift), rather than failing with "EyeIcon not found". Whoever
 * removes the last copy can delete the per-icon block; the aria-hidden /
 * currentColor test and the no-emoji test stay.
 *
 * Run with:
 *   node --test src/components/icons/engagement-icons.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../../", import.meta.url);
const SHARED = await readFile(new URL("src/components/icons/engagement-icons.tsx", ROOT), "utf8");
const CAMPUS = await readFile(new URL("src/app/campus/campus-home.tsx", ROOT), "utf8");

const ICONS = ["EyeIcon", "LikeIcon", "CommentIcon", "RepostIcon", "BookmarkIcon"] as const;

/** The source of `function Name(...) { ... }`, up to the next top-level function. */
function body(src: string, name: string): string {
  const start = src.search(new RegExp(`(^|\\n)(export )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} not found`);
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(export )?(async )?function /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** What the icon draws, ignoring how its size and props are spelled. */
function drawing(src: string, name: string) {
  const b = body(src, name);
  return {
    viewBox: [...b.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]),
    paths: [...b.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]),
    circles: [...b.matchAll(/<circle ([^/]+)\/>/g)].map((m) => m[1].trim()),
    strokeWidths: [...b.matchAll(/strokeWidth="([^"]+)"/g)].map((m) => m[1]),
  };
}

/** True when campus-home has no copy of `name` and takes it from the shared file. */
function campusUsesShared(name: string): boolean {
  const hasCopy = new RegExp(`(^|\\n)(export )?function ${name}\\(`).test(CAMPUS);
  const imports = /from "@\/components\/icons\/engagement-icons"/.test(CAMPUS);
  return !hasCopy && imports;
}

for (const name of ICONS) {
  const skip = campusUsesShared(name) ? "campus-home imports the shared icon; no copy to drift" : false;
  test(`${name} draws the same as campus-home's copy`, { skip }, () => {
    const shared = drawing(SHARED, name);
    const campus = drawing(CAMPUS, name);
    assert.ok(shared.paths.length > 0, `${name} has no path in the shared file`);
    assert.deepEqual(shared, campus);
  });
}

test("every shared icon is decorative and draws in currentColor", () => {
  for (const name of ICONS) {
    const b = body(SHARED, name);
    assert.match(b, /aria-hidden/, `${name} must be aria-hidden`);
    assert.doesNotMatch(b, /#[0-9a-fA-F]{3,8}\b/, `${name} must not hard-code a colour`);
  }
});

test("the Otto stats page uses the shared icons, not emoji", async () => {
  const otto = await readFile(new URL("src/components/otto/OttoMetrics.tsx", ROOT), "utf8");
  assert.match(otto, /from "@\/components\/icons\/engagement-icons"/);
  // The four emoji the old count string used.
  for (const glyph of ["❤", "\u{1F4AC}", "↻", "\u{1F516}"]) {
    assert.ok(!otto.includes(glyph), `OttoMetrics.tsx still prints ${glyph}`);
  }
});
