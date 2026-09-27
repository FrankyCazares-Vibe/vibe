/**
 * Tests for `appearance-card-view.ts`, the pure logic behind the Settings
 * "How Vibe looks" card (S67 wave 3, contracts C4): the option order, the
 * status line, the keyboard rule, what a PATCH answer confirms, and the
 * account-wins mount rule with its Back/Forward stale-render guard.
 *
 * Run with:
 *   node --test src/components/settings/appearance-card-view.test.ts
 *
 * The module under test has zero imports, so it loads through a dynamic
 * import of its ".ts" path (the `profile-layout.test.ts` pattern). So does
 * src/lib/theme/theme.ts, which the last test holds this file against.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./appearance-card-view.ts";
const V = (await import(specifier)) as typeof import("./appearance-card-view");
const themeSpecifier = "../../lib/theme/theme.ts";
const T = (await import(themeSpecifier)) as typeof import("../../lib/theme/theme");

test("the tiles read Auto / Light / Night in that order, over the code enum system / light / dark", () => {
  assert.deepEqual(
    V.THEME_OPTIONS.map((o) => [o.pref, o.label, o.sub]),
    [
      ["system", "Auto", "follows your phone"],
      ["light", "Light", "always cream"],
      ["dark", "Night", "always dark"],
    ],
  );
  assert.equal(Object.isFrozen(V.THEME_OPTIONS), true);
  // "Night" is a word on screen, never a stored value.
  for (const o of V.THEME_OPTIONS) assert.notEqual(o.pref, "night");
});

test("sanitizeThemePref keeps the three words and drops everything else", () => {
  assert.equal(V.sanitizeThemePref("light"), "light");
  assert.equal(V.sanitizeThemePref("dark"), "dark");
  assert.equal(V.sanitizeThemePref("system"), "system");
  for (const bad of ["night", "Auto", "", null, undefined, 1, {}, ["dark"], true]) {
    assert.equal(V.sanitizeThemePref(bad), null, `raw ${JSON.stringify(bad)}`);
  }
});

test("themeFromSettings reads the saved blob; a noop answer (settings: null) confirms nothing", () => {
  assert.equal(V.themeFromSettings({ theme: "dark", chattiness: "quiet" }), "dark");
  assert.equal(V.themeFromSettings({ theme: "system" }), "system");
  assert.equal(V.themeFromSettings(null), null);
  assert.equal(V.themeFromSettings(undefined), null);
  assert.equal(V.themeFromSettings({}), null);
  assert.equal(V.themeFromSettings({ theme: "blue" }), null);
  assert.equal(V.themeFromSettings([{ theme: "dark" }]), null);
  assert.equal(V.themeFromSettings("dark"), null);
});

test("resolvedFor: Auto follows the phone, Light and Night don't", () => {
  assert.equal(V.resolvedFor("system", true), "dark");
  assert.equal(V.resolvedFor("system", false), "light");
  assert.equal(V.resolvedFor("light", true), "light");
  assert.equal(V.resolvedFor("dark", false), "dark");
});

test("themeLabel gives the product word", () => {
  assert.equal(V.themeLabel("system"), "Auto");
  assert.equal(V.themeLabel("light"), "Light");
  assert.equal(V.themeLabel("dark"), "Night");
});

test("the status line says what paints and why", () => {
  assert.equal(
    V.statusLine("system", true),
    "Right now: Night, because your phone is in dark mode.",
  );
  assert.equal(
    V.statusLine("system", false),
    "Right now: Light, because your phone is in light mode.",
  );
  assert.equal(V.statusLine("dark", false), "Right now: Night, because you picked it.");
  assert.equal(V.statusLine("light", true), "Right now: Light, because you picked it.");
  // The card bolds the word: the pieces put back together are the line.
  assert.deepEqual(V.statusParts("system", true), {
    lead: "Right now: ",
    word: "Night",
    reason: ", because your phone is in dark mode.",
  });
  assert.equal(V.statusParts("light", true).word, "Light");
  // The stored words never leak into copy: no "system", and "dark" only as the phone's mode.
  for (const pref of ["system", "light", "dark"] as const) {
    for (const dark of [true, false]) {
      const line = V.statusLine(pref, dark);
      assert.doesNotMatch(line, /system/i);
      assert.doesNotMatch(line.replace(/(dark|light) mode/g, ""), /\bdark\b/);
    }
  }
});

test("nextPref: arrows move and wrap in tile order, Home/End jump, other keys are the browser's", () => {
  assert.equal(V.nextPref("system", "ArrowRight"), "light");
  assert.equal(V.nextPref("light", "ArrowRight"), "dark");
  assert.equal(V.nextPref("dark", "ArrowRight"), "system");
  assert.equal(V.nextPref("system", "ArrowLeft"), "dark");
  assert.equal(V.nextPref("dark", "ArrowLeft"), "light");
  assert.equal(V.nextPref("light", "ArrowDown"), "dark");
  assert.equal(V.nextPref("light", "ArrowUp"), "system");
  assert.equal(V.nextPref("dark", "Home"), "system");
  assert.equal(V.nextPref("system", "End"), "dark");
  assert.equal(V.nextPref("system", "Enter"), null);
  assert.equal(V.nextPref("system", "Tab"), null);
  assert.equal(V.nextPref("system", " "), null);
});

test("mountSync: the account wins on a new device; a failed read never overwrites the device", () => {
  // Same value both places: show it, nothing to mirror.
  assert.deepEqual(V.mountSync("dark", "dark", "light"), { show: "dark", mirror: null, stamp: null });
  // New device (no key yet) or a device that disagrees: the account's value goes into the key.
  assert.deepEqual(V.mountSync("dark", null, "light"), { show: "dark", mirror: "dark", stamp: null });
  assert.deepEqual(V.mountSync("system", "light", "light"), { show: "system", mirror: "system", stamp: null });
  // The account holds the default and the device chose Night elsewhere: the account still wins.
  assert.deepEqual(V.mountSync("light", "dark", "light"), { show: "light", mirror: "light", stamp: null });
  // Profile read failed: keep the device's choice, else the default; never write.
  assert.deepEqual(V.mountSync(null, "dark", "light"), { show: "dark", mirror: null, stamp: null });
  assert.deepEqual(V.mountSync(null, null, "light"), { show: "light", mirror: null, stamp: null });
});

test("mountSync: a render from before this device's last pick (Back/Forward) never overwrites it", () => {
  // Settings rendered at 1000 with Light; the device picked Night, saved at 2000; Back reuses the 1000 render.
  assert.deepEqual(V.mountSync("light", "dark", "light", 1000, 2000), { show: "dark", mirror: null, stamp: null });
  // Same instant counts as stale: the render's read can't be proven to have seen the save.
  assert.deepEqual(V.mountSync("light", "dark", "light", 2000, 2000), { show: "dark", mirror: null, stamp: null });
  // A fresh render after the save (another device changed it since): the account wins again,
  // and the device records that it matches the account as of that render.
  assert.deepEqual(V.mountSync("light", "dark", "light", 3000, 2000), { show: "light", mirror: "light", stamp: 3000 });
  // Agreeing counts too: nothing to mirror, but the device is current as of the render.
  assert.deepEqual(V.mountSync("dark", "dark", "light", 3000, 2000), { show: "dark", mirror: null, stamp: 3000 });
  // No stamp on this device (a new phone, or a pick made before stamps existed): the account wins.
  assert.deepEqual(V.mountSync("light", "dark", "light", 1000, null), { show: "light", mirror: "light", stamp: 1000 });
  // A stamp but no device value (storage cleared around it): nothing to protect, the account wins.
  assert.deepEqual(V.mountSync("dark", null, "light", 1000, 2000), { show: "dark", mirror: "dark", stamp: 1000 });
  // A failed read still writes nothing, whatever the stamps say.
  assert.deepEqual(V.mountSync(null, "dark", "light", 3000, 2000), { show: "dark", mirror: null, stamp: null });
});

test("mountSync: after a mirror, an even older render reused on Back doesn't undo it", () => {
  // Picked Night here (saved 2000); another device picked Light (4000); a fresh render at 5000 mirrors Light.
  const fresh = V.mountSync("light", "dark", "light", 5000, 2000);
  assert.deepEqual(fresh, { show: "light", mirror: "light", stamp: 5000 });
  // Back to a Settings render from 3000 (still Night on the account then): the device's Light stays.
  assert.deepEqual(V.mountSync("dark", "light", "light", 3000, fresh.stamp), { show: "light", mirror: null, stamp: null });
});

test("sanitizeStamp keeps positive finite milliseconds, from storage's strings or a JSON number", () => {
  assert.equal(V.sanitizeStamp("1790000000000"), 1790000000000);
  assert.equal(V.sanitizeStamp(1790000000000), 1790000000000);
  for (const bad of [null, undefined, "", " ", "abc", "0", 0, -5, "Infinity", Number.NaN, {}, [1], true]) {
    assert.equal(V.sanitizeStamp(bad), null, `raw ${String(bad)}`);
  }
  assert.equal(V.THEME_SAVED_AT_KEY, "vibe_theme_at");
});

test("COPY is the approved canvas wording", () => {
  assert.equal(
    V.COPY.intro,
    "Auto follows your phone. Your choice is saved to your account, so it carries to your other devices.",
  );
  assert.equal(V.COPY.group, "How Vibe looks");
  assert.match(V.COPY.saveFailure, /^Couldn't /);
});

test("the card's rules agree with theme.ts: the same three words, the same resolve rule", () => {
  assert.deepEqual(
    V.THEME_OPTIONS.map((o) => o.pref).sort(),
    [...T.THEME_PREFS].sort(),
  );
  for (const pref of T.THEME_PREFS) {
    for (const dark of [true, false]) {
      assert.equal(V.resolvedFor(pref, dark), T.resolveTheme(pref, dark), `${pref} dark=${dark}`);
    }
  }
  for (const raw of ["light", "dark", "system", "night", "", null, 3]) {
    assert.equal(V.sanitizeThemePref(raw) !== null, T.isThemePref(raw), `raw ${JSON.stringify(raw)}`);
  }
});
