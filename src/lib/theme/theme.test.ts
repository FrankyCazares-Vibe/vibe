/**
 * Tests for `theme.ts` (S67 wave 3, contracts C4): the resolver, the saved
 * preference, the pre-paint boot script (run for real against fakes), the
 * client `applyTheme`, and the DRIFT TRIPWIRE: the four static pages must
 * carry `THEME_BOOT_SCRIPT` verbatim in their <head>. When
 * `DEFAULT_THEME_PREF` changes, that test fails per file until each paste is
 * refreshed (then bump SW_VERSION in public/sw.js).
 *
 * Run with:
 *   node --test src/lib/theme/theme.test.ts
 *
 * The module has no imports, so it loads through a dynamic import of its
 * ".ts" path (the `config.test.ts` pattern; the specifier goes through a
 * variable because tsc refuses a literal ".ts" specifier).
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type * as ThemeModule from "./theme";

const specifier = "./theme.ts";
const {
  DEFAULT_THEME_PREF,
  THEME_BOOT_SCRIPT,
  THEME_EVENT,
  THEME_META_COLORS,
  THEME_PREFS,
  THEME_STORAGE_KEY,
  applyTheme,
  currentTheme,
  isThemePref,
  readThemePref,
  resolveTheme,
  syncThemeColorMeta,
  watchSystemTheme,
} = (await import(specifier)) as typeof ThemeModule;

test("the enum and the default", () => {
  assert.deepEqual([...THEME_PREFS], ["light", "dark", "system"]);
  assert.ok(isThemePref(DEFAULT_THEME_PREF), "the default must be one of the three");
  assert.equal(THEME_STORAGE_KEY, "vibe_theme");
  assert.equal(THEME_META_COLORS.light, "#FAF7F2");
  assert.equal(THEME_META_COLORS.dark, "#0C0B0B");
  assert.equal(THEME_EVENT, "vibe:theme");
});

test("isThemePref accepts only the three words", () => {
  for (const p of THEME_PREFS) assert.equal(isThemePref(p), true, p);
  for (const bad of ["night", "auto", "Dark", "", null, undefined, 1, {}]) {
    assert.equal(isThemePref(bad), false, String(bad));
  }
});

test("resolveTheme: explicit wins, system follows the OS, unknown is light", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  // A stale value that slipped past the type can never paint Night.
  assert.equal(resolveTheme("night" as never, true), "light");
});

test("readThemePref: validated, default on anything else", () => {
  const withValue = (v: string | null) => ({ getItem: (k: string) => (k === "vibe_theme" ? v : null) });
  assert.equal(readThemePref(withValue("dark")), "dark");
  assert.equal(readThemePref(withValue("light")), "light");
  assert.equal(readThemePref(withValue("system")), "system");
  assert.equal(readThemePref(withValue(null)), DEFAULT_THEME_PREF);
  assert.equal(readThemePref(withValue("night")), DEFAULT_THEME_PREF);
  assert.equal(readThemePref(withValue("")), DEFAULT_THEME_PREF);
  assert.equal(readThemePref(null), DEFAULT_THEME_PREF, "no storage at all");
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readThemePref(throwing), DEFAULT_THEME_PREF, "a throwing storage");
});

test("THEME_BOOT_SCRIPT: the key, the attribute, the default, nothing else", () => {
  assert.ok(THEME_BOOT_SCRIPT.includes('"vibe_theme"'), "reads the device key");
  assert.ok(THEME_BOOT_SCRIPT.includes("document.documentElement.dataset.theme="), "sets data-theme");
  assert.ok(THEME_BOOT_SCRIPT.includes(JSON.stringify(DEFAULT_THEME_PREF)), "carries the default");
  assert.ok(THEME_BOOT_SCRIPT.includes("prefers-color-scheme: dark"), "asks the OS for system");
  assert.ok(!THEME_BOOT_SCRIPT.includes("theme-color"), "never rewrites the meta (React owns it)");
  assert.ok(!/<\/script/i.test(THEME_BOOT_SCRIPT), "safe to inline");
  // ES5 so the oldest web view that opens a static page can run it.
  assert.ok(!/\b(const|let|class)\b|=>|`/.test(THEME_BOOT_SCRIPT), "plain ES5");
});

/** Runs the boot script against fakes and returns what it put on <html>. */
function bootWith(opts: { stored?: string | null; throws?: boolean; prefersDark?: boolean | null }) {
  const html = { dataset: {} as Record<string, string> };
  const fakeDocument = { documentElement: html };
  const fakeStorage = {
    getItem: () => {
      if (opts.throws) throw new Error("SecurityError");
      return opts.stored ?? null;
    },
  };
  const fakeWindow =
    opts.prefersDark === null
      ? {} // no matchMedia at all
      : { matchMedia: () => ({ matches: opts.prefersDark === true }) };
  new Function("window", "document", "localStorage", THEME_BOOT_SCRIPT)(
    fakeWindow,
    fakeDocument,
    fakeStorage,
  );
  return html.dataset.theme;
}

test("THEME_BOOT_SCRIPT resolves like resolveTheme", () => {
  assert.equal(bootWith({ stored: "dark", prefersDark: false }), "dark");
  assert.equal(bootWith({ stored: "light", prefersDark: true }), "light");
  assert.equal(bootWith({ stored: "system", prefersDark: true }), "dark");
  assert.equal(bootWith({ stored: "system", prefersDark: false }), "light");
  assert.equal(bootWith({ stored: "system", prefersDark: null }), "light", "no matchMedia → light");
  const fallback = resolveTheme(DEFAULT_THEME_PREF, true);
  assert.equal(bootWith({ stored: "night", prefersDark: true }), fallback, "unknown → default");
  assert.equal(bootWith({ stored: null, prefersDark: true }), fallback, "missing → default");
  assert.equal(bootWith({ throws: true, prefersDark: true }), fallback, "blocked storage → default");
});

/** Installs fake window/document globals for one client-side test. */
function withFakeClient(prefersDark: boolean, run: (fakes: FakeClient) => void) {
  const g = globalThis as unknown as Record<string, unknown>;
  const had = { window: "window" in g, document: "document" in g };
  const before = { window: g.window, document: g.document };
  const meta = { content: "#FAF7F2", setAttribute(_: string, v: string) { this.content = v; } };
  const html = { dataset: {} as Record<string, string> };
  const events: CustomEvent[] = [];
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const fakes: FakeClient = {
    html,
    meta,
    events,
    fireOsChange(matches: boolean) {
      listeners.forEach((l) => l({ matches }));
    },
    listenerCount: () => listeners.length,
  };
  g.window = {
    matchMedia: () => ({
      matches: prefersDark,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      },
    }),
    dispatchEvent: (e: CustomEvent) => events.push(e),
  };
  g.document = { documentElement: html, querySelectorAll: () => [meta] };
  try {
    run(fakes);
  } finally {
    if (had.window) g.window = before.window; else delete g.window;
    if (had.document) g.document = before.document; else delete g.document;
  }
}
type FakeClient = {
  html: { dataset: Record<string, string> };
  meta: { content: string; setAttribute(name: string, value: string): void };
  events: CustomEvent[];
  fireOsChange(matches: boolean): void;
  listenerCount(): number;
};

test("applyTheme: attribute, meta and the vibe:theme event", () => {
  withFakeClient(true, ({ html, meta, events }) => {
    assert.equal(applyTheme("system"), "dark");
    assert.equal(html.dataset.theme, "dark");
    assert.equal(meta.content, "#0C0B0B");
    assert.equal(events.length, 1);
    assert.equal(events[0].type, THEME_EVENT);
    assert.deepEqual(events[0].detail, { pref: "system", theme: "dark" });

    assert.equal(applyTheme("light"), "light");
    assert.equal(html.dataset.theme, "light");
    assert.equal(meta.content, "#FAF7F2");
    assert.deepEqual(events[1].detail, { pref: "light", theme: "light" });
  });
});

test("syncThemeColorMeta writes only a meta that differs; currentTheme reads <html>", () => {
  withFakeClient(false, ({ html, meta }) => {
    let writes = 0;
    const write = meta.setAttribute.bind(meta);
    meta.setAttribute = (name: string, value: string) => {
      writes += 1;
      write(name, value);
    };
    assert.equal(currentTheme(), "light", "no attribute reads as light");
    html.dataset.theme = "dark";
    assert.equal(currentTheme(), "dark");
    syncThemeColorMeta(currentTheme());
    assert.equal(meta.content, "#0C0B0B");
    syncThemeColorMeta("dark");
    assert.equal(writes, 1, "an equal meta is left alone (the head watcher can't loop)");
  });
  assert.equal(currentTheme(), "light", "no document → light");
  syncThemeColorMeta("dark"); // no document: a no-op, no throw
});

test("syncThemeColorMeta keeps a Night-only page's chrome dark (the landing, S72)", () => {
  withFakeClient(false, ({ meta }) => {
    const fakeWindow = (globalThis as unknown as { window: Record<string, unknown> }).window;
    fakeWindow.location = { pathname: "/" };
    applyTheme("light");
    assert.equal(meta.content, "#0C0B0B", "/ stays dark in Light");
    fakeWindow.location = { pathname: "/campus" };
    syncThemeColorMeta(currentTheme());
    assert.equal(meta.content, "#FAF7F2", "every other page follows the theme");
  });
});

test("applyTheme without a document only resolves", () => {
  assert.equal(applyTheme("dark"), "dark");
  assert.equal(applyTheme("system"), "light", "no matchMedia on the server → light");
});

test("watchSystemTheme: subscribes, reports, unsubscribes", () => {
  withFakeClient(false, (fakes) => {
    const seen: boolean[] = [];
    const stop = watchSystemTheme((d) => seen.push(d));
    assert.equal(fakes.listenerCount(), 1);
    fakes.fireOsChange(true);
    fakes.fireOsChange(false);
    assert.deepEqual(seen, [true, false]);
    stop();
    assert.equal(fakes.listenerCount(), 0);
    fakes.fireOsChange(true);
    assert.deepEqual(seen, [true, false], "nothing after unsubscribe");
  });
  assert.equal(typeof watchSystemTheme(() => {}), "function", "no-op unsubscribe on the server");
});

/**
 * DRIFT TRIPWIRE. The static pages can't import theme.ts, so they paste the
 * script. Each <head> must contain the CURRENT string verbatim; the failure
 * names the file to fix. Expected red until W3a-static pastes it, and again
 * the day DEFAULT_THEME_PREF flips (wave 5).
 */
const REPO_ROOT = new URL("../../../", import.meta.url);
const STATIC_HEADS = [
  "public/html/profile.html",
  "public/html/messages.html",
  "public/html/onboarding.html",
  "public/offline.html",
];

for (const file of STATIC_HEADS) {
  test(`drift: ${file} <head> carries THEME_BOOT_SCRIPT verbatim`, async () => {
    const html = await readFile(new URL(file, REPO_ROOT), "utf8");
    const open = html.search(/<head[\s>]/i);
    const close = html.search(/<\/head\s*>/i);
    assert.ok(open >= 0 && close > open, `${file}: no <head>…</head> found`);
    const head = html.slice(open, close);
    assert.ok(
      head.includes(THEME_BOOT_SCRIPT),
      `${file}: <head> does not carry the current THEME_BOOT_SCRIPT verbatim. ` +
        `Paste the string from src/lib/theme/theme.ts as the first <head> child ` +
        `(then bump SW_VERSION in public/sw.js for offline.html).`,
    );
  });
}

/**
 * DRIFT TRIPWIRE for public/html/_persistence.js: it can't import theme.ts
 * either, and it keeps its own copy of the default and the meta colours for
 * storage/OS events after load. The wave 5 flip to "system" must change it
 * too, and this test says so.
 */
test("drift: public/html/_persistence.js matches DEFAULT_THEME_PREF and THEME_META_COLORS", async () => {
  const js = await readFile(new URL("public/html/_persistence.js", REPO_ROOT), "utf8");
  assert.ok(
    js.includes(`var _VIBE_THEME_DEFAULT = '${DEFAULT_THEME_PREF}';`),
    `public/html/_persistence.js: _VIBE_THEME_DEFAULT must equal DEFAULT_THEME_PREF ('${DEFAULT_THEME_PREF}').`,
  );
  assert.ok(
    js.includes(`var _VIBE_THEME_COLORS = { light: '${THEME_META_COLORS.light}', dark: '${THEME_META_COLORS.dark}' };`),
    "public/html/_persistence.js: _VIBE_THEME_COLORS must equal THEME_META_COLORS.",
  );
});
