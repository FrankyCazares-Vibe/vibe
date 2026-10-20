/**
 * The feed's one count format (Oct 19, 2026, critique B1 review r3).
 *
 * Run with:
 *   node --test src/lib/feed/compact-count.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./compact-count.ts";
const { compactCount } = (await import(specifier)) as typeof import("./compact-count");

test("under 1,000 is the plain number", () => {
  assert.equal(compactCount(0), "0");
  assert.equal(compactCount(7), "7");
  assert.equal(compactCount(999), "999");
});

test("thousands and millions are short, with one decimal under 10K and 10M", () => {
  assert.equal(compactCount(1000), "1K");
  assert.equal(compactCount(1233), "1.2K");
  assert.equal(compactCount(1234), "1.2K");
  assert.equal(compactCount(9999), "10K");
  assert.equal(compactCount(12_345), "12K");
  assert.equal(compactCount(999_499), "999K");
  assert.equal(compactCount(999_999), "1M");
  assert.equal(compactCount(1_250_000), "1.3M");
});

test("junk reads as 0, never NaN or a minus sign", () => {
  assert.equal(compactCount(Number.NaN), "0");
  assert.equal(compactCount(-4), "0");
  assert.equal(compactCount(undefined), "0");
  assert.equal(compactCount(2.7), "2");
});
