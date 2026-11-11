/**
 * Otto's look setting and the orb cleanup (Nov 10, 2026, the Otto build's
 * Wave 1, batch 1E), pinned as text: the two Otto routes use the one
 * settings module (no second allowlist to drift), the look sheet offers the
 * ten colours with names, Still / Living, the help line, and saves both ways
 * (account PATCH and this device), and globals.css keeps none of the old orb.
 *
 * Run with:
 *   node --test src/lib/otto/look-setting-pins.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// A URL import, so node loads the .ts file without a resolve hook.
const L = (await import(new URL("./look.ts", import.meta.url).href)) as typeof import("./look");

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

test("both Otto routes use src/lib/otto/settings.ts, with no copy of their own", () => {
  const patch = read("src/app/api/me/otto/settings/route.ts");
  assert.match(patch, /import \{ applySettingsPatch, sanitizePatch \} from "@\/lib\/otto\/settings";/);
  assert.doesNotMatch(patch, /function sanitizePatch|function sanitizePush|VALID_CHATTINESS/);

  const get = read("src/app/api/me/otto/route.ts");
  assert.match(get, /import \{ mergeSettings, type OttoSettings \} from "@\/lib\/otto\/settings";/);
  assert.match(get, /export type \{ OttoSettings \} from "@\/lib\/otto\/settings";/);
  assert.doesNotMatch(get, /function mergeSettings|const DEFAULT_SETTINGS/);
});

test("the look sheet names all ten colours, Still and Living, and the help line", () => {
  const src = read("src/components/otto/OttoLookSheet.tsx");
  const names = src.match(/OTTO_COLOUR_NAMES: Record<OttoColour, string> = \{([\s\S]*?)\};/)?.[1];
  assert.ok(names, "OTTO_COLOUR_NAMES is in OttoLookSheet.tsx");
  const pairs = [...names.matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(
    pairs.map((p) => p[0]),
    [...L.OTTO_COLOURS],
  );
  for (const [key, name] of pairs) assert.equal(name, key[0].toUpperCase() + key.slice(1));

  assert.match(src, /OTTO_MOTION_NAMES: Record<OttoMotion, string> = \{ still: "Still", living: "Living" \}/);
  assert.ok(
    src.includes(
      "Still keeps Otto from moving. Low Power Mode doesn't stop motion, so pick Still if you want him calm.",
    ),
  );
});

test("a pick repaints this device and saves the look to the account", () => {
  const src = read("src/components/otto/OttoLookSheet.tsx");
  assert.match(src, /setOttoLook\(next\)/);
  assert.match(src, /vibeRequest\("\/api\/me\/otto\/settings", \{\s*method: "PATCH",\s*json: \{ look \}/);
  // Swatches are real buttons at least 44 px, marked when chosen.
  assert.match(src, /minWidth: 44,\s*minHeight: 44/);
  assert.match(src, /aria-pressed=\{on\}/);
  // The reload holds while a save is in flight, in the sheet and in the row.
  assert.equal(src.split('data-holds-reload={saving ? "" : "false"}').length - 1, 2);
  const row = read("src/components/otto/OttoSettings.tsx");
  assert.match(row, /data-holds-reload=\{saving \? "" : "false"\}/);
  assert.match(row, /Otto&apos;s look/);
  // No coral in the sheet's controls: the only coral is Otto's moon.
  assert.doesNotMatch(src, /#ff5c35|--coral/i);
});

test("globals.css keeps none of the old orb, and keeps what is still used", () => {
  // Comments may name what was deleted; only rules count.
  const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const gone =
    /\.otto-orb-wrap|\.orb-(core|pulse|track)|@keyframes (vibe-orb-|otto-core-pulse|otto-orbit-spin|otto-breath|otto-synapse|vibe-landing-sun-wave)|\.vibe-landing-sun-(disc|halo|otto)/;
  assert.equal(css.match(gone)?.[0] ?? null, null);
  // OttoCorner's badge pop and the Otto room's eyebrow dot still run on these.
  assert.match(css, /@keyframes otto-orb-pop \{/);
  assert.match(css, /@keyframes vibe-landing-sun-breathe \{/);
  assert.match(css, /\.otto-room-section-eyebrow-dot \{[^}]*vibe-landing-sun-breathe/);
});

test("the computer dialog moves focus in once, so a pick keeps focus on its swatch", () => {
  const src = read("src/components/otto/OttoLookSheet.tsx");
  const dialog = src.slice(src.indexOf("function ComputerDialog"));
  assert.match(dialog, /onCloseRef\.current = onClose;/);
  assert.match(dialog, /panel\?\.focus\(\{ preventScroll: true \}\);[\s\S]*?document\.body\.style\.overflow = previousOverflow;\s*\};\s*\}, \[\]\);/);
  assert.doesNotMatch(dialog.slice(0, dialog.indexOf("createPortal")), /\}, \[onClose\]\);\s*\n\s*\/\/ Opened from a click/);
  // Every control in the sheet is at least 44px tall.
  assert.doesNotMatch(src, /minHeight: (?:[0-3]\d|4[0-3]),/);
});
