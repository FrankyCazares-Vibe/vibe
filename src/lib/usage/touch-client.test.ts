/**
 * Tests for src/lib/usage/touch-client.ts, the browser half every React page
 * runs (<ActivityTouch />, the Campus header, and `countOpen` in OttoSwitch,
 * OttoSidePanel, CampusMobile and MapTabBody). Its twin on the static
 * profile has its own tests (static-usage-touch.test.ts); these run the
 * React file's own gates and gaps against a stand-in window, document,
 * screen, clock and fetch.
 *
 * Each test loads a fresh copy of the module (a query on its URL), since it
 * keeps the request in flight and the memory fallback at module level.
 *
 * WHY THE RESOLVE HOOK: touch-client.ts imports "@/lib/..." and
 * display-mode.ts imports "../native/detect" with no extension; both are
 * resolved to their .ts files, as in otto-unread-route.test.ts.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/touch-client.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("touch-client.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const rules = (await import("./touch")) as typeof import("./touch");
const { COARSE_QUERY, deviceClass, OPEN_AT_KEY_PREFIX, OPEN_EVERY_MS, PHONE_QUERY, TOUCH_AT_KEY, TOUCH_EVERY_MS, TOUCH_PATH, touchBody } = rules;
type Client = typeof import("./touch-client");

const T0 = 1_780_000_000_000;
const SIGNED_IN = "vibe_theme=dark; sb-abcdefgh-auth-token.0=base64-xyz";
const BROWSER_NAME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Distinctive/9.9";

type Screen = { standalone?: unknown; matchStandalone?: boolean; coarse?: boolean; narrow?: boolean };
type Opts = { cookie?: string; hidden?: boolean; blocked?: boolean; screen?: Screen; hold?: boolean; reject?: boolean };

let loads = 0;

/** A tab: the globals touch-client.ts reads, a fresh copy of it, and what it sent. */
async function openTab(opts: Opts = {}) {
  const screen: Screen = { coarse: false, narrow: false, ...opts.screen };
  const session = new Map<string, string>();
  const tab = {
    now: T0,
    session,
    sent: [] as { url: string; init: RequestInit }[],
    release: [] as (() => void)[],
    document: { visibilityState: opts.hidden ? "hidden" : "visible", cookie: opts.cookie ?? SIGNED_IN },
    bodies: () => tab.sent.map((s) => String(s.init.body)),
  };
  const storage = {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => void session.set(key, value),
  };
  const on: Record<string, boolean | undefined> = {
    "(display-mode: standalone)": screen.matchStandalone,
    [COARSE_QUERY]: screen.coarse,
    [PHONE_QUERY]: screen.narrow,
  };
  const win = { matchMedia: (q: string) => ({ matches: on[q] === true }) } as Record<string, unknown>;
  Object.defineProperty(win, "sessionStorage", {
    get() {
      if (opts.blocked) throw new Error("SecurityError");
      return storage;
    },
  });
  const nav: Record<string, unknown> = { userAgent: BROWSER_NAME, platform: "iPhone", vendor: "Distinctive" };
  if (screen.standalone !== undefined) nav.standalone = screen.standalone;
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.document = tab.document;
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  g.fetch = (url: string, init: RequestInit) => {
    tab.sent.push({ url, init });
    if (opts.reject) return Promise.reject(new TypeError("offline"));
    if (!opts.hold) return Promise.resolve({ ok: true });
    return new Promise((resolve) => tab.release.push(() => resolve({ ok: true })));
  };
  Date.now = () => tab.now;
  loads += 1;
  const client = (await import(`./touch-client.ts?tab=${loads}`)) as Client;
  return { tab, client };
}

const PHONE = { coarse: true, narrow: true };

test("signed out, or not on screen: nothing leaves, for a check-in or an open", async () => {
  for (const opts of [{ cookie: "vibe_theme=dark" }, { cookie: "" }, { hidden: true }] as Opts[]) {
    const { tab, client } = await openTab(opts);
    await client.touchActivity();
    client.countOpen("map");
    client.countOpen("otto");
    assert.deepEqual(tab.sent, [], JSON.stringify(opts));
    assert.equal(tab.session.size, 0, "nothing stamped either");
  }
});

test("one check-in, then none for four minutes, then one again; a clock set back counts as due", async () => {
  const { tab, client } = await openTab({ screen: PHONE });
  await client.touchActivity();
  assert.equal(tab.sent.length, 1);
  assert.equal(tab.sent[0].url, TOUCH_PATH);
  assert.deepEqual(
    { method: tab.sent[0].init.method, cache: tab.sent[0].init.cache, headers: tab.sent[0].init.headers },
    { method: "POST", cache: "no-store", headers: { "content-type": "application/json" } },
  );
  assert.equal(tab.bodies()[0], touchBody("phone"));
  assert.equal(tab.session.get(TOUCH_AT_KEY), String(T0));

  for (const later of [1, 30_000, TOUCH_EVERY_MS - 1]) {
    tab.now = T0 + later;
    await client.touchActivity();
  }
  assert.equal(tab.sent.length, 1, "quiet inside the four minutes");
  tab.now = T0 + TOUCH_EVERY_MS;
  await client.touchActivity();
  assert.equal(tab.sent.length, 2);
  tab.now = T0 - 60_000;
  await client.touchActivity();
  assert.equal(tab.sent.length, 3, "the clock went back");
});

test("two callers in the same moment share one request, and both wait for it", async () => {
  const { tab, client } = await openTab({ hold: true });
  let done = 0;
  const a = client.touchActivity().then(() => (done += 1));
  const b = client.touchActivity().then(() => (done += 1));
  await Promise.resolve();
  assert.equal(tab.sent.length, 1);
  assert.equal(done, 0, "neither is done before the answer");
  tab.release.forEach((r) => r());
  await Promise.all([a, b]);
  assert.equal(done, 2);
});

test("a failed request never rejects", async () => {
  const { tab, client } = await openTab({ reject: true });
  await client.touchActivity();
  assert.equal(tab.sent.length, 1);
});

test("storage blocked: a note in memory still keeps the gaps", async () => {
  const { tab, client } = await openTab({ blocked: true });
  await client.touchActivity();
  tab.now += 60_000;
  await client.touchActivity();
  client.countOpen("map");
  client.countOpen("map");
  assert.deepEqual(tab.bodies(), [touchBody("desktop"), touchBody("desktop", "map")]);
});

test("an open: once per feature per tab every ten minutes, and it is a check-in too", async () => {
  const { tab, client } = await openTab({ screen: PHONE });
  client.countOpen("map");
  assert.deepEqual(tab.bodies(), [touchBody("phone", "map")]);
  assert.equal(tab.session.get(`${OPEN_AT_KEY_PREFIX}map`), String(T0));
  assert.equal(tab.session.get(TOUCH_AT_KEY), String(T0), "the open stamps the check-in gap");
  await client.touchActivity();
  assert.equal(tab.sent.length, 1, "no separate check-in right after an open");

  tab.now = T0 + 60_000;
  client.countOpen("map");
  client.countOpen("otto");
  assert.deepEqual(tab.bodies().slice(1), [touchBody("phone", "otto")], "map gapped, otto has its own gap");

  tab.now = T0 + OPEN_EVERY_MS - 1;
  client.countOpen("map");
  assert.equal(tab.sent.length, 2);
  tab.now = T0 + OPEN_EVERY_MS;
  client.countOpen("map");
  assert.equal(tab.sent.length, 3);
});

test("the device kind is deviceClass of the screen, and no body carries the browser's name", async () => {
  const cases: [Screen, Parameters<typeof deviceClass>[0]][] = [
    [{}, { standalone: false, coarsePointer: false, narrow: false }],
    [PHONE, { standalone: false, coarsePointer: true, narrow: true }],
    [{ coarse: true, narrow: false }, { standalone: false, coarsePointer: true, narrow: false }],
    [{ coarse: false, narrow: true }, { standalone: false, coarsePointer: false, narrow: true }],
    [{ ...PHONE, matchStandalone: true }, { standalone: true, coarsePointer: true, narrow: true }],
    [{ ...PHONE, standalone: true }, { standalone: true, coarsePointer: true, narrow: true }],
  ];
  for (const [screen, env] of cases) {
    const { tab, client } = await openTab({ screen });
    assert.equal(client.currentDevice(), deviceClass(env), JSON.stringify(screen));
    await client.touchActivity();
    client.countOpen("otto");
    assert.deepEqual(tab.bodies(), [touchBody(deviceClass(env)), touchBody(deviceClass(env), "otto")]);
    for (const body of tab.bodies()) {
      assert.equal(body.includes("Distinctive") || body.includes("iPhone") || body.includes("Mozilla"), false, body);
      assert.deepEqual(Object.keys(JSON.parse(body)).sort(), body.includes("open") ? ["device", "open"] : ["device"]);
    }
  }
});
