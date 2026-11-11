/**
 * The Otto kit's CSS (planet.css, Nov 10, 2026) keeps Franky's motion and
 * theme rules: keyframes and transitions move only transform and opacity,
 * every loop stops under reduced motion (the moon parks), no filters, the
 * app's Light/Night selectors instead of the board's, never shadcn's
 * --muted, and the whole-pixel 24/28px drawings are there.
 *
 * Run with:
 *   node --test src/components/otto/kit/kit-css.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const raw = readFileSync(new URL("./planet.css", import.meta.url), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of every `@keyframes name { ... }`, braces balanced. */
function keyframes(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
    }
    out.set(m[1], source.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** Every plain rule as [selector, declarations], at-rule wrappers flattened. */
function rules(source: string): Array<[string, string]> {
  const flat = source.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const out: Array<[string, string]> = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].replace(/@(container|media)[^{]*$/, "").trim();
    if (selector) out.push([selector, m[2]]);
  }
  return out;
}

const PART = /\.m-(aura|x1|x2|x3|body|tex|face|eye|mark)\b/;

test("every keyframe moves only transform and opacity", () => {
  const frames = keyframes(css);
  assert.ok(frames.size >= 8, "the kit's keyframes are all here");
  for (const [name, body] of frames) {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
    assert.ok(props.length > 0, name);
    for (const p of props) assert.ok(p === "transform" || p === "opacity", `${name} animates ${p}`);
  }
});

test("transitions move only transform", () => {
  for (const m of css.matchAll(/transition\s*:\s*([^;}]+)/g)) {
    if (m[1].trim().startsWith("none")) continue;
    assert.match(m[1].trim(), /^transform\s/, m[1]);
  }
});

test("every looping animation sits on a part, and reduced motion stops every part", () => {
  const animated = rules(css).filter(([, decl]) => /animation\s*:[^;]*infinite/.test(decl));
  assert.ok(animated.length >= 5, "the idle loop, the laps and the think/work laps");
  for (const [selector] of animated) {
    for (const one of selector.split(/,(?![^(]*\))/)) {
      assert.match(one.trim(), /^\.m-planet[.:\s]/, one);
      assert.match(one, PART, `${one} is one of Otto's parts (all <i>)`);
    }
  }
  // Every animation name used is defined here.
  const frames = keyframes(css);
  for (const m of css.matchAll(/animation\s*:\s*([^;}]+)/g)) {
    for (const one of m[1].split(",")) {
      const name = one.trim().split(/[\s!]+/)[0];
      if (name !== "none") assert.ok(frames.has(name), `@keyframes ${name}`);
    }
  }
  const rm = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/);
  assert.ok(rm, "a reduced-motion block");
  const [selector, decl] = rules(rm[1])[0];
  assert.deepEqual(
    selector.split(",").map((s) => s.trim()),
    [".m-planet i", ".m-planet i::before", ".m-planet i::after"],
  );
  assert.match(decl, /animation:none!important/);
  assert.match(decl, /transition:none!important/);
});

test("no filters, no blur", () => {
  assert.doesNotMatch(css, /(^|[;{\s])(-webkit-)?(backdrop-)?filter\s*:/);
  assert.doesNotMatch(css, /blur\(/);
});

test("the app's theme selectors, never the board's, and never shadcn's --muted", () => {
  assert.doesNotMatch(css, /\.th-light|\.th-night|\.o-board/);
  assert.doesNotMatch(css, /--muted\s*:/);
  assert.doesNotMatch(css, /\.vibe-arc-planet/);
  // Light is the plain rule; Night under the app's dark selector and the night island.
  assert.match(css, /:root\[data-theme="dark"\] \.m-planet:not\(\.on-light\),\.vibe-night-island \.m-planet:not\(\.on-light\)\{/);
});

test("the small-size drawings are present: 28px (up to 40) and 24px", () => {
  assert.match(css, /@container \(max-width:40px\)\{/);
  assert.match(css, /@container \(max-width:25px\)\{/);
  // Containers need the size container on the span.
  assert.match(css, /\.m-planet\{[^}]*container-type:size/);
});

test("the moon truly orbits: two copies on one path, each shown for its half of the lap", () => {
  assert.match(css, /\.m-x1::after\{animation:m-planet-lap 16s linear 2\.5s infinite,m-planet-back 16s linear 2\.5s infinite\}/);
  assert.match(css, /\.m-x3::before\{animation:m-planet-lap 16s linear 2\.5s infinite,m-planet-front 16s linear 2\.5s infinite\}/);
  assert.match(css, /\.m-x3::after\{animation:m-planet-lap 16s linear 2\.5s infinite,m-planet-dim 16s linear 2\.5s infinite\}/);
  assert.match(css, /\.m-planet\.work \.m-x1::after,\.m-planet\.work \.m-x3::before,\.m-planet\.work \.m-x3::after\{animation-duration:2\.8s\}/);
  assert.match(css, /m-planet-lap 3\.4s linear infinite,m-planet-back 3\.4s/);
  assert.match(css, /\.m-planet\.wait\{--mp-th:0deg\}/);
  assert.match(css, /--mp-th:180deg/);
});

test("the ring is a full loop (Nov 11): split at its tips into far and near halves, never cut open", () => {
  assert.match(css, /\.m-planet \.m-x1::before\{border-color:var\(--mp-ring-b\);clip-path:inset\(0 0 49%\)\}/);
  assert.match(css, /\.m-planet \.m-x2::before\{clip-path:inset\(49% 0 0\)\}/);
  assert.equal(css.match(/clip-path:/g)?.length, 2, "no other clip opens the ring (the 24/28px drawing included)");
});

/** [percent, opacity] stops of one keyframes body; "a%,b%{opacity:x}" gives two stops. */
function stops(body: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of body.matchAll(/([\d.%,\s]+)\{opacity:([\d.]+)\}/g)) {
    for (const at of m[1].split(",")) out.push([parseFloat(at), Number(m[2])]);
  }
  return out;
}

test("the moon reads as one object: depth in the lap, the hand-off away from his body", () => {
  const frames = keyframes(css);
  const lap = frames.get("m-planet-lap") ?? "";
  // Behind him (the lap's first half) a touch smaller, never bigger; full size at both tips.
  const scales = [...lap.matchAll(/([\d.]+)%\{[^}]*scale\(([\d.]+)\)\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(scales.length, 9, "45deg steps");
  for (const [at, s] of scales) {
    if (at === 0 || at === 50 || at === 100) assert.equal(s, 1, `${at}%`);
    else if (at < 50) assert.ok(s < 1 && s >= 0.8, `${at}% behind: ${s}`);
    else assert.ok(s >= 1 && s <= 1.06, `${at}% in front: ${s}`);
  }
  // The front copy and the dim copy behind swap in one instant, and the veil is fully on at that instant,
  // so the two pictures are the same: front + veil (opacity 1) === the dim copy.
  const front = stops(frames.get("m-planet-front") ?? "");
  const back = stops(frames.get("m-planet-back") ?? "");
  const veil = stops(frames.get("m-planet-dim") ?? "");
  const at = (list: Array<[number, number]>, p: number) => list.find(([q]) => q === p)?.[1];
  for (const [swapOff, swapOn] of [[9.45, 9.5], [40.55, 40.5]]) {
    assert.equal(at(front, swapOff), 1);
    assert.equal(at(front, swapOn), 0);
    assert.equal(at(back, swapOff), 0);
    assert.equal(at(back, swapOn), 1);
    assert.equal(at(veil, swapOff), 1, "the veil is fully on as the copies swap");
  }
  // The veil is off at both tips (the moon is bright in front) and off while the copy behind shows.
  assert.equal(at(veil, 0), 0);
  assert.equal(at(veil, 50), 0);
  assert.equal(at(veil, 9.5), 0);
  // The dim copy behind and the veil share one dimmer drawing.
  assert.match(css, /\.m-planet \.m-x1::after,\.m-planet \.m-x3::after\{opacity:0;background:var\(--mp-dim\)\}/);
});

test("the kit stays small", () => {
  assert.ok(Buffer.byteLength(raw) <= 15 * 1024, `planet.css is ${Buffer.byteLength(raw)} bytes`);
});
