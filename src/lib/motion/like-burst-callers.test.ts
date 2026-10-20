/**
 * Every `<LikeBurst>` passes `burst` (Oct 20, 2026): a counter the caller
 * bumps on the person's own like. Without it LikeBurst pops whenever `liked`
 * turns on, so a refused unlike that puts the heart back pops it too (and a
 * like on another screen sharing the record pops this one). The caller rule
 * is in LikeBurst.tsx; this keeps a new caller from forgetting it.
 *
 * Run with:
 *   node --test src/lib/motion/like-burst-callers.test.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../../../", import.meta.url);

test("every <LikeBurst> in the app passes a burst counter", () => {
  const files = execFileSync("git", ["grep", "-l", "<LikeBurst", "--", "src"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.ts"));
  assert.ok(files.length >= 3, `found ${files.length} callers`);
  const missing: string[] = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, ROOT), "utf8");
    for (const m of text.matchAll(/<LikeBurst\b[^>]*>/g)) {
      if (!/\bburst=\{/.test(m[0])) missing.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(missing, []);
});
