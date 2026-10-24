/**
 * First light (Franky, Oct 24 2026; ./first-light.ts): the pre-paint hold,
 * its start rule, the CSS that holds each part, the layout's off switch, and
 * light / lightAll on a stand-in page.
 *
 * Run with:
 *   node --test src/lib/tour/first-light.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The .ts path through a variable, so tsc (no .ts imports) and node (no
// extensionless ones) both take it; the cast keeps the types.
const spec = "./first-light.ts";
const FL = (await import(spec)) as typeof import("./first-light");
const {
  FIRST_LIGHT_ATTR,
  FIRST_LIGHT_BOOT_SCRIPT,
  FIRST_LIGHT_BURST_CLASS,
  FIRST_LIGHT_PARTS,
  FIRST_LIGHT_TARGETS,
  afterLighting,
  heldParts,
} = FL;

const readRoot = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

/** Runs the boot script against a stand-in page; returns the attribute it set (or null). */
function boot(opts: { path?: string; search?: string; pending?: string | null; seen?: boolean; storageThrows?: boolean }) {
  return bootPage(opts).attr;
}

/** The same, keeping the page: its attributes and the last-resort timer the script armed. */
function bootPage(opts: { path?: string; search?: string; pending?: string | null; seen?: boolean; storageThrows?: boolean }) {
  const attrs = new Map<string, string>();
  const store: Record<string, string> = {};
  if (opts.pending) store.vibe_tour_pending = opts.pending;
  if (opts.seen) store.vibe_campus_tour_seen_v1 = "1";
  const localStorage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      return k in store ? store[k] : null;
    },
  };
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    },
  };
  const location = { pathname: opts.path ?? "/campus", search: opts.search ?? "" };
  const timers: { fn: () => void; ms: number }[] = [];
  const setTimeout = (fn: () => void, ms: number) => timers.push({ fn, ms });
  const window: { OttoTour?: { isRunning: () => boolean } } = {};
  new Function("localStorage", "document", "location", "setTimeout", "window", FIRST_LIGHT_BOOT_SCRIPT)(
    localStorage,
    document,
    location,
    setTimeout,
    window,
  );
  return { attr: attrs.get(FIRST_LIGHT_ATTR) ?? null, attrs, timers, window };
}

test("the boot script is plain ES5, safe to inline, and touches nothing but the one attribute", () => {
  assert.ok(!/<\/script/i.test(FIRST_LIGHT_BOOT_SCRIPT));
  assert.ok(!/\b(const|let|class)\b|=>|`/.test(FIRST_LIGHT_BOOT_SCRIPT), "plain ES5");
  assert.doesNotMatch(FIRST_LIGHT_BOOT_SCRIPT, /setItem|removeItem|fetch|cookie/);
  assert.match(FIRST_LIGHT_BOOT_SCRIPT, /try\{/);
});

test("it holds on a first Campus visit: the tour's flag, or ?welcome=1 where the tour wasn't seen", () => {
  assert.equal(boot({ pending: "campus" }), "feed clubs tonight");
  // The shared laptop: the flag wins over "seen", as in tourStartDecision.
  assert.equal(boot({ pending: "campus", seen: true }), "feed clubs tonight");
  assert.equal(boot({ search: "?welcome=1" }), "feed clubs tonight");
  assert.equal(boot({ search: "?tab=feed&welcome=1" }), "feed clubs tonight");
});

test("the boot script arms a last resort: no tour on screen by then, everything shows", () => {
  const stalled = bootPage({ pending: "campus" });
  assert.equal(stalled.timers.length, 1);
  assert.equal(stalled.timers[0]?.ms, FL.FIRST_LIGHT_LAST_RESORT_MS);
  stalled.timers[0]?.fn();
  assert.equal(stalled.attrs.has(FIRST_LIGHT_ATTR), false);
  // With the tour running it leaves the reveal to the tour.
  const running = bootPage({ pending: "campus" });
  running.window.OttoTour = { isRunning: () => true };
  running.timers[0]?.fn();
  assert.equal(running.attrs.get(FIRST_LIGHT_ATTR), "feed clubs tonight");
  // No hold, no timer.
  assert.equal(bootPage({}).timers.length, 0);
});

test("it holds nothing on any other visit", () => {
  assert.equal(boot({}), null);
  assert.equal(boot({ search: "?welcome=1", seen: true }), null);
  assert.equal(boot({ pending: "profile" }), null);
  assert.equal(boot({ search: "?welcome=10" }), null);
  assert.equal(boot({ path: "/orgs/sixtyfourchess", pending: "campus" }), null);
  assert.equal(boot({ path: "/messages", search: "?welcome=1" }), null);
  // Storage blocked reads as no flag, not seen.
  assert.equal(boot({ storageThrows: true }), null);
});

test("shouldHold (the in-app arrival) and the boot script agree on every case", () => {
  const cases = [
    { path: "/campus", search: "", pending: "campus", seen: false },
    { path: "/campus", search: "", pending: "campus", seen: true },
    { path: "/campus", search: "?welcome=1", pending: null, seen: false },
    { path: "/campus", search: "?tab=feed&welcome=1", pending: null, seen: false },
    { path: "/campus", search: "?welcome=1", pending: null, seen: true },
    { path: "/campus", search: "", pending: null, seen: false },
    { path: "/campus", search: "", pending: "profile", seen: false },
    { path: "/campus", search: "?welcome=10", pending: null, seen: false },
    { path: "/orgs/x", search: "?welcome=1", pending: "campus", seen: false },
  ];
  for (const c of cases) {
    const booted = boot({ path: c.path, search: c.search, pending: c.pending, seen: c.seen }) !== null;
    assert.equal(FL.shouldHold(c.path, c.search, c.pending, c.seen), booted, JSON.stringify(c));
  }
});

test("the in-app arrival holds before the paint, by the same rule, and only with the switch on", () => {
  const home = readRoot("src/app/campus/campus-home.tsx");
  const mobile = readRoot("src/components/mobile/CampusMobile.tsx");
  for (const src of [home, mobile]) assert.match(src, /useLayoutEffect\(holdOnClientArrival, \[\]\)/);
  const layout = readRoot("src/app/layout.tsx");
  assert.match(layout, /firstLight \? \{ \[FIRST_LIGHT_ON_ATTR\]: "" \} : \{\}/);
});

test("heldParts and afterLighting keep the order and drop one part at a time", () => {
  assert.deepEqual(heldParts("feed clubs tonight"), ["feed", "clubs", "tonight"]);
  assert.deepEqual(heldParts("tonight  feed"), ["feed", "tonight"]);
  assert.deepEqual(heldParts("junk"), []);
  assert.deepEqual(heldParts(null), []);
  assert.equal(afterLighting("feed clubs tonight", "feed"), "clubs tonight");
  assert.equal(afterLighting("tonight", "tonight"), null);
  assert.equal(afterLighting("clubs tonight", "feed"), "clubs tonight");
});

test("globals.css holds exactly FIRST_LIGHT_TARGETS, plus the phone's +", () => {
  const css = readRoot("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /((?:html\[data-first-light[^\]]*\][^,{]*,\s*)*html\[data-first-light[^\]]*\][^,{]*)\{\s*visibility:\s*hidden;\s*\}/.exec(css);
  assert.ok(rule, "the hold rule is missing from globals.css");
  const selectors = rule[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
  const expected = FIRST_LIGHT_PARTS.flatMap((part) =>
    FIRST_LIGHT_TARGETS[part].map((sel) => `html[data-first-light~="${part}"] ${sel}`),
  );
  expected.push("html[data-first-light] #otto-mobile-tour-compose");
  assert.deepEqual(selectors.sort(), expected.sort());
  assert.match(css, new RegExp(`\\.${FIRST_LIGHT_BURST_CLASS}\\s*\\{[^}]*first-light-pop`));
  // The burst animates transform and opacity only, and leaves no transform behind.
  const keyframes = [...css.matchAll(/@keyframes first-light-[a-z]+\s*\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]);
  assert.ok(keyframes.length >= 3);
  for (const k of keyframes) {
    for (const prop of k.matchAll(/([a-z-]+)\s*:/g)) assert.ok(["opacity", "transform"].includes(prop[1]), prop[1]);
  }
  assert.match(css, /first-light-pop 600ms var\(--vibe-spring-pop\) backwards/);
});

test("the root layout runs it before the first paint, with the nonce, unless FIRST_LIGHT=off", () => {
  const layout = readRoot("src/app/layout.tsx");
  assert.match(layout, /process\.env\.FIRST_LIGHT !== "off"/);
  assert.match(layout, /<script nonce=\{nonce\} dangerouslySetInnerHTML=\{\{ __html: FIRST_LIGHT_BOOT_SCRIPT \}\} \/>/);
  assert.ok(layout.indexOf("THEME_BOOT_SCRIPT }}") < layout.indexOf("FIRST_LIGHT_BOOT_SCRIPT }}"), "after the theme script");
  assert.ok(layout.indexOf("FIRST_LIGHT_BOOT_SCRIPT }}") < layout.indexOf("</head>"), "in <head>");
});

// ── light / lightAll on a stand-in page ─────────────────────────────────────

type FakeEl = { classes: Set<string>; listeners: number };

function fakePage(held: string | null, hidden: string[] = []) {
  const hiddenSelectors = new Set(hidden);
  const attrs = new Map<string, string>();
  if (held) attrs.set(FIRST_LIGHT_ATTR, held);
  const elements = new Map<string, FakeEl>();
  const el = (sel: string): FakeEl => {
    if (!elements.has(sel)) elements.set(sel, { classes: new Set(), listeners: 0 });
    return elements.get(sel)!;
  };
  const document = {
    documentElement: {
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    },
    querySelectorAll: (sel: string) => {
      const e = el(sel);
      return [
        {
          classList: { add: (c: string) => e.classes.add(c), remove: (c: string) => e.classes.delete(c) },
          getClientRects: () => (hiddenSelectors.has(sel) ? [] : [{}]),
          offsetWidth: 1,
          addEventListener: () => (e.listeners += 1),
          removeEventListener: () => {},
        },
      ];
    },
  };
  return { document, attrs, el };
}

function withPage<T>(page: ReturnType<typeof fakePage>, run: () => T): T {
  const g = globalThis as { document?: unknown; window?: unknown };
  const before = { document: g.document, window: g.window };
  g.document = page.document;
  // The burst's clear-up timer is armed, never run here.
  g.window = { setTimeout: () => 0, clearTimeout: () => {} };
  try {
    return run();
  } finally {
    g.document = before.document;
    g.window = before.window;
  }
}

test("light() bursts that part's elements on both layouts and lifts its hold", () => {
  const page = fakePage("feed clubs tonight");
  withPage(page, () => FL.light("feed"));
  assert.equal(page.attrs.get(FIRST_LIGHT_ATTR), "clubs tonight");
  for (const sel of FIRST_LIGHT_TARGETS.feed) assert.ok(page.el(sel).classes.has(FIRST_LIGHT_BURST_CLASS), sel);
  for (const sel of FIRST_LIGHT_TARGETS.tonight) assert.ok(!page.el(sel).classes.has(FIRST_LIGHT_BURST_CLASS), sel);
  // A part that isn't held is left alone.
  withPage(page, () => FL.light("feed"));
  assert.equal(page.attrs.get(FIRST_LIGHT_ATTR), "clubs tonight");
  assert.equal(withPage(page, () => FL.firstLightHeld()), true);
});

test("lightAll() brings everything still held and removes the attribute", () => {
  const page = fakePage("clubs tonight");
  withPage(page, () => FL.lightAll());
  assert.equal(page.attrs.has(FIRST_LIGHT_ATTR), false);
  for (const sel of [...FIRST_LIGHT_TARGETS.clubs, ...FIRST_LIGHT_TARGETS.tonight]) {
    assert.ok(page.el(sel).classes.has(FIRST_LIGHT_BURST_CLASS), sel);
  }
  assert.equal(withPage(page, () => FL.firstLightHeld()), false);
});

test("a part not drawn at this width (display:none) gets no burst to replay later", () => {
  const page = fakePage("clubs", [".tonight-feed-left"]);
  withPage(page, () => FL.light("clubs"));
  assert.equal(page.el(".tonight-feed-left").classes.has(FIRST_LIGHT_BURST_CLASS), false);
  assert.equal(page.el(".tonight-feed-right .tonight-fold").classes.has(FIRST_LIGHT_BURST_CLASS), true);
  assert.equal(page.attrs.has(FIRST_LIGHT_ATTR), false);
});

test("with the switch off (no attribute) nothing happens", () => {
  const page = fakePage(null);
  withPage(page, () => {
    FL.light("feed");
    FL.lightAll();
  });
  assert.equal(page.attrs.has(FIRST_LIGHT_ATTR), false);
  assert.equal(page.el(FIRST_LIGHT_TARGETS.feed[0]!).classes.size, 0);
});

test("every way out lights everything: the computer tour, the phone tour and both tab switches", () => {
  const home = readRoot("src/app/campus/campus-home.tsx");
  const phone = readRoot("src/components/mobile/use-mobile-tour.ts");
  const mobile = readRoot("src/components/mobile/CampusMobile.tsx");
  const waysOut = (src: string) => (src.match(/lightAll(UnlessTourRunning)?\(\)/g) ?? []).length;
  assert.ok(waysOut(home) >= 7, "campus-home: strip, none, no engine, no steps, finish, script failure, tab");
  assert.match(home, /lightAllUnlessRunning\(/);
  assert.match(home, /if \(tab !== "feed"\) lightAll\(\);/);
  assert.match(phone, /lightAllUnlessRunning\(/);
  assert.ok(waysOut(phone) >= 5, "use-mobile-tour: strip, none, poll timeout, script failure, done");
  // A visit that won't start a tour leaves a running one alone (a remount mid-tour).
  for (const src of [home, phone]) assert.match(src, /lightAllUnlessTourRunning\(\)/);
  assert.match(mobile, /if \(tab !== "feed"\) lightAll\(\);/);
});
