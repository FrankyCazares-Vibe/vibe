/**
 * Tests for `public/html/_buildRefresh.js`, the twin of BuildRefresh that
 * the static desktop profile runs. The file is plain browser script with no
 * exports, so each test runs it in a `node:vm` sandbox with a stand-in
 * window and document, then fires the events a browser would.
 *
 * It also keeps the twin in step with `build-refresh.ts`: the address, the
 * two-minute gap, the answer limit and both storage keys are read from the
 * rules here, never repeated.
 *
 * Run with:
 *   node --test src/lib/build/static-build-refresh.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const specifier = "./build-refresh.ts";
const rules = (await import(specifier)) as typeof import("./build-refresh");
const { ANSWER_WITHIN_MS, ASK_EVERY_MS, LOADED_BUILD_KEY, RELOADED_FOR_KEY, VERSION_PATH } = rules;

const root = new URL("../../../", import.meta.url);
const SCRIPT = readFileSync(new URL("public/html/_buildRefresh.js", root), "utf8");

const A = "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3";
const B = "dpl_9Qx2LkTrVb4mNc7ZsHy1JdWfEa6u";
const T0 = 1_780_000_000_000;

type Handler = (event: Record<string, unknown>) => void;
type El = Record<string, unknown>;

/** An element drawn in the middle of the window. */
function el(over: El = {}): El {
  return {
    nodeType: 1,
    tagName: "DIV",
    isConnected: true,
    isContentEditable: false,
    textContent: "",
    style: { position: "static", pointerEvents: "auto" },
    matches: () => false,
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ width: 300, height: 200, top: 100, left: 100, bottom: 300, right: 400 }),
    ...over,
  };
}

/** The static profile in a tab: what is stored, what is on the page, what the site answers. */
function openPage(opts: { session?: Record<string, string>; framed?: boolean; blocked?: boolean } = {}) {
  const session = new Map(Object.entries(opts.session ?? { [LOADED_BUILD_KEY]: A }));
  const heard = new Map<string, Handler[]>();
  const hear = (where: string) => (type: string, fn: Handler) => {
    heard.set(`${where}:${type}`, [...(heard.get(`${where}:${type}`) ?? []), fn]);
  };
  const page = {
    session,
    now: T0,
    /** The build the site answers with; `body` replaces the whole answer, `fails` drops the request. */
    live: B,
    body: undefined as unknown,
    fails: false,
    ok: true,
    offline: false,
    asks: [] as { url: string; init: Record<string, unknown> }[],
    timers: [] as number[],
    reloads: 0,
    guardAtReload: "",
    classes: new Set<string>(),
    /** What `querySelectorAll` finds, by the exact selector asked for. */
    found: {} as Record<string, El[]>,
    /** When set, the answer waits until `land()` is called. */
    land: null as null | (() => void),
    hold: false,
    document: {
      visibilityState: "visible",
      activeElement: null as El | null,
      body: { classList: { contains: (name: string) => page.classes.has(name) } },
      addEventListener: hear("document"),
      querySelectorAll: (selector: string) => page.found[selector] ?? [],
    },
    listening: () => heard.size,
    fire(target: string, over: Record<string, unknown> = {}) {
      const type = target.split(":")[1];
      for (const fn of heard.get(target) ?? []) fn({ type, isTrusted: true, target: page.document, ...over });
    },
    /** Two minutes pass (or `ms`), the person comes back, the answer lands. */
    async comeBack(ms = ASK_EVERY_MS) {
      page.now += ms;
      page.fire("document:visibilitychange");
      await settle();
    },
  };
  const storage = {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => void session.set(key, value),
  };
  const win: Record<string, unknown> = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: hear("window"),
    getComputedStyle: (node: El) => node.style,
    location: {
      reload: () => {
        page.reloads += 1;
        page.guardAtReload = session.get(RELOADED_FOR_KEY) ?? "";
      },
    },
  };
  Object.defineProperty(win, "sessionStorage", {
    get() {
      if (opts.blocked) throw new Error("SecurityError");
      return storage;
    },
  });
  win.self = win;
  win.top = opts.framed ? {} : win;
  const fetch = (url: string, init: Record<string, unknown>) => {
    page.asks.push({ url, init });
    const answer = () =>
      page.fails
        ? Promise.reject(new Error("Failed to fetch"))
        : Promise.resolve({ ok: page.ok, json: async () => page.body ?? { build: page.live } });
    if (!page.hold) return answer();
    return new Promise((resolve) => {
      page.land = () => resolve(answer());
    });
  };
  runInNewContext(SCRIPT, {
    window: win,
    document: page.document,
    navigator: { get onLine() { return !page.offline; } },
    fetch,
    AbortController,
    setTimeout: (_fn: () => void, ms: number) => page.timers.push(ms),
    clearTimeout: () => {},
    Date: { now: () => page.now },
  });
  return page;
}

/** Lets the promise chain behind an answer run to its end. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((done) => setImmediate(done));
}

test("nothing to compare: no build left for it, storage blocked, or inside a frame", () => {
  for (const page of [openPage({ session: {} }), openPage({ blocked: true }), openPage({ framed: true })]) {
    assert.equal(page.listening(), 0);
    assert.equal(page.asks.length, 0);
  }
  // Junk in the slot reads as nothing.
  assert.equal(openPage({ session: { [LOADED_BUILD_KEY]: "not an id" } }).listening(), 0);
});

test("never on a fresh page, and at most one ask every two minutes", async () => {
  const page = openPage();
  // The same build is live throughout: every answer means "stay".
  page.live = A;
  await page.comeBack(0);
  await page.comeBack(ASK_EVERY_MS - 1);
  assert.equal(page.asks.length, 0);
  await page.comeBack(1);
  assert.equal(page.asks.length, 1);
  await page.comeBack(5000);
  await page.comeBack(ASK_EVERY_MS - 5001);
  assert.equal(page.asks.length, 1);
  await page.comeBack(1);
  assert.equal(page.asks.length, 2);
  assert.equal(page.reloads, 0);
});

test("the ask: the rules' address, no cookie, no Referer, never cached, dropped when slow", async () => {
  const page = openPage();
  await page.comeBack();
  assert.equal(page.asks.length, 1);
  assert.equal(page.asks[0].url, VERSION_PATH);
  const { cache, credentials, referrerPolicy } = page.asks[0].init;
  assert.deepEqual({ cache, credentials, referrerPolicy }, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  assert.deepEqual(page.timers, [ANSWER_WITHIN_MS]);
});

test("another build is live and the page is idle: guard first, then one reload", async () => {
  const page = openPage();
  await page.comeBack();
  assert.equal(page.reloads, 1);
  assert.equal(page.guardAtReload, B);
  assert.equal(page.session.get(RELOADED_FOR_KEY), B);
  // Nothing after the reload is under way.
  await page.comeBack();
  assert.equal(page.reloads, 1);
});

test("the loop guard: never twice for the same build, again for the next", async () => {
  const page = openPage({ session: { [LOADED_BUILD_KEY]: A, [RELOADED_FOR_KEY]: B } });
  await page.comeBack();
  assert.equal(page.reloads, 0);
  page.live = "dpl_third";
  await page.comeBack();
  assert.equal(page.reloads, 1);
});

test("can't tell means stay: junk, an error page, a failed request, offline, hidden", async () => {
  const page = openPage();
  page.body = "<html>oops</html>";
  await page.comeBack();
  page.body = { build: 42 };
  await page.comeBack();
  page.body = undefined;
  page.ok = false;
  await page.comeBack();
  page.ok = true;
  page.fails = true;
  await page.comeBack();
  assert.equal(page.asks.length, 4);
  page.fails = false;
  page.offline = true;
  await page.comeBack();
  page.offline = false;
  page.document.visibilityState = "hidden";
  await page.comeBack();
  assert.equal(page.asks.length, 4);
  assert.equal(page.reloads, 0);
});

test("a clock set backwards asks instead of going silent", async () => {
  const page = openPage();
  await page.comeBack(-60 * 60 * 1000);
  assert.equal(page.asks.length, 1);
});

test("back from the back-forward cache counts as coming back; an ordinary load does not", async () => {
  const page = openPage();
  page.now += ASK_EVERY_MS;
  page.fire("window:pageshow", { persisted: false });
  await settle();
  assert.equal(page.asks.length, 0);
  page.fire("window:pageshow", { persisted: true });
  await settle();
  assert.equal(page.reloads, 1);
});

/** A newer build is live and the person comes back: did the page reload? */
async function reloadsWith(arrange: (page: ReturnType<typeof openPage>) => void): Promise<boolean> {
  const page = openPage();
  arrange(page);
  await page.comeBack();
  assert.equal(page.asks.length, 1);
  return page.reloads === 1;
}

test("idle rule: edit mode always holds the reload", async () => {
  assert.equal(await reloadsWith((page) => page.classes.add("edit-mode")), false);
  assert.equal(await reloadsWith((page) => page.classes.add("owner-mode")), true);
});

test("idle rule: anything drawn over the page holds it, the page's own furniture does not", async () => {
  const layer = (over: El = {}) => el({ style: { position: "fixed", pointerEvents: "auto" }, ...over });
  const withLayer = (node: El) => reloadsWith((page) => void (page.found["body *"] = [el(), node]));
  // A popup: this page marks none of them as dialogs.
  assert.equal(await withLayer(layer()), false);
  // The top bar, Otto's button, the back banner.
  assert.equal(await withLayer(layer({ matches: () => true })), true);
  // The custom cursor and a fading toast take no clicks.
  assert.equal(await withLayer(layer({ style: { position: "fixed", pointerEvents: "none" } })), true);
  // In the markup but not drawn, or see-through, or parked outside the window.
  assert.equal(await withLayer(layer({ getClientRects: () => [] })), true);
  assert.equal(await withLayer(layer({ checkVisibility: () => false })), true);
  const away = { width: 300, height: 800, top: 0, left: 1280, bottom: 800, right: 1580 };
  assert.equal(await withLayer(layer({ getBoundingClientRect: () => away })), true);
});

test("idle rule: a picked file, a local preview, a film playing, a marked dialog or menu", async () => {
  const find = (selector: string, node: El) => reloadsWith((page) => void (page.found[selector] = [node]));
  assert.equal(await find('input[type="file"]', el({ files: [1] })), false);
  assert.equal(await find('input[type="file"]', el({ files: [] })), true);
  assert.equal(await find("video, audio", el({ paused: false, ended: false })), false);
  assert.equal(await find("video, audio", el({ paused: true, ended: false })), true);
  const selectors = SCRIPT.match(/const (?:MARKED|LOCAL_PREVIEWS) = '([^']+)';/g) ?? [];
  assert.equal(selectors.length, 2);
  for (const line of selectors) {
    const selector = line.slice(line.indexOf("'") + 1, -2);
    assert.equal(await find(selector, el()), false, selector);
    assert.equal(await find(selector, el({ getClientRects: () => [] })), true, selector);
  }
});

test("idle rule: the cursor in a field with text, and what the person typed or changed", async () => {
  const field = (value: string, over: El = {}) => el({ tagName: "TEXTAREA", type: "textarea", value, ...over });
  assert.equal(await reloadsWith((page) => void (page.document.activeElement = field("half a post"))), false);
  // An empty field takes the cursor by itself and holds nothing back.
  assert.equal(await reloadsWith((page) => void (page.document.activeElement = field("  "))), true);

  const typed = field("");
  const type = (page: ReturnType<typeof openPage>, now: string, over: El = {}) => {
    page.fire("document:beforeinput", { target: typed, ...over });
    typed.value = now;
    page.fire("document:input", { target: typed, ...over });
  };
  assert.equal(await reloadsWith((page) => type(page, "hello")), false);
  // Typed and deleted again, or sent: back to what it held.
  typed.value = "";
  assert.equal(await reloadsWith((page) => (type(page, "oops"), void (typed.value = ""))), true);
  // A script filling a field is not the person.
  typed.value = "";
  assert.equal(await reloadsWith((page) => type(page, "filled in", { isTrusted: false })), true);
  // A field that has left the page (its popup closed) holds nothing.
  typed.value = "";
  assert.equal(await reloadsWith((page) => (type(page, "gone"), void (typed.isConnected = false))), true);
  // A pick-list or a checkbox the person changed counts until the next page load.
  const pick = el({ tagName: "SELECT", type: "select-one", value: "b" });
  assert.equal(await reloadsWith((page) => page.fire("document:change", { target: pick })), false);
  assert.equal(await reloadsWith((page) => page.fire("document:change", { target: pick, isTrusted: false })), true);
});

test("idle rule: a pressed file input holds it until it answers or the person is back", async () => {
  const input = () => el({ tagName: "INPUT", type: "file", files: [] });
  const press = (page: ReturnType<typeof openPage>, node: El, over: El = {}) =>
    page.fire("document:click", { target: node, ...over });
  // "+ Photo" pressed, the picker or camera open, nothing chosen yet.
  assert.equal(await reloadsWith((page) => press(page, input())), false);
  // The page's own `input.click()` is a script's click and counts the same.
  assert.equal(await reloadsWith((page) => press(page, input(), { isTrusted: false })), false);
  // A click on anything else opens no picker.
  assert.equal(await reloadsWith((page) => press(page, el({ tagName: "BUTTON", type: "submit" }))), true);
  assert.equal(await reloadsWith((page) => press(page, el({ tagName: "INPUT", type: "text", value: "" }))), true);
  // Closed with nothing chosen.
  const closed = input();
  assert.equal(await reloadsWith((page) => (press(page, closed), page.fire("document:cancel", { target: closed }))), true);
  // Another input's answer is not this one's.
  assert.equal(await reloadsWith((page) => (press(page, input()), page.fire("document:cancel", { target: input() }))), false);
  // No `cancel` in an older browser: the next tap or key press ends it, a scroll does not.
  for (const gesture of ["pointerdown", "touchstart", "keydown"]) {
    assert.equal(await reloadsWith((page) => (press(page, input()), page.fire(`document:${gesture}`))), true, gesture);
  }
  for (const gesture of ["wheel", "scroll"]) {
    assert.equal(await reloadsWith((page) => (press(page, input()), page.fire(`document:${gesture}`))), false, gesture);
  }
  // A script's fake tap is not the person.
  assert.equal(await reloadsWith((page) => (press(page, input()), page.fire("document:pointerdown", { isTrusted: false }))), false);
  // A file chosen: the picker is done, and the change itself holds from here on.
  const chosen = input();
  assert.equal(await reloadsWith((page) => (press(page, chosen), page.fire("document:change", { target: chosen }))), false);
});

test("never under the person's fingers: a tap, a key or a scroll while the answer is on its way", async () => {
  for (const gesture of ["pointerdown", "touchstart", "keydown", "wheel", "scroll"]) {
    const page = openPage();
    page.hold = true;
    await page.comeBack();
    page.fire(`document:${gesture}`);
    page.land?.();
    await settle();
    assert.equal(page.reloads, 0, gesture);
    // A script's fake tap is not the person.
    const other = openPage();
    other.hold = true;
    await other.comeBack();
    other.fire(`document:${gesture}`, { isTrusted: false });
    other.land?.();
    await settle();
    assert.equal(other.reloads, 1, gesture);
  }
  // Left the tab again before the answer came.
  const page = openPage();
  page.hold = true;
  await page.comeBack();
  page.document.visibilityState = "hidden";
  page.land?.();
  await settle();
  assert.equal(page.reloads, 0);
});

test("no guard, no reload: storage that drops the write", async () => {
  const page = openPage();
  page.session.set = () => page.session;
  await page.comeBack();
  assert.equal(page.asks.length, 1);
  assert.equal(page.reloads, 0);
});

test("profile.html loads the twin once, deferred", () => {
  const html = readFileSync(new URL("public/html/profile.html", root), "utf8");
  assert.deepEqual(html.match(/<script[^>]*_buildRefresh\.js[^>]*>/g), ['<script src="/html/_buildRefresh.js" defer>']);
  // The keys are the ones the app pages write and read.
  assert.ok(SCRIPT.includes(`"${LOADED_BUILD_KEY}"`) && SCRIPT.includes(`"${RELOADED_FOR_KEY}"`));
});
