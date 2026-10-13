import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * The living bloom's promises, read from the source (Oct 13, 2026). The feed
 * on phones must not get slower for a backdrop nobody is meant to notice, so:
 * the drift is transform + opacity only, nothing is blurred, reduced motion
 * is the old static backdrop, and the layered tokens stay in step with the
 * static ones.
 */
const REPO_ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, REPO_ROOT), "utf8");

/** From the bloom block's banner to the end of globals.css. */
function bloomBlock(css: string): string {
  const at = css.indexOf("The living bloom (Oct 13, 2026). The page backdrop");
  assert.notEqual(at, -1, "globals.css: the living bloom block is missing");
  // `at` is inside the banner comment: start after it closes.
  return css.slice(css.indexOf("*/", at) + 2);
}

/** The text between the braces that open at `open`. */
function braced(css: string, open: number): string {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

test("bloom: the keyframes move transform and opacity, nothing else", async () => {
  const css = await read("src/app/globals.css");
  const frames = [...css.matchAll(/@keyframes (vibe-bloom-[\w-]+)\s*\{/g)];
  assert.equal(frames.length, 2, "two drift loops, one per glow layer");
  for (const m of frames) {
    const body = braced(css, m.index + m[0].length - 1);
    const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]);
    assert.ok(props.length > 0, `${m[1]} is empty`);
    for (const prop of props) {
      assert.ok(
        prop === "transform" || prop === "opacity",
        `${m[1]} animates "${prop}". Only transform and opacity stay off the main thread; ` +
          `a gradient, a background position or a custom property repaints the whole screen every frame.`,
      );
    }
    for (const o of body.matchAll(/opacity:\s*([\d.]+)/g)) {
      assert.ok(Number(o[1]) <= 1 && Number(o[1]) >= 0.8, `${m[1]}: opacity stays between 0.8 and 1`);
    }
    // The layers hang 48px off screen; a longer trip would show their edge.
    for (const t of body.matchAll(/translate3d\(([^)]*)\)/g)) {
      const [x, y] = t[1].split(",").map((v) => Math.abs(parseFloat(v)));
      assert.ok(x <= 40 && y <= 40, `${m[1]}: the drift must stay under 40px (${t[1]})`);
    }
  }
});

test("bloom: no blur, no animated background, and the loops are slow", async () => {
  const block = bloomBlock(await read("src/app/globals.css"));
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /filter\s*:/, "no filter (blur) on the bloom layers");
  assert.doesNotMatch(rules, /background-position|@property|isolation\s*:/);
  const durations = [...rules.matchAll(/animation-duration:\s*(\d+)s/g)].map((d) => Number(d[1]));
  assert.equal(durations.length, 2);
  for (const d of durations) assert.ok(d >= 20 && d <= 40, `a loop is 20 to 40 seconds, not ${d}`);
  assert.match(rules, /animation-direction:\s*alternate/);
  assert.match(rules, /animation-timing-function:\s*ease-in-out/);
});

test("bloom: reduced motion is the static backdrop, and the layer is not displayed", async () => {
  const block = bloomBlock(await read("src/app/globals.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const query = block.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.notEqual(query, -1);
  const outside = block.slice(0, query);
  const inside = braced(block, block.indexOf("{", query));
  // Outside the query (so under `reduce`): hidden layer, host paints the token.
  assert.match(outside, /\.vibe-bloom\s*\{\s*display:\s*none;\s*\}/);
  assert.match(outside, /\.vibe-bloom-host\s*\{\s*background:\s*var\(--feed-backdrop\);\s*\}/);
  assert.match(outside, /\.vibe-bloom-host--network\s*\{\s*background:\s*var\(--network-backdrop\);\s*\}/);
  assert.doesNotMatch(outside, /animation|transparent|position:\s*fixed/);
  // Everything that moves, or that clears a background, is inside it.
  assert.match(inside, /animation-name:\s*vibe-bloom-drift-a/);
  assert.match(inside, /animation-name:\s*vibe-bloom-drift-b/);
  assert.match(inside, /z-index:\s*-1/);
});

/** A gradient with its anchor (`at …`) removed and spaces dropped. */
const shape = (g: string) => g.replace(/\bat\s+.*?,/, ",").replace(/\s+/g, "");

function token(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}:\\s*(.+);`));
  assert.ok(m, `${name} is not set`);
  return m[1];
}

test("drift: the bloom layers are --feed-backdrop taken apart, in both looks", async () => {
  const css = await read("src/app/globals.css");
  const light = braced(css, css.indexOf("{", css.search(/^:root \{\n\s+color-scheme: light/m)));
  const night = braced(css, css.indexOf("{", css.indexOf(':root[data-theme="dark"] {')));
  for (const [look, block] of [["Light", light], ["Night", night]] as const) {
    const whole = token(block, "--feed-backdrop");
    // "radial-gradient(…), radial-gradient(…), #BASE"
    const parts = whole.split(/,\s*(?=radial-gradient|#)/);
    assert.equal(parts.length, 3, `${look}: --feed-backdrop is two glows and a base colour`);
    assert.equal(shape(token(block, "--bloom-a")), shape(parts[0]), `${look}: --bloom-a is out of step with --feed-backdrop`);
    assert.equal(shape(token(block, "--bloom-b")), shape(parts[1]), `${look}: --bloom-b is out of step with --feed-backdrop`);
    assert.equal(token(block, "--bloom-base"), parts[2], `${look}: --bloom-base is out of step with --feed-backdrop`);
  }
});

test("bloom: every screen that hosts it mounts the one shared layer", async () => {
  const screens = [
    "src/components/mobile/CampusMobile.tsx",
    "src/components/mobile/NetworkMobile.tsx",
    "src/components/mobile/MessagesMobile.tsx",
    "src/components/settings/SettingsClient.tsx",
    "src/components/network/NetworkPageClient.tsx",
    "src/app/campus/campus-home.tsx",
  ];
  for (const file of screens) {
    const src = await read(file);
    assert.match(src, /VIBE_BLOOM_HOST/, `${file}: the container takes the host class`);
    assert.match(src, /<VibeBloom\b/, `${file}: the layer is mounted`);
    assert.doesNotMatch(src, /@keyframes vibe-bloom/, `${file}: the keyframes live in globals.css only`);
    assert.doesNotMatch(
      src,
      /background:\s*"var\(--(feed|network)-backdrop\)"/,
      `${file}: an inline backdrop would cover the layer; use the host class`,
    );
  }
  const shell = await read("src/components/mobile/MobileShell.tsx");
  assert.match(shell, /className="vibe-mobile-shell"/);
  assert.doesNotMatch(shell, /background:/, "MobileShell: the cream lives on the class so a bloom screen can clear it");
});
