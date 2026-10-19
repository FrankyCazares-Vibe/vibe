/**
 * Tests for `switch.ts`, the school calendars' off switch (CONTRACT.md
 * §3.7, §8). ON BY DEFAULT: unset means every calendar shows. Every class
 * of `SCHOOL_EVENTS_OFF` value (on words, off words, a list, unknown keys,
 * a typo), every class of the `app_settings` row's value, and the merge
 * (off if either says off).
 *
 * Run with:
 *   node --test src/lib/school-events/switch.test.ts
 *
 * WHY THE RESOLVE HOOK: the rolling-strip-view.test.ts pattern (switch.ts
 * only imports types, but every school-events test loads modules one way).
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("switch.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { SCHOOL_ON, SCHOOL_SOURCE_KEYS, mergeSchoolSwitch, parseSchoolOffEnv, parseSchoolOffSetting } = await import("./switch");

type Switch = { all: boolean; sources: ReadonlySet<string> };
/** A switch as plain data: [all, sorted keys]. */
const shape = (s: Switch) => [s.all, [...s.sources].sort()];
const ON = [false, []];
const ALL_OFF = [true, [...SCHOOL_SOURCE_KEYS].sort()];

test("the keys and the default", () => {
  assert.deepEqual(SCHOOL_SOURCE_KEYS, ["athletics", "iu-student-affairs", "iu-featured"]);
  assert.deepEqual(shape(SCHOOL_ON), ON);
});

test("env: unset and the on words leave every calendar on", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  for (const raw of [undefined, "", "  ", "false", "FALSE", "0", "no", "off", " Off "]) {
    assert.deepEqual(shape(parseSchoolOffEnv(raw)), ON, String(raw));
  }
  assert.equal(warn.mock.callCount(), 0);
});

test("env: the off words turn every calendar off", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  for (const raw of ["true", "TRUE", "1", "yes", "on", "*", "all", " All "]) {
    assert.deepEqual(shape(parseSchoolOffEnv(raw)), ALL_OFF, raw);
  }
  assert.equal(warn.mock.callCount(), 0);
});

test("env: a comma list turns those calendars off; unknown keys are ignored (one warning)", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(shape(parseSchoolOffEnv("athletics")), [false, ["athletics"]]);
  assert.deepEqual(shape(parseSchoolOffEnv(" Athletics , iu-featured ,")), [false, ["athletics", "iu-featured"]]);
  assert.equal(warn.mock.callCount(), 0);
  assert.deepEqual(shape(parseSchoolOffEnv("athletics,iu-featurd")), [false, ["athletics"]]);
  assert.deepEqual(shape(parseSchoolOffEnv("athletics,iu-featurd")), [false, ["athletics"]]);
  assert.equal(warn.mock.callCount(), 1);
  // Naming every calendar is all off.
  assert.deepEqual(shape(parseSchoolOffEnv("athletics,iu-student-affairs,iu-featured")), ALL_OFF);
  // An off word inside a list is all off.
  assert.deepEqual(shape(parseSchoolOffEnv("athletics,all")), ALL_OFF);
});

test("env: a typo turns every calendar off (a kill switch errs toward hiding), with one warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  for (const raw of ["ture", "athletcs", "disabled", "athletcs,iu-featurd"]) {
    assert.deepEqual(shape(parseSchoolOffEnv(raw)), ALL_OFF, raw);
  }
  parseSchoolOffEnv("ture");
  assert.equal(warn.mock.callCount(), 4);
  // Only commas and spaces name nothing: a typo too, never "on".
  for (const raw of [",", " , ", ",,"]) {
    assert.deepEqual(shape(parseSchoolOffEnv(raw)), ALL_OFF, JSON.stringify(raw));
  }
  // "," and " , " are the same value once trimmed: one warning between them.
  assert.equal(warn.mock.callCount(), 6);
});

test("setting: false, null and no row are on; true is all off", () => {
  assert.deepEqual(shape(parseSchoolOffSetting(undefined)), ON);
  assert.deepEqual(shape(parseSchoolOffSetting(null)), ON);
  assert.deepEqual(shape(parseSchoolOffSetting(false)), ON);
  assert.deepEqual(shape(parseSchoolOffSetting(true)), ALL_OFF);
});

test("setting: an array of keys turns those off, with the env list's rules", (t) => {
  t.mock.method(console, "warn", () => {});
  assert.deepEqual(shape(parseSchoolOffSetting(["athletics"])), [false, ["athletics"]]);
  assert.deepEqual(shape(parseSchoolOffSetting([" IU-Featured "])), [false, ["iu-featured"]]);
  assert.deepEqual(shape(parseSchoolOffSetting([])), ON);
  assert.deepEqual(shape(parseSchoolOffSetting(["athletics", "nope"])), [false, ["athletics"]]);
  assert.deepEqual(shape(parseSchoolOffSetting(["nope"])), ALL_OFF);
  assert.deepEqual(shape(parseSchoolOffSetting([...SCHOOL_SOURCE_KEYS])), ALL_OFF);
});

test("setting: anything else is all off", (t) => {
  t.mock.method(console, "warn", () => {});
  // [""] and ["  "] meant to name a calendar and didn't: hide (only [] names nothing on purpose).
  for (const value of ["true", "false", 1, 0, {}, { off: true }, ["athletics", 1], [null], [""], ["  "], ["", " "]]) {
    assert.deepEqual(shape(parseSchoolOffSetting(value)), ALL_OFF, JSON.stringify(value));
  }
});

test("merge: off if either says off", () => {
  const athletics = parseSchoolOffEnv("athletics");
  const featured = parseSchoolOffSetting(["iu-featured"]);
  assert.deepEqual(shape(mergeSchoolSwitch(SCHOOL_ON, SCHOOL_ON)), ON);
  assert.deepEqual(shape(mergeSchoolSwitch(athletics, SCHOOL_ON)), [false, ["athletics"]]);
  assert.deepEqual(shape(mergeSchoolSwitch(SCHOOL_ON, featured)), [false, ["iu-featured"]]);
  assert.deepEqual(shape(mergeSchoolSwitch(athletics, featured)), [false, ["athletics", "iu-featured"]]);
  assert.deepEqual(shape(mergeSchoolSwitch(athletics, athletics)), [false, ["athletics"]]);
  assert.deepEqual(shape(mergeSchoolSwitch(parseSchoolOffEnv("true"), SCHOOL_ON)), ALL_OFF);
  assert.deepEqual(shape(mergeSchoolSwitch(SCHOOL_ON, parseSchoolOffSetting(true))), ALL_OFF);
  // Between them every calendar is named: all off.
  const rest = parseSchoolOffSetting(["iu-student-affairs", "iu-featured"]);
  assert.deepEqual(shape(mergeSchoolSwitch(athletics, rest)), ALL_OFF);
});
