/**
 * The desk's happy feedback (kit/motion.css, motion 1, Nov 12, 2026) keeps
 * the app's motion rules: keyframes move only transform and opacity, nothing
 * loops, every animated rule is switched off under reduced motion, and the
 * classes feedback.ts puts on rows are all here.
 *
 * Run with:
 *   node --test src/components/otto/kit/motion-css.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./motion.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const fx = readFileSync(new URL("../../../lib/motion/feedback.ts", import.meta.url), "utf8");

const reduced = (() => {
  const at = css.indexOf("@media (prefers-reduced-motion:reduce)");
  assert.ok(at >= 0, "a reduced-motion block");
  return css.slice(at);
})();
const main = css.slice(0, css.indexOf("@media (prefers-reduced-motion:reduce)"));

test("keyframes move only transform and opacity", () => {
  const frames = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)];
  assert.ok(frames.length >= 6);
  for (const [, name, body] of frames) {
    for (const p of body.matchAll(/([a-z-]+)\s*:/g)) assert.ok(p[1] === "transform" || p[1] === "opacity", `${name} animates ${p[1]}`);
  }
});

test("nothing loops, and reduced motion stops every animated rule", () => {
  assert.doesNotMatch(css, /infinite/);
  const body = main.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const animated = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /animation\s*:/.test(m[2]));
  assert.ok(animated.length >= 8);
  const off = reduced.match(/\{([^{}]*)\{animation:none\}/)?.[1] ?? "";
  for (const [, selector] of animated) {
    for (const one of selector.split(",")) {
      const s = one.trim();
      const covered = off.split(",").some((o) => o.trim() === s || (s.startsWith(".dk-done-now>") && o.trim() === ".dk-done-now>*"));
      assert.ok(covered, `${s} stops under reduced motion`);
    }
  }
});

test("every class feedback.ts sets is defined", () => {
  for (const cls of ["dk-enter", "dk-leave", "dk-pop", "dk-land", "dk-done-now", "dk-done-mark"]) {
    assert.match(fx, new RegExp(`"${cls}"`), `feedback.ts uses ${cls}`);
    assert.match(css, new RegExp(`\\.${cls}\\b`), `motion.css defines ${cls}`);
  }
});
