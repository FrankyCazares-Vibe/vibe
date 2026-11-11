/**
 * The desk kit's CSS (sky.css + desk.css, Nov 10, 2026, the Otto build's
 * Wave 2A) keeps the board's rules: the sky, its textures and the hills are
 * still (no keyframes at all; a press may scale a button), the app's
 * Light/Night selectors instead of the board's, the board's tokens mapped to
 * the app's, the kit's own tokens prefixed --otto-, all ten skies in both
 * looks ending in a warm horizon, the orbit ring with no traveller, one coral
 * fill (the verb button), and the parts the brief leaves out stay out.
 *
 * Run with:
 *   node --test src/components/otto/kit/sky-css.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const sky = strip(read("./sky.css"));
const desk = strip(read("./desk.css"));
const both = sky + "\n" + desk;

const COLOURS = ["dusk", "midnight", "violet", "rose", "cardinal", "ember", "lantern", "forest", "canal", "onyx"];

/** Every plain rule as [selector, declarations], @media wrappers flattened. */
function rules(source: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].replace(/@media[^{]*$/, "").trim();
    if (selector) out.push([selector, m[2]]);
  }
  return out;
}

test("nothing loops: no keyframes, no animation; transitions move only transform", () => {
  assert.doesNotMatch(both, /@keyframes/);
  assert.doesNotMatch(both, /animation\s*:/);
  assert.doesNotMatch(sky, /transition\s*:/, "the sky has no transitions at all");
  for (const m of desk.matchAll(/transition\s*:\s*([^;}]+)/g)) {
    if (m[1].trim() === "none") continue;
    assert.match(m[1].trim(), /^transform\s/, m[1]);
  }
  assert.match(desk, /@media \(prefers-reduced-motion:reduce\)\{\.dk-btn\{transition:none\}/);
});

test("the app's theme selectors, never the board's; every Night rule also covers the night island", () => {
  assert.doesNotMatch(both, /\.th-light|\.th-night|\.o-board|\.o-still/);
  for (const [selector] of rules(both)) {
    if (!selector.includes('[data-theme="dark"]')) continue;
    const dark = selector.split(/,(?![^(]*\))/).map((s) => s.trim());
    for (const one of dark.filter((s) => s.startsWith(':root[data-theme="dark"]'))) {
      const island = one.replace(':root[data-theme="dark"]', ".vibe-night-island");
      assert.ok(dark.includes(island), `${one} has its .vibe-night-island twin`);
    }
  }
});

test("board tokens are mapped to the app's; the kit's own start --otto-; --muted is never touched", () => {
  assert.doesNotMatch(both, /var\(--(page|ink|muted|line|line-2|tag|shadow|raise|ok|ok-bg|err|paper-2|think|glass-2)\b(?![-\w])/);
  assert.doesNotMatch(both, /--muted\s*:/);
  for (const m of both.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) {
    assert.match(m[1], /^--(otto-|m-surface$)/, `${m[1]} is a kit token`);
  }
});

test("all ten skies, Light and Night, each ending in a warm horizon", () => {
  const warm = (gradient: string) => {
    const hexes = [...gradient.matchAll(/#([0-9A-F]{6})/gi)].map((h) => h[1]);
    const last = hexes[hexes.length - 1];
    const [r, , b] = [0, 2, 4].map((i) => parseInt(last.slice(i, i + 2), 16));
    return r > b;
  };
  for (const c of COLOURS) {
    const light = sky.match(new RegExp(`\\n\\.sky-${c}\\{--otto-sky:([^}]+)\\}`));
    const night = sky.match(
      new RegExp(`:root\\[data-theme="dark"\\] \\.sky-${c},\\.vibe-night-island \\.sky-${c}\\{--otto-sky:([^}]+)\\}`),
    );
    assert.ok(light, `Light sky-${c}`);
    assert.ok(night, `Night sky-${c}`);
    assert.ok(warm(light[1]), `Light sky-${c} ends warm`);
    assert.ok(warm(night[1]), `Night sky-${c} ends warm`);
  }
});

test("the orbit ring has no traveller, and the stars hold still", () => {
  assert.doesNotMatch(sky, /\.tx-orbit::after/);
  assert.doesNotMatch(sky, /\.live\b/);
});

test("only the hills from ground.css; only the brief's parts in desk.css", () => {
  assert.match(sky, /\.gr-hills\{--otto-gr-far:url\(/);
  assert.doesNotMatch(sky, /\.gr-(mountains|forest|corn|flowers|farm|glow)/);
  assert.doesNotMatch(both, /\.dk-(undo|steps|me|otto|sky-roof|glass|phone)\b/);
  for (const part of ["dk-sky", "dk-sky-orbit", "dk-sky-say"]) assert.match(sky, new RegExp(`\\.${part}\\{`));
  for (const part of ["dk-sec", "dk-card", "dk-draft", "dk-row", "dk-done", "dk-stamp", "dk-empty", "dk-ask", "dk-btn"]) {
    assert.match(desk, new RegExp(`\\.${part}[{,]`), part);
  }
});

test("one coral fill: only the verb button", () => {
  const coral = rules(desk).filter(([, decl]) => /var\(--coral\)/.test(decl));
  assert.deepEqual(
    coral.map(([s]) => s),
    [".dk-btn.primary"],
  );
  assert.doesNotMatch(sky, /var\(--coral\)/);
});

test("Violet and Midnight give the thinking moon a cream rim (planet.css)", () => {
  const planet = strip(read("./planet.css"));
  assert.match(planet, /\.m-planet:is\(\.sk-violet,\.sk-midnight\)\{--mp-rim:#FFF3E0\}/);
});

test("the kit stays small", () => {
  assert.ok(Buffer.byteLength(read("./sky.css")) <= 16 * 1024, "sky.css");
  assert.ok(Buffer.byteLength(read("./desk.css")) <= 14 * 1024, "desk.css");
});
