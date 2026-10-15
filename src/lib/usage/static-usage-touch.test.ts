/**
 * Tests for `public/html/_usageTouch.js`, the twin of <ActivityTouch /> that
 * the static desktop profile runs (and messages.html, inside its frame, for
 * the Otto open alone). The file is plain browser script with no exports, so
 * each test runs it in a `node:vm` sandbox with a stand-in window, document
 * and screen, then moves the clock and fires the events a browser would.
 *
 * It also keeps the twin in step with `touch.ts`: the address, the gaps, the
 * storage keys and the device rule are read from the rules there (the
 * installed-app rule from display-mode.ts), never repeated.
 *
 * WHY THE RESOLVE HOOK: display-mode.ts imports "../native/detect" with no
 * extension, which Node's type stripping can't resolve on its own; the same
 * hook as display-mode.test.ts retries it with ".ts".
 *
 * Run with:
 *   node --test src/lib/usage/static-usage-touch.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("static-usage-touch.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const rules = (await import("./touch")) as typeof import("./touch");
const { isStandalone } = (await import("../pwa/display-mode")) as typeof import("../pwa/display-mode");
const { COARSE_QUERY, deviceClass, OPEN_AT_KEY_PREFIX, OPEN_EVERY_MS, PHONE_QUERY } = rules;
const { TOUCH_AT_KEY, TOUCH_EVERY_MS, TOUCH_PATH, TOUCH_TICK_MS } = rules;

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const SCRIPT = readRoot("public/html/_usageTouch.js");

const T0 = 1_780_000_000_000;
const SIGNED_IN = "vibe_theme=dark; sb-abcdefgh-auth-token.0=base64-xyz; sb-abcdefgh-auth-token.1=more";
const BROWSER_NAME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Distinctive/9.9";

type Screen = { standalone?: unknown; matchStandalone?: boolean; matchFullscreen?: boolean; coarse?: boolean; narrow?: boolean };
type Opts = { cookie?: string; framed?: boolean; blocked?: boolean; hidden?: boolean; screen?: Screen; session?: Record<string, string> };
type Handler = (event: Record<string, unknown>) => void;

/** A tab with the static page open: what is stored, what the screen is, and what was sent. */
function openPage(opts: Opts = {}) {
  const screen: Screen = { coarse: false, narrow: false, ...opts.screen };
  const session = new Map(Object.entries(opts.session ?? {}));
  const heard = new Map<string, Handler[]>();
  const hear = (where: string) => (type: string, fn: Handler) => {
    heard.set(`${where}:${type}`, [...(heard.get(`${where}:${type}`) ?? []), fn]);
  };
  const page = {
    now: T0,
    session,
    sent: [] as { url: string; init: Record<string, unknown> }[],
    asked: new Set<string>(),
    ticks: [] as { fn: () => void; ms: number }[],
    document: {
      visibilityState: opts.hidden ? "hidden" : "visible",
      cookie: opts.cookie ?? SIGNED_IN,
      addEventListener: hear("document"),
    },
    win: {} as Record<string, unknown>,
    bodies: () => page.sent.map((s) => String(s.init.body)),
    fire(target: string, over: Record<string, unknown> = {}) {
      for (const fn of heard.get(target) ?? []) fn({ type: target.split(":")[1], ...over });
    },
    /** Time passes and the tab is shown again. */
    comeBack(ms: number) {
      page.now += ms;
      page.document.visibilityState = "visible";
      page.fire("document:visibilitychange");
    },
    /** Time passes and the 30 s timer fires. */
    tick(ms = TOUCH_TICK_MS) {
      page.now += ms;
      for (const t of page.ticks) t.fn();
    },
    countOpen: (what: string) => (page.win.__vibeCountOpen as (w: string) => void)(what),
  };
  const matchMedia = (query: string) => {
    page.asked.add(query);
    const on: Record<string, boolean | undefined> = {
      "(display-mode: standalone)": screen.matchStandalone,
      "(display-mode: fullscreen)": screen.matchFullscreen,
      [COARSE_QUERY]: screen.coarse,
      [PHONE_QUERY]: screen.narrow,
    };
    return { matches: on[query] === true };
  };
  const storage = {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => void session.set(key, value),
  };
  const win = page.win;
  win.matchMedia = matchMedia;
  win.addEventListener = hear("window");
  Object.defineProperty(win, "sessionStorage", {
    get() {
      if (opts.blocked) throw new Error("SecurityError");
      return storage;
    },
  });
  win.self = win;
  win.top = opts.framed ? {} : win;
  const navigator: Record<string, unknown> = { userAgent: BROWSER_NAME, platform: "iPhone" };
  if (screen.standalone !== undefined) navigator.standalone = screen.standalone;
  runInNewContext(SCRIPT, {
    window: win,
    document: page.document,
    navigator,
    fetch: (url: string, init: Record<string, unknown>) => {
      page.sent.push({ url, init });
      return Promise.resolve({ ok: true });
    },
    setInterval: (fn: () => void, ms: number) => page.ticks.push({ fn, ms }),
    Date: { now: () => page.now },
  });
  return page;
}

/** Lets the promise chain behind a request run to its end. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((done) => setImmediate(done));
}

test("signed out: nothing leaves, not on load, not on return, not for an open", async () => {
  for (const cookie of ["", "vibe_theme=dark", "sb-abcdefgh-auth-token-code-verifier=x"]) {
    const page = openPage({ cookie });
    page.comeBack(TOUCH_EVERY_MS);
    page.tick();
    page.countOpen("otto");
    await settle();
    assert.equal(page.sent.length, 0, cookie);
  }
});

test("one check-in on load: the rules' address, a POST with the device kind and nothing else", async () => {
  const page = openPage();
  await settle();
  assert.equal(page.sent.length, 1);
  const [{ url, init }] = page.sent;
  assert.equal(url, TOUCH_PATH);
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  // From the sandbox's realm, so compared as JSON.
  assert.equal(JSON.stringify(init.headers), '{"content-type":"application/json"}');
  assert.equal(init.credentials, undefined, "the browser default: this site's cookies only");
  assert.equal(init.body, '{"device":"desktop"}');
  assert.equal(page.session.get(TOUCH_AT_KEY), String(T0));
  assert.deepEqual(page.ticks.map((t) => t.ms), [TOUCH_TICK_MS]);
});

test("the device kind matches touch.ts's deviceClass for every screen", async () => {
  const screens: Screen[] = [
    { coarse: true, narrow: true },
    { coarse: true, narrow: false },
    { coarse: false, narrow: true },
    { coarse: false, narrow: false },
    { matchStandalone: true },
    { matchStandalone: true, coarse: true, narrow: true },
    // An iPhone Home Screen app reports fullscreen with navigator.standalone.
    { standalone: true, coarse: true, narrow: true },
    { standalone: false, matchFullscreen: true, coarse: true, narrow: true },
    // Chrome full screen (F11, a video): not the installed app.
    { matchFullscreen: true },
  ];
  for (const screen of screens) {
    const page = openPage({ screen });
    await settle();
    const expected = deviceClass({
      standalone: isStandalone({
        navigatorStandalone: screen.standalone,
        matchStandalone: screen.matchStandalone === true,
        matchFullscreen: screen.matchFullscreen === true,
      }),
      coarsePointer: screen.coarse === true,
      narrow: screen.narrow === true,
    });
    assert.deepEqual(page.bodies(), [JSON.stringify({ device: expected })], JSON.stringify(screen));
  }
  // The same two questions as touch.ts, asked of the screen.
  const page = openPage({ screen: { coarse: true, narrow: true } });
  assert.ok(page.asked.has(COARSE_QUERY) && page.asked.has(PHONE_QUERY));
});

test("at most one check-in every four minutes per tab, and none while hidden", async () => {
  const page = openPage();
  page.tick();
  page.comeBack(1000);
  page.tick(TOUCH_EVERY_MS - TOUCH_TICK_MS - 1000 - 1);
  await settle();
  assert.equal(page.sent.length, 1);
  page.tick(1);
  await settle();
  assert.equal(page.sent.length, 2);
  // Hidden: the timer fires and nothing leaves; back on screen, it does.
  page.document.visibilityState = "hidden";
  page.tick(TOUCH_EVERY_MS);
  page.fire("document:visibilitychange");
  await settle();
  assert.equal(page.sent.length, 2);
  page.comeBack(0);
  await settle();
  assert.equal(page.sent.length, 3);
  // Back from the back-forward cache counts as a return; an ordinary load's pageshow does not.
  page.now += TOUCH_EVERY_MS;
  page.fire("window:pageshow", { persisted: false });
  assert.equal(page.sent.length, 3);
  page.fire("window:pageshow", { persisted: true });
  assert.equal(page.sent.length, 4);
});

test("opened in a background tab: nothing until it comes on screen", async () => {
  const page = openPage({ hidden: true });
  page.tick();
  await settle();
  assert.equal(page.sent.length, 0);
  page.comeBack(0);
  await settle();
  assert.deepEqual(page.bodies(), ['{"device":"desktop"}']);
});

test("the gap is the tab's: a check-in from a React page just now means none here", async () => {
  const page = openPage({ session: { [TOUCH_AT_KEY]: String(T0 - 1000) } });
  await settle();
  assert.equal(page.sent.length, 0);
  // A clock set back since then: due at once.
  const back = openPage({ session: { [TOUCH_AT_KEY]: String(T0 + 60_000) } });
  await settle();
  assert.equal(back.sent.length, 1);
});

test("storage blocked: it still checks in, and a note in memory holds the gap", async () => {
  const page = openPage({ blocked: true });
  page.tick();
  page.comeBack(TOUCH_EVERY_MS - TOUCH_TICK_MS - 1);
  await settle();
  assert.equal(page.sent.length, 1);
  page.tick(1);
  await settle();
  assert.equal(page.sent.length, 2);
});

test("Otto opens: one per tab every ten minutes, and each is a check-in too", async () => {
  const page = openPage({ screen: { coarse: true, narrow: true } });
  await settle();
  page.countOpen("otto");
  page.countOpen("otto");
  page.now += OPEN_EVERY_MS - 1;
  page.countOpen("otto");
  await settle();
  assert.deepEqual(page.bodies(), ['{"device":"phone"}', '{"device":"phone","open":"otto"}']);
  assert.equal(page.session.get(OPEN_AT_KEY_PREFIX + "otto"), String(T0));
  page.now += 1;
  page.countOpen("otto");
  // The open stamped the check-in gap: the next tick has nothing to send.
  page.tick();
  // Only the two opens there are; anything else is ignored.
  page.countOpen("settings");
  page.countOpen("map");
  await settle();
  assert.deepEqual(page.bodies().slice(2), [
    '{"device":"phone","open":"otto"}',
    '{"device":"phone","open":"map"}',
  ]);
  // The tick found nothing due; the map open stamped the gap again.
  assert.equal(page.sent.length, 4);
  assert.equal(page.session.get(TOUCH_AT_KEY), String(T0 + OPEN_EVERY_MS + TOUCH_TICK_MS));
});

test("inside a frame: no check-in of its own, but an Otto open still counts", async () => {
  const page = openPage({ framed: true });
  page.tick();
  page.comeBack(TOUCH_EVERY_MS);
  await settle();
  assert.equal(page.sent.length, 0);
  assert.equal(page.ticks.length, 0);
  page.countOpen("otto");
  await settle();
  assert.deepEqual(page.bodies(), ['{"device":"desktop","open":"otto"}']);
  // Hidden: not an open on screen.
  const hidden = openPage({ framed: true, hidden: true });
  hidden.countOpen("otto");
  assert.equal(hidden.sent.length, 0);
});

test("the browser's name never leaves, in any body", async () => {
  const page = openPage({ screen: { standalone: true, coarse: true, narrow: true } });
  page.countOpen("map");
  page.comeBack(TOUCH_EVERY_MS);
  await settle();
  assert.ok(page.sent.length >= 2);
  for (const body of page.bodies()) {
    assert.equal(body.includes("Mozilla") || body.includes("iPhone") || body.includes("Distinctive"), false, body);
    assert.ok(Object.keys(JSON.parse(body)).every((k) => k === "device" || k === "open"), body);
  }
});

test("loaded twice, it runs once", async () => {
  const page = openPage();
  await settle();
  const sentAgain: unknown[] = [];
  runInNewContext(SCRIPT, {
    window: page.win,
    document: page.document,
    navigator: {},
    fetch: (url: string) => sentAgain.push(url),
    setInterval: () => assert.fail("a second timer"),
    Date: { now: () => page.now + TOUCH_EVERY_MS },
  });
  assert.equal(page.win.__vibeUsageTouch, true);
  assert.equal(sentAgain.length, 0);
  assert.equal(page.sent.length, 1);
});

test("the static profile's panel: a 'Message' button opening it on Messages counts no Otto open", async () => {
  // openOttoPanel's first line, run as _otto.js runs it, against this twin.
  const otto = readRoot("public/html/_otto.js");
  const fn = otto.slice(otto.indexOf("function openOttoPanel() {"));
  const guard = fn.split("\n").find((line) => line.includes("__vibeCountOpen"));
  assert.ok(guard, "openOttoPanel counts the open");
  for (const [tab, opens] of [["messages", 0], ["otto", 1], [null, 1]] as const) {
    const page = openPage({ session: { [TOUCH_AT_KEY]: String(T0) } });
    // _miniMessenger.js sets the tab before it opens the panel; null: no Messages on this page.
    if (tab) page.win.__vibeOttoTab = () => tab;
    runInNewContext(guard, { window: page.win });
    await settle();
    assert.equal(page.bodies().filter((b) => b.includes('"open":"otto"')).length, opens, String(tab));
  }
});

test("profile.html and messages.html load it once, deferred, before _otto.js", () => {
  for (const file of ["public/html/profile.html", "public/html/messages.html"]) {
    const html = readRoot(file);
    const tag = '<script src="/html/_usageTouch.js" defer></script>';
    assert.equal(html.split(tag).length - 1, 1, file);
    assert.equal(html.split("_usageTouch.js").length - 1, 1, file);
    assert.ok(html.indexOf(tag) < html.indexOf('<script src="/html/_otto.js"'), file);
  }
  const profile = readRoot("public/html/profile.html");
  assert.ok(profile.indexOf("_buildRefresh.js") < profile.indexOf("_usageTouch.js"));
});

test("the twin repeats touch.ts's constants word for word", () => {
  const constants: Record<string, string> = {
    TOUCH_PATH: JSON.stringify(TOUCH_PATH),
    TOUCH_AT_KEY: JSON.stringify(TOUCH_AT_KEY),
    OPEN_AT_KEY_PREFIX: JSON.stringify(OPEN_AT_KEY_PREFIX),
    PHONE_QUERY: JSON.stringify(PHONE_QUERY),
    COARSE_QUERY: JSON.stringify(COARSE_QUERY),
  };
  for (const [name, value] of Object.entries(constants)) {
    assert.ok(SCRIPT.includes(`const ${name} = ${value};`), name);
  }
  const ms = (name: string) => {
    const m = new RegExp(`const ${name} = ([\\d\\s*]+);`).exec(SCRIPT);
    assert.ok(m, name);
    return m[1].split("*").reduce((acc, n) => acc * Number(n.trim()), 1);
  };
  assert.equal(ms("TOUCH_EVERY_MS"), TOUCH_EVERY_MS);
  assert.equal(ms("TOUCH_TICK_MS"), TOUCH_TICK_MS);
  assert.equal(ms("OPEN_EVERY_MS"), OPEN_EVERY_MS);
  assert.ok(SCRIPT.includes(`const OPENS = ${JSON.stringify([...rules.USAGE_OPENS]).replace(",", ", ")};`));
});
