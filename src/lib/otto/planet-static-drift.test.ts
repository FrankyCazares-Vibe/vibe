/**
 * Otto on the static pages (Nov 10, 2026, the Otto build's Wave 1) never
 * drifts from the React one: public/html/_otto-planet.css is a byte copy of
 * the kit's planet.css, every Planet the static pages draw carries the parts
 * in PLANET_PARTS order (OttoPlanet.tsx), the pages read the same look key
 * and colourways as look.ts, they carry the app's two springs the kit moves
 * on, and none of the old orb's parts are left.
 *
 * Run with:
 *   node --test src/lib/otto/planet-static-drift.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// A URL import, so node loads the .ts file without a resolve hook.
const L = (await import(new URL("./look.ts", import.meta.url).href)) as typeof import("./look");

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

const PAGES = ["public/html/profile.html", "public/html/messages.html", "public/html/onboarding.html"];

/** PLANET_PARTS, read as text: OttoPlanet.tsx is a client component node can't import. */
function planetParts(): string[] {
  const src = read("src/components/otto/planet/OttoPlanet.tsx");
  const list = src.match(/export const PLANET_PARTS = \[([\s\S]*?)\] as const;/)?.[1];
  assert.ok(list, "PLANET_PARTS is exported from OttoPlanet.tsx");
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** The parts with their nesting: m-tex and m-face in m-body, the eyes in m-face. */
const CANONICAL =
  '<i class="m-aura"></i><i class="m-x1"></i>' +
  '<i class="m-body"><i class="m-tex"></i><i class="m-face"><i class="m-eye l"></i><i class="m-eye r"></i></i></i>' +
  '<i class="m-x2"></i><i class="m-x3"></i><i class="m-mark"></i>';

/** Joins a JS string built over several lines ('a' + 'b') back into one. */
const unsplit = (js: string) => js.replace(/'\s*\+\s*'/g, "");

/** Every Planet's inner markup in a page: the text from its span to the span's end. */
function planetsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/class="m-otto m-planet[^"]*"[^>]*>/g)) {
    const from = (m.index ?? 0) + m[0].length;
    out.push(text.slice(from, text.indexOf("</span>", from)));
  }
  return out;
}

test("the static CSS is the React kit's planet.css, byte for byte", () => {
  const kit = readFileSync(new URL("src/components/otto/kit/planet.css", root));
  const copy = readFileSync(new URL("public/html/_otto-planet.css", root));
  assert.ok(kit.equals(copy), "cp src/components/otto/kit/planet.css public/html/_otto-planet.css");
});

test("the canonical markup is PLANET_PARTS, in order", () => {
  const classes = [...CANONICAL.matchAll(/<i class="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(classes, planetParts());
});

test("every Planet the static pages draw carries PLANET_PARTS in order", () => {
  const sources: Array<[string, string]> = [
    ...PAGES.map((f): [string, string] => [f, read(f)]),
    ["public/html/_otto.js", unsplit(read("public/html/_otto.js"))],
  ];
  let total = 0;
  for (const [file, text] of sources) {
    for (const inner of planetsIn(text)) {
      assert.equal(inner, CANONICAL, file);
      total++;
    }
  }
  // profile: loading state, hero, welcome banner; onboarding: step 1 and five steps.
  assert.ok(total >= 9, `found ${total}`);
  // _otto.js builds its markup in one maker, the same parts.
  assert.ok(unsplit(read("public/html/_otto.js")).includes(`px">${CANONICAL}</span>`), "_otto.js planetHTML");
  // Each Planet is decorative and opens at a size, as OttoPlanet draws it.
  for (const [file, text] of sources) {
    for (const m of text.matchAll(/<span class="m-otto m-planet[^>]*>/g)) {
      assert.match(m[0], /aria-hidden="true"/, file);
      assert.match(m[0], /style="width:[^;"]+;height:/, file);
    }
  }
});

test("_otto.js draws each of its Ottos through the one maker", () => {
  const js = unsplit(read("public/html/_otto.js"));
  assert.equal(js.split("m-otto m-planet").length - 1, 1);
  // corner, panel, ask bubble, publish panel, toast
  assert.ok((js.match(/\$\{planetHTML\(\d+/g) ?? []).length >= 5);
  assert.match(js, /planetHTML\(46, \{ live: true \}\)/, "the computer's corner Otto is the live one");
  assert.match(js, /size >= 40\) cls \+= ' m-live'/, "never live below 40px, like OttoPlanet");
});

test("the static pages read the look the app writes", () => {
  const colours = `['${L.OTTO_COLOURS.join("', '")}']`;
  for (const file of ["public/html/_otto.js", "public/html/onboarding.html"]) {
    const text = read(file);
    assert.ok(text.includes(`localStorage.getItem('${L.LOOK_STORAGE_KEY}')`), file);
    assert.ok(text.includes(colours), `${file}: the ten colourways of look.ts`);
  }
  assert.ok(read("public/html/_otto.js").includes(`'${L.LOOK_EVENT}'`));
  // Only step 1's Otto lives on the onboarding; the small ones are still.
  const onb = read("public/html/onboarding.html");
  assert.equal(onb.match(/ m-live" data-otto-live/g)?.length, 1);
  assert.match(onb, /class="otto-big vibe-night-island">\s*<span class="m-otto m-planet sk-ember m-live" data-otto-live/);
  assert.match(onb, /paintOttoLook\(\);\s*startArrival\(\);/, "the look is on him before the wormhole copies him");
});

test("each page links the kit once and carries the app's two springs", () => {
  const globals = read("src/app/globals.css");
  const spring = (text: string, name: string) =>
    [...text.matchAll(new RegExp(`--vibe-spring-${name}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
  for (const file of PAGES) {
    const html = read(file);
    assert.equal(html.split('<link rel="stylesheet" href="/html/_otto-planet.css">').length - 1, 1, file);
    assert.equal(html.match(/<link[^>]*_otto-planet\.css/g)?.length, 1, file);
    for (const name of ["pop", "soft"]) {
      assert.deepEqual(spring(html, name), spring(globals, name), `${file} --vibe-spring-${name}`);
    }
  }
});

test("no part of the old orb is left in public/html", () => {
  const dir = new URL("public/html/", root);
  const old = /\b(orb-core|orb-track|otto-orb-wrap|orb-ring|otto-orbit|otto-core|otto-pulse-o|op-orbit|op-core|op-pulse-[op]|orbit-out|orbit-mid|pulse-1|pulse-2)\b/;
  for (const name of readdirSync(dir)) {
    if (!/\.(html|js|css)$/.test(name)) continue;
    const text = readFileSync(new URL(name, dir), "utf8");
    const hit = text.match(old);
    assert.equal(hit, null, `${name}: ${hit?.[0]}`);
  }
});

test("the static corner is the React corner's 64px paper puck, with no coral mark of its own", () => {
  const js = read("public/html/_otto.js");
  const shell = js.match(/#ottoCorner \.otto-shell \{([^}]*)\}/)?.[1];
  assert.ok(shell, "_otto.js styles #ottoCorner .otto-shell");
  assert.match(shell, /width: 64px; height: 64px;/);
  assert.match(shell, /background: var\(--paper/);
  assert.match(js, /<div class="otto-shell">\$\{planetHTML\(46, \{ live: true \}\)\}<\/div>/, "follows the page's look");
  assert.match(js, /#ottoCorner \.m-planet \{ --m-surface: var\(--paper/);
  const tsx = read("src/components/network/OttoCorner.tsx");
  assert.match(tsx, /width: 64,\s*height: 64,/, "OttoCorner.tsx is 64px too");
  assert.match(tsx, /background: "var\(--paper\)"/);
  // Waiting is his coral moon at the ring's end: the count and the dot are ink.
  const dot = js.match(/#ottoCorner \.otto-notif \{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(dot, /FF5C35|255,\s*92,\s*53/i);
  const css = read("src/components/network/otto-corner.css");
  const count = css.match(/\.otto-corner-count \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(count, "otto-corner.css styles the count");
  assert.doesNotMatch(count, /FF5C35|255,\s*92,\s*53|animation/i);
  assert.doesNotMatch(tsx, /otto-badge-(pulse|ripple)/, "no badge loops");
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*#otto-corner \{ animation: none !important; \}/);
});
