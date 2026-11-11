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

/** The text of one function in _otto.js, from its line to the next top-level function. */
function fnText(js: string, name: string): string {
  const from = js.indexOf(`  function ${name}(`);
  assert.ok(from >= 0, `_otto.js has ${name}`);
  const next = js.indexOf("\n  function ", from + 10);
  return js.slice(from, next < 0 ? undefined : next);
}

test("the static side panel is the desk panel: no dim, fluted glass, the header 'otto' (Wave 2B)", () => {
  const js = read("public/html/_otto.js");
  const desk = fnText(js, "buildDeskPanel");
  // Nothing dims the page: the desk panel makes no backdrop, and its styles blur nothing.
  assert.doesNotMatch(desk, /createElement\('div'\)|ottoBackdrop|backdrop\.onclick/);
  assert.match(desk, /backdrop = null;/);
  const css = js.slice(js.indexOf("deskStyle.textContent = `"), js.indexOf("document.head.appendChild(deskStyle);"));
  assert.ok(css.length > 0, "_otto.js has the desk panel's styles");
  assert.doesNotMatch(css, /backdrop-filter|rgba\(20,\s*20,\s*22/, "no blur, no dim");
  assert.match(css, /#ottoPanel\.op-desk > \.tx-flute \{/, "the flute is the surface");
  assert.match(css, /bottom: 104px;/, "stops above the 64px corner");
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*#ottoPanel\.op-desk, #ottoCorner\.otto-pop \.otto-shell \{ animation: none; \}/);
  // The header: a 28px still Otto and "otto"; no "your agent · online" (no model yet).
  assert.match(desk, /<span class="op-mini">\$\{planetHTML\(28\)\}<\/span>/);
  assert.match(desk, /<h2 class="otto-panel-name" id="ottoPanelName">otto<\/h2>/);
  assert.doesNotMatch(desk, /your agent|online/);
  const tsx = read("src/components/network/OttoSidePanel.tsx");
  assert.match(tsx, />\s*otto\s*<\/h2>/, "the React panel's header says the same");
  // A non-modal region: an aside, focus moves in, Escape and the corner close it.
  assert.match(desk, /createElement\('aside'\)/);
  assert.match(fnText(js, "openOttoPanel"), /panel\.focus\(\{ preventScroll: true \}\)/);
  assert.match(fnText(js, "closeOttoPanel"), /corner\.focus\(/);
  // The off switch: only otto_desk false brings back the old panel.
  assert.match(js, /j\.otto_desk === false/);
  // The two ways on, and the mini desk's sizes (panel-desk.ts).
  assert.match(desk, /Open your desk →/);
  assert.match(desk, /Full breakdown →/);
  const pd = read("src/lib/otto/panel-desk.ts");
  assert.match(js, new RegExp(`OTTO_PANEL_READY = ${pd.match(/PANEL_READY_MAX = (\d+)/)?.[1]};`));
  assert.match(js, new RegExp(`OTTO_PANEL_SAW = ${pd.match(/PANEL_SAW_MAX = (\d+)/)?.[1]};`));
});

test("the static corner waits like the React one: an ink count and his moon at the ring's end", () => {
  const js = read("public/html/_otto.js");
  const paint = fnText(js, "_ottoPaintCorner");
  assert.match(paint, /planet\.classList\.toggle\('wait', total > 0/);
  assert.match(paint, /total > 9 \? '9\+'/);
  assert.match(paint, /setAttribute\('aria-expanded'/);
  const mini = read("public/html/_miniMessenger.js");
  assert.match(mini, /window\.__ottoSetChats\(ottoTabs \? n : 0\)/, "unread chats reach the corner");
  assert.match(mini, /e\.key === "ArrowRight"/, "the Otto | Messages tabs take the arrow keys");
});

test("both side panels keep the page's Escape, solid glass, the pinned way on and the same parts (Wave 2B repair)", () => {
  const js = read("public/html/_otto.js");
  const tsx = read("src/components/network/OttoSidePanel.tsx");
  const pcss = read("src/components/network/otto-panel.css");
  const css = js.slice(js.indexOf("deskStyle.textContent = `"), js.indexOf("document.head.appendChild(deskStyle);"));
  // Escape is the panel's only from the panel or the corner: the page behind stays usable.
  assert.match(js, /if \(_ottoDeskMode && !\(panel\.contains\(at\) \|\| at === corner\)\) return;/);
  assert.match(tsx, /if \(inPanel \|\| at\?\.id === "otto-corner"\) onClose\(inPanel\);/);
  // Solid glass: with no blur, a see-through base only lets the page's words ghost through.
  assert.match(css, /background: var\(--cream, #FAF7F2\);/);
  assert.match(pcss, /\.otp-glass>\.tx-flute\{[^}]*background:var\(--cream\)\}/);
  // The way on is pinned at the foot in both, outside the scrolling body.
  assert.match(fnText(js, "buildDeskPanel"), /<div class="otto-panel-body"><\/div>\s*<div class="otto-panel-footer op-paper" role="navigation"/);
  assert.match(tsx, /<\/div>\s*\{\/\*[^*]*\*\/\}\s*<DeskLinks desk=\{desk\} \/>/);
  // The same parts: section labels on paper tabs, the top item on blueprint, icons in Otto saw.
  assert.match(css, /#ottoPanel\.op-desk \.op-sec \{[^}]*border-radius: 999px; background: var\(--paper/);
  assert.match(pcss, /\.otp \.dk-sec\{[^}]*border-radius:999px;background:var\(--paper\)/);
  assert.match(fnText(js, "_ottoReadyHTML"), /<article class="op-draft"/);
  assert.match(fnText(js, "_ottoSawHTML"), /_ottoIco\(item\.kind\)/);
  // The header's sizes match (React: 22px name, 15px line).
  assert.match(css, /font-size: 22px; font-weight: 900;/);
  assert.match(pcss, /\.otp-name\{[^}]*font:900 22px/);
  // The Messages tab keeps today's pencil and Open in the tab row, in both.
  assert.match(tsx, /className="otp-tab-new"[\s\S]*?aria-label="New message"/);
  assert.match(read("public/html/_miniMessenger.js"), /class="vmm-tab-new" id="vmmNew" aria-label="New message"/);
  // A same-site link guard that also refuses "/\host".
  assert.match(fnText(js, "_ottoHref"), /h\[1\] !== '\/' && h\[1\] !== '\\\\'/);
});
