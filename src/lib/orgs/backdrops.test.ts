/**
 * The one list of club backgrounds (backdrops.ts, Oct 22, 2026): the ten
 * tuned gradients are exactly the ones measured in the settings map, in
 * picker order; the database keys are the ones its CHECK allows today; the
 * five new ones stay out of the pickers until their migration is on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./backdrops.ts";
const {
  BACKDROPS,
  DEFAULT_BACKDROP,
  NEW_BACKDROPS_LIVE,
  backdropCss,
  backdropFor,
  isPickableBackdrop,
  legacyChatWallpaper,
  LEGACY_CREAM_WALLPAPER,
  pickerBackdrops,
  storableBackdropKeys,
} = (await import(specifier)) as typeof import("./backdrops");

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

test("the ten are the measured ones, word for word, in picker order", () => {
  const doc = read("handoffs/2026-10-22-club-tools-arc/SETTINGS-MAP.md");
  const block = doc.slice(doc.indexOf("```", doc.indexOf("The 10 presets")) + 3);
  const fence = block.slice(0, block.indexOf("```"));
  const measured = [...fence.matchAll(/(\S+)\s+"([^"]+)"[^\n]*\n(radial-gradient[^\n]+)/g)].map((m) => ({
    key: m[1],
    label: m[2],
    css: m[3],
  }));
  assert.equal(measured.length, 10);
  assert.deepEqual(
    BACKDROPS.map((b) => ({ key: b.key, label: b.label, css: b.css })),
    measured,
  );
  assert.deepEqual(
    BACKDROPS.map((b) => b.label),
    ["Dusk", "Midnight", "Violet", "Rose", "Cardinal", "Ember", "Lantern", "Forest", "Canal", "Onyx"],
  );
});

test("the database keys today are the CHECK's six; the five new ones wait for their migration", () => {
  assert.equal(NEW_BACKDROPS_LIVE, false, "flip only in the deploy after 20261026100000 is on production");
  assert.deepEqual([...storableBackdropKeys(false)].sort(), ["cream", "deep-violet", "ember", "forest", "midnight", "sand-purple"]);
  assert.deepEqual(
    BACKDROPS.filter((b) => b.isNew).map((b) => b.key),
    ["rose", "cardinal", "lantern", "canal", "onyx"],
  );
  assert.equal(storableBackdropKeys(true).length, 11);
  assert.deepEqual(pickerBackdrops(false).map((b) => b.label), ["Dusk", "Midnight", "Violet", "Ember", "Forest"]);
  assert.equal(pickerBackdrops(true).length, 10);
});

test("what a route may save: an offered key only (never cream, never a new one before its migration)", () => {
  assert.equal(isPickableBackdrop("midnight", false), true);
  assert.equal(isPickableBackdrop("rose", false), false);
  assert.equal(isPickableBackdrop("rose", true), true);
  for (const junk of ["cream", "", "Midnight", "red", null, undefined, 3]) assert.equal(isPickableBackdrop(junk, true), false, String(junk));
});

test("what the page paints: any stored key; cream and unknowns paint the default", () => {
  assert.equal(DEFAULT_BACKDROP, "sand-purple");
  assert.equal(backdropFor("cream").key, "sand-purple");
  assert.equal(backdropFor("nonsense").key, "sand-purple");
  assert.equal(backdropFor(null).label, "Dusk");
  assert.equal(backdropCss("forest"), BACKDROPS.find((b) => b.key === "forest")!.css);
  for (const b of BACKDROPS) assert.ok(!/url\(|expression|;/.test(b.css), `${b.key}: gradients only`);
});

test("the old chat wallpaper keeps cream's light paper and paints everything else the same", () => {
  assert.equal(legacyChatWallpaper("cream"), LEGACY_CREAM_WALLPAPER);
  assert.equal(legacyChatWallpaper("ember"), backdropCss("ember"));
});
