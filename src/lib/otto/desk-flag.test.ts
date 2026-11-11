/**
 * The desk's off switch (desk-flag.ts): on by default, `OTTO_DESK=off` turns
 * it off, nothing else does.
 *
 * Run with:
 *   node --test src/lib/otto/desk-flag.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const F = (await import(new URL("./desk-flag.ts", import.meta.url).href)) as typeof import("./desk-flag");

test("on by default: no variable, empty, or anything but off", () => {
  assert.equal(F.ottoDeskOn({}), true);
  for (const v of ["", "on", "true", "1", "0", "false", "of", "offf", "no"]) {
    assert.equal(F.ottoDeskOn({ OTTO_DESK: v }), true, `OTTO_DESK=${JSON.stringify(v)}`);
  }
});

test("OTTO_DESK=off turns it off, trimmed and in any case", () => {
  for (const v of ["off", "OFF", " Off ", "off\n"]) {
    assert.equal(F.ottoDeskOn({ OTTO_DESK: v }), false, `OTTO_DESK=${JSON.stringify(v)}`);
  }
});

test("other switches don't touch it", () => {
  assert.equal(F.ottoDeskOn({ FIRST_LIGHT: "off", CHAT_V2_ENABLED: "false" }), true);
});

test("reads process.env when no env is passed", () => {
  const before = process.env.OTTO_DESK;
  try {
    process.env.OTTO_DESK = "off";
    assert.equal(F.ottoDeskOn(), false);
    delete process.env.OTTO_DESK;
    assert.equal(F.ottoDeskOn(), true);
  } finally {
    if (before === undefined) delete process.env.OTTO_DESK;
    else process.env.OTTO_DESK = before;
  }
});
