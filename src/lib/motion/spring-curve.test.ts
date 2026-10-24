/**
 * The CSS press spring (globals.css `--vibe-spring-snappy`) is SPRING_SNAPPY
 * sampled over 320ms, so a press springs back the way the JS taps and the
 * tab pill do (Oct 18, 2026). On a drift the failure prints the right curve.
 *
 * The resolve hook is the same as in `mobile-tab-active.test.ts`.
 *
 * Run with:
 *   node --test src/lib/motion/spring-curve.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("spring-curve.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { springLinear, springProgress } = await import("./spring-curve");
const { SPRING_SNAPPY } = await import("./springs");

test("the CSS press curve is SPRING_SNAPPY over 320ms", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const found = css.match(/--vibe-spring-snappy:\s*(linear\([^;]*\));/)?.[1] ?? null;
  assert.equal(found, springLinear(SPRING_SNAPPY, 320));
  assert.match(css, /transition: transform 320ms var\(--vibe-spring-snappy\)/);
});

test("SPRING_SNAPPY has settled by 320ms, with no visible overshoot", () => {
  assert.ok(Math.abs(springProgress(SPRING_SNAPPY, 0.32) - 1) < 0.005);
  for (let ms = 0; ms <= 320; ms += 4) {
    assert.ok(springProgress(SPRING_SNAPPY, ms / 1000) < 1.005, `${ms}ms`);
  }
});

test("the computer onboarding's fold curve is SPRING_SOFT over 480ms", async () => {
  const { SPRING_SOFT } = await import("./springs");
  const page = readFileSync(new URL("../../../public/html/onboarding.html", import.meta.url), "utf8");
  const found = page.match(/--onb-spring-soft:\s*(linear\([^;]*\));/)?.[1] ?? null;
  assert.equal(found, springLinear(SPRING_SOFT, 480));
  assert.match(page, /animation: pf-more-in 480ms var\(--onb-spring-soft\)/);
  assert.ok(Math.abs(springProgress(SPRING_SOFT, 0.48) - 1) < 0.005);
});

test("first light's burst curves are SPRING_POP over 600ms and SPRING_SOFT over 480ms", async () => {
  const { SPRING_POP, SPRING_SOFT } = await import("./springs");
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.equal(css.match(/--vibe-spring-pop:\s*(linear\([^;]*\));/)?.[1] ?? null, springLinear(SPRING_POP, 600));
  assert.equal(css.match(/--vibe-spring-soft:\s*(linear\([^;]*\));/)?.[1] ?? null, springLinear(SPRING_SOFT, 480));
  assert.match(css, /first-light-pop 600ms var\(--vibe-spring-pop\)/);
  assert.match(css, /first-light-fade 480ms var\(--vibe-spring-soft\)/);
  // POP has settled by 600ms (one overshoot, then still).
  assert.ok(Math.abs(springProgress(SPRING_POP, 0.6) - 1) < 0.005);
});

test("the tour engine moves on the app's springs, transform and opacity only", async () => {
  const { SPRING_SOFT } = await import("./springs");
  const js = readFileSync(new URL("../../../public/html/_otto-tour.js", import.meta.url), "utf8");
  assert.ok(js.includes(`--otto-tour-soft: ${springLinear(SPRING_SOFT, 480)};`), "SPRING_SOFT over 480ms");
  assert.ok(js.includes(`--otto-tour-snappy: ${springLinear(SPRING_SNAPPY, 320)};`), "SPRING_SNAPPY over 320ms");
  assert.match(js, /transition: opacity 480ms var\(--otto-tour-soft\), transform 480ms var\(--otto-tour-soft\);/);
  assert.match(js, /transition: transform 320ms var\(--otto-tour-snappy\);/);
  // No fixed timings left, and nothing but transform or opacity animates.
  assert.doesNotMatch(js, /\d+ms (ease|cubic-bezier)/);
  for (const m of js.matchAll(/transition: ([^;']+);/g)) {
    for (const part of m[1].split(",")) {
      const prop = part.trim().split(/\s+/)[0];
      assert.ok(prop === "none" || prop === "opacity" || prop === "transform", `transitions ${prop}`);
    }
  }
  // Reduced motion: no rise, no hover lift.
  assert.match(js, /\.otto-tour-next:hover \{ transform: none; \}/);
});
