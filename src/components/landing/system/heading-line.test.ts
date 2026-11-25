/**
 * Tests for `heading-line.ts`: where a headline line's halftone sits for where the line is on screen (the heading
 * dots, Nov 24, 2026).
 *
 * Run with:
 *   node --test src/components/landing/system/heading-line.test.ts
 *
 * Node's type stripping needs the ".ts" on disk and tsc refuses a literal ".ts" import (TS5097), hence the variable
 * specifier.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./heading-line.ts";
const { lineAt, HOLD, DUST, STEP } = (await import(specifier)) as typeof import("./heading-line");

const FALL = 1.7;
// a 390 x 844 phone: a headline line is 46 px type, padded to 61.6 px; the hero's first line sits 474 px down
const PHONE = { vh: 844, h: 61.64 };
const at = (t: number, o: { vh: number; h: number }, hold = HOLD, hero = false, top0 = Infinity) => lineAt(t, o.vh, o.h, hold, hero, top0, FALL);

test("in the middle of the screen every line is at rest: solid, or the dotted pair's foot", () => {
  for (const t of [100, 281, 354, 563, 700]) {
    assert.equal(at(t, PHONE), HOLD);
    assert.equal(at(t, PHONE, 0), 0);
  }
});

test("on a phone it breaks from 67 px (where the drop takes off) and is dust 80 px later, as judged", () => {
  assert.equal(at(68, PHONE), HOLD);
  assert.ok(at(60, PHONE) < HOLD && at(60, PHONE) > DUST);
  assert.equal(at(-13, PHONE), DUST);
  // the break speeds up like the drop's fall: a quarter of the way in, it has gone less than a quarter of its way
  const quarter = at(67.38 - 20.02, PHONE);
  assert.ok((HOLD - quarter) / (HOLD - DUST) < 0.25);
});

test("arriving, it condenses between 97% and 89% of the screen", () => {
  assert.equal(at(844 * 0.985, PHONE), DUST);
  assert.equal(at(844 * 0.86, PHONE), HOLD);
  const mid = at(844 * 0.93, PHONE);
  assert.ok(mid > DUST && mid < HOLD);
});

test("on a tall screen the break starts no lower than 100 px, over at most 1.3 lines", () => {
  for (const vh of [1600, 1920, 2560, 3840]) {
    const o = { vh, h: 100 };
    assert.equal(at(101, o), HOLD, `${vh}: solid at 101 px`);
    assert.ok(at(99, o) < HOLD, `${vh}: breaking at 99 px`);
    assert.equal(at(100 - 130 - 0.5, o), DUST, `${vh}: dust 1.3 lines later`);
  }
});

test("the hero is never dust at first paint, on any screen, and breaks only once the reader scrolls", () => {
  for (const [vh, h, top0] of [[844, 61.6, 474], [900, 113.9, 228], [2560, 140, 260], [3840, 170, 300], [3840, 170, 90]]) {
    assert.equal(at(top0, { vh, h }, 0, true, top0), 0, `${vh}: the hero at rest at scroll 0`);
  }
  // a hero that starts above the break line breaks from its first pixel of scroll
  assert.ok(at(88, { vh: 3840, h: 170 }, 0, true, 90) < 0);
});

test("the hero only dissolves: at the bottom of the screen it is not dust", () => {
  assert.equal(at(800, PHONE, 0, true, 474), 0);
});

test("whole steps: every value lands on the halftone's repeat when rounded, and steps run in order", () => {
  let last = Infinity;
  for (let t = 120; t > -80; t -= 1) {
    const step = Math.round(at(t, PHONE) / STEP);
    assert.ok(step <= last, `steps never go back up while leaving (t ${t})`);
    last = step;
  }
  assert.equal(Math.round(HOLD / STEP), 7);
  assert.equal(Math.round(DUST / STEP), -11);
});
