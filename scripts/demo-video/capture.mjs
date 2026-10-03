// capture.mjs — film the LOCAL demo frame by frame on a frozen (virtual) clock, at real 3x.
//
// How it works: the page's clock is frozen with the DevTools protocol (Emulation.setVirtualTimePolicy).
// For every film frame we move it on by exactly 1/60 s, run the page's animation-frame callbacks once
// (shim.mjs), take one screenshot at the device scale factor, and pipe the picture to ffmpeg. The machine's
// speed never shows: a frame that takes 300 ms to make is still 1/60 s of film. While a fetch is pending
// the clock stands still, so data loads take no film time at all.
//
// What was added to the prototype (the skeptics' conditions):
//   - nothing is filmed while the address is changing: recording stops at a tap that changes the route and
//     starts again on the settled screen (a hard cut); a frame taken at another address fails the take;
//   - a tap is touch-down and touch-up with no frame between them, it is checked to have landed, and it is
//     tried once more if it did not (moves.mjs); the frames of a tap that missed are thrown away;
//   - a watchdog: every protocol call, every wait and the whole take have a time limit, and running into
//     one stops the take with a sentence saying where, instead of filming dead frames;
//   - the page may write only what the story allows (`allow`); every other write is refused in the browser.
//
// Exports
//   start({ dir, scale, fps })          -> take          (one browser; frames go to "reels" in dir)
//   take.reel(name)                     open the next reel: <dir>/<name>.mkv, lossless
//   take.session({ who, allow })        -> session       (a phone-sized Night tab; who = "franky" or null)
//   take.finish() / take.abort()        close everything; finish returns the numbers
//   session.goto / settle / hold / until / waitFor / record / inMotion / mark / step   (see each function)
// LOCAL ONLY: loading this file with a DEMO_BASE that is not localhost throws (see BASE).
import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { pageDot, pageShim } from "./shim.mjs";

// LOCAL ONLY, checked here, when the file is loaded, so nothing in this folder can run against another host:
// plain http, the host exactly localhost or 127.0.0.1, no user name in front of it ("http://localhost:3102@evil.example").
const local = new URL(process.env.DEMO_BASE ?? "http://localhost:3102");
if (local.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(local.hostname) || local.username || local.password) {
  throw new Error(`refusing: DEMO_BASE (${local.origin}) is not a local dev server. The demo is filmed on http://localhost or http://127.0.0.1 only.`);
}
export const BASE = local.origin;
export const SIZE = { width: 390, height: 844 };
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// The watchdog's limits, in real milliseconds.
const LIMIT = {
  call: 20000, // one protocol call (a screenshot that never comes back is the known way this method hangs)
  stall: 45000, // one frame waiting on the network (a route compiling on the dev server)
  wait: 60000, // one settle / waitFor / until
};

/** The take failed for a reason the person filming can act on. */
export class TakeError extends Error {}

/** Reject after ms with a sentence that says what was being waited for. */
function limit(promise, ms, what) {
  let timer;
  const late = new Promise((_, no) => { timer = setTimeout(() => no(new TakeError(`watchdog: ${what} did not answer in ${ms / 1000} s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * Start a take: one browser, any number of sessions, the frames written reel by reel.
 *   scale 3 -> 1170x2532 real pixels (the page is laid out at 390x844 and drawn at that density)
 */
export async function start({ dir, scale = 3, fps = 60 } = {}) {
  if (!dir) throw new Error("start: dir is required");
  // Checker imaging lets a big picture arrive a frame late; with it off a picture is in the frame it belongs to.
  const browser = await chromium.launch({ args: ["--disable-checker-imaging", "--force-color-profile=srgb"] });
  const take = {
    dir, scale, fps, browser, version: browser.version(), t0: Date.now(),
    now: "starting", // what the take is doing, for the watchdog's sentence
    reels: [], current: null, frames: 0, steps: 0, shotMs: 0, skipped: 0, marks: [],
    hashes: [], // md5 of every picture kept, in order: two equal neighbours are a repeated frame
    refused: [], allowed: [], sockets: [], retries: [], cuts: [],
    /** Open the next reel. Frames are kept lossless here; cut.sh makes the two films from the reels. */
    async reel(name) {
      await take.endReel();
      const file = `${dir}/${name}.mkv`;
      const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
        "-an", "-c:v", "libx264rgb", "-preset", "ultrafast", "-qp", "0", "-r", String(fps), file], { stdio: ["pipe", "inherit", "inherit"] });
      take.current = { name, file, ff, frames: 0, from: take.frames };
      take.reels.push(take.current);
    },
    async endReel() {
      const r = take.current;
      if (!r) return;
      take.current = null;
      r.ff.stdin.end();
      const [code] = await limit(once(r.ff, "close"), 120000, `ffmpeg closing ${r.name}`);
      if (code !== 0) throw new TakeError(`ffmpeg failed on reel ${r.name} (exit ${code})`);
    },
    /** Keep one picture. With skipRepeat, a picture equal to the one before it is left out (returns false). */
    async write(buf, skipRepeat = false) {
      const r = take.current;
      if (!r) throw new Error("write: no reel is open");
      const hash = createHash("md5").update(buf).digest("hex");
      if (skipRepeat && r.frames > 0 && hash === take.hashes.at(-1)) { take.skipped++; return false; }
      take.frames++;
      r.frames++;
      take.hashes.push(hash);
      if (!r.ff.stdin.write(buf)) await limit(once(r.ff.stdin, "drain"), LIMIT.call, "ffmpeg taking a frame");
      return true;
    },
    /** How many frames in [from, to) differ from the frame before them. */
    unique(from, to = take.frames) { let u = 0; for (let i = Math.max(1, from); i < to; i++) if (take.hashes[i] !== take.hashes[i - 1]) u++; return u; },
    mark(name) { take.marks.push({ name, reel: take.current?.name ?? null, frame: take.current?.frames ?? 0 }); },
    session: (opts) => openSession(take, opts),
    async finish() {
      await take.endReel();
      await browser.close();
      return {
        browser: take.version, size: `${SIZE.width * scale}x${SIZE.height * scale}`, fps,
        reels: take.reels.map((r) => ({ name: r.name, file: r.file, frames: r.frames, seconds: +(r.frames / fps).toFixed(3) })),
        frames: take.frames, steps: take.steps, wallSeconds: +((Date.now() - take.t0) / 1000).toFixed(1),
        screenshotMsAvg: +(take.shotMs / Math.max(1, take.frames)).toFixed(1),
        repeatsLeftOut: take.skipped, marks: take.marks, cuts: take.cuts, retries: take.retries, writesAllowed: take.allowed, writesRefused: take.refused, webSockets: [...new Set(take.sockets)],
      };
    },
    /** Stop at once after a failure: no half-written reel is left looking like a film. */
    async abort() {
      for (const r of take.reels) { try { r.ff.kill("SIGKILL"); } catch {} }
      await browser.close().catch(() => {});
    },
  };
  return take;
}

/**
 * The sign-in cookie of a cast member, from the project's own local tool. One sign-in per person per run: the
 * warm-up and the take share it. `signIns` lists the sessions this run opened, so record.mjs can close them.
 */
const cookies = new Map();
export const signIns = [];
export function cookieFor(who) {
  if (!/^[a-z]+$/.test(who)) throw new Error("cookieFor: a first name, lower case");
  if (!cookies.has(who)) {
    const raw = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
    const parts = raw.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; });
    try { // the session's id is inside the token; no secret is printed or kept
      const token = JSON.parse(Buffer.from(parts.map((c) => c.value).join("").replace(/^base64-/, ""), "base64url").toString()).access_token;
      signIns.push(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id);
    } catch {
      console.error(`note: could not read the sign-in id out of ${who}'s cookie, so that sign-in will not be closed after the take`);
    }
    cookies.set(who, parts);
  }
  return cookies.get(who);
}

/**
 * The page may read anything. It may WRITE (any request that is not GET or HEAD) only what `allow` lists,
 * as regular expressions over "METHOD /path". Everything else is refused before it leaves the browser,
 * whichever host it is for: the app, the local Supabase, or anything outside.
 */
export async function guardWrites(context, take, allow = []) {
  await context.route("**/*", (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return route.continue();
    const url = new URL(req.url());
    const line = `${req.method()} ${url.origin === new URL(BASE).origin ? "" : url.origin}${url.pathname}`;
    if (url.origin === new URL(BASE).origin && url.pathname.startsWith("/__nextjs")) return route.continue(); // the dev server's own channel
    if (allow.some((re) => re.test(line))) { take.allowed.push(line); return route.continue(); }
    take.refused.push(line);
    return route.abort();
  });
}

/** A phone-sized Night tab on the virtual clock. who = a cast first name ("franky") or null for signed out. */
async function openSession(take, { who = null, allow = [] } = {}) {
  const { fps, scale } = take;
  const context = await take.browser.newContext({
    viewport: SIZE, deviceScaleFactor: scale, isMobile: true, hasTouch: true, colorScheme: "dark",
    timezoneId: "America/Indiana/Indianapolis", userAgent: UA,
  });
  if (who) await context.addCookies(cookieFor(who));
  await guardWrites(context, take, allow);
  await context.addInitScript(pageShim);
  await context.addInitScript(pageDot);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const send = (method, params, ms = LIMIT.call) => limit(cdp.send(method, params), ms, `${method} (${take.now})`);

  // Page.captureScreenshot only honours the device scale factor set on ITS OWN protocol session.
  await send("Emulation.setDeviceMetricsOverride", { width: SIZE.width, height: SIZE.height, deviceScaleFactor: scale, mobile: true, screenWidth: SIZE.width, screenHeight: SIZE.height });

  // What is still loading (websockets are not counted: they never finish).
  const pending = new Map();
  await send("Network.enable");
  cdp.on("Network.requestWillBeSent", (e) => { if (!/^(data|blob):/.test(e.request.url)) pending.set(e.requestId, e.request.url); });
  // A fetch whose body the page never reads never reports "finished": headers are enough.
  cdp.on("Network.responseReceived", (e) => { if (/^(Fetch|XHR|Ping|EventSource|Other)$/.test(e.type)) pending.delete(e.requestId); });
  cdp.on("Network.webSocketCreated", (e) => take.sockets.push(e.url.replace(/\?.*/, "")));
  cdp.on("Network.loadingFinished", (e) => pending.delete(e.requestId));
  cdp.on("Network.loadingFailed", (e) => pending.delete(e.requestId));

  // Freeze CSS / WAAPI animations (shim.mjs moves them, one frame per step), then freeze the clock.
  await send("Animation.enable");
  await send("Animation.setPlaybackRate", { playbackRate: 0 });
  await send("Emulation.setVirtualTimePolicy", { policy: "pause" });

  let recording = false, address = null, n = 0, trial = null, moving = false;

  /** Move the page's clock on by ms. It stands still while fetches are pending; a stall past the limit fails the take. */
  async function advance(ms) {
    const expired = new Promise((res) => cdp.once("Emulation.virtualTimeBudgetExpired", res));
    await send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: ms });
    await limit(expired, LIMIT.stall, `the clock (${take.now}); still loading: ${[...pending.values()].slice(0, 4).join(", ") || "nothing listed"}`);
  }
  /** One film frame: clock + 1/fps, animation-frame callbacks once, a screenshot if recording. */
  async function step() {
    await advance((Math.round(((n + 1) * 1e6) / fps) - Math.round((n * 1e6) / fps)) / 1000);
    n++;
    await send("Runtime.evaluate", { expression: "window.__vt ? window.__vt.frame() : -1", returnByValue: true }).catch((e) => { if (e instanceof TakeError) throw e; });
    take.steps++;
    if (!recording) return;
    if (page.url() !== address) throw new TakeError(`a frame was about to be filmed while the address was changing (${address} -> ${page.url()}) during: ${take.now}`);
    const t = Date.now();
    const { data } = await send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    take.shotMs += Date.now() - t;
    const buf = Buffer.from(data, "base64");
    if (trial) trial.push(buf); else await take.write(buf, moving);
  }
  const frames = (ms) => Math.round((ms * fps) / 1000);
  /** Let ms of film time pass. */
  async function hold(ms) { for (let i = frames(ms); i > 0; i--) await step(); }

  /** Step until check() is true. Returns false (it does not throw) when `max` frames pass first. */
  async function until(check, { max = 120 } = {}) {
    const t = Date.now();
    for (let i = 0; i <= max; i++) {
      if (await check().catch(() => false)) return true;
      if (Date.now() - t > LIMIT.wait) throw new TakeError(`watchdog: gave up after ${LIMIT.wait / 1000} s waiting for: ${take.now}`);
      await step();
    }
    return false;
  }
  async function waitFor(check, what, opts) {
    take.now = what;
    if (!(await until(check, opts))) throw new TakeError(`never happened: ${what} (${page.url()})`);
  }
  /** Step until a Node-side promise settles (a full page load, for example). */
  async function drive(promise, what) {
    let state = 0, value;
    promise.then((v) => { state = 1; value = v; }, (e) => { state = 2; value = e; });
    take.now = what;
    const t = Date.now();
    while (state === 0) {
      if (Date.now() - t > LIMIT.wait) throw new TakeError(`watchdog: gave up after ${LIMIT.wait / 1000} s on: ${what}`);
      await step();
    }
    if (state === 2) throw value;
    return value;
  }

  /**
   * Step until the screen is finished: nothing loading, fonts in, every picture on screen in, nothing sliding
   * or fading, the words on the page no longer changing, and `screen()` true, for `quiet` frames in a row.
   * Call it off the record.
   * `screen` is the positive test for the screen you mean to film (its real rows, not its loading shapes).
   */
  async function settle(what, screen = null, { quiet = 12, max = 900 } = {}) {
    take.now = `settling: ${what}`;
    const look = () => {
      const pictures = [...document.images].every((im) => { const r = im.getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width === 0 || (im.complete && im.naturalWidth > 0); });
      // A drawer still sliding in, a pane still fading: any animation that ends is still running. (Ones that loop for ever do not count.)
      const still = document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().endTime === Infinity);
      return document.readyState === "complete" && document.fonts.status === "loaded" && pictures && still && window.__vt.scrolling() === 0 ? document.body.innerText.length : -1;
    };
    const t = Date.now();
    let run = 0, words = -2;
    for (let i = 0; i <= max; i++) {
      const now = pending.size === 0 ? await page.evaluate(look).catch(() => -1) : -1;
      const ok = now >= 0 && now === words && (!screen || (await screen().catch(() => false)));
      words = now;
      run = ok ? run + 1 : 0;
      if (run >= quiet) return;
      if (Date.now() - t > LIMIT.wait) break;
      await step();
    }
    throw new TakeError(`the screen never settled: ${what} (${page.url()}); still loading: ${[...pending.values()].slice(0, 4).join(", ") || "nothing"}`);
  }

  /** Open a URL with a full page load. until "paint" returns at the first paint (to film a page from its first frame). */
  async function goto(path, { until: stop = "load" } = {}) {
    await drive(page.goto(BASE + path, { waitUntil: "commit" }), `opening ${path}`);
    await waitFor(() => page.evaluate(() => performance.getEntriesByType("paint").some((e) => e.name === "first-contentful-paint")), `first paint of ${path}`, { max: 600 });
    if (stop === "paint") return;
    await waitFor(() => page.evaluate(() => document.readyState === "complete"), `${path} loaded`, { max: 600 });
  }

  return {
    page, cdp, context, pending, take,
    goto, settle, hold, until, waitFor, drive, step, frames,
    /** Frames are only kept while recording. Turning it on notes the address: it must not change while filming. */
    record(on) {
      recording = !!on;
      address = on ? page.url() : null;
      if (on && take.current) take.cuts.push({ reel: take.current.name, frame: take.current.frames }); // where a cut lands, for checking
    },
    get recording() { return recording; },
    /** The address changed on purpose without leaving the screen (a chip that rewrites the URL): accept it. */
    sameScreen() { if (recording) address = page.url(); },
    /**
     * While on, a frame that shows the same picture as the one before it is not kept. For a scroll: its eased
     * first and last steps move less than a third of a pixel, and on film that reads as a stutter.
     */
    inMotion(on) { moving = !!on; },
    /** A trial holds frames back until the move they belong to is known to have worked. */
    begin() { trial = []; },
    async keep() { const held = trial ?? []; trial = null; for (const buf of held) await take.write(buf); },
    drop() { const dropped = trial?.length ?? 0; trial = null; return dropped; },
    mark: (name) => take.mark(name),
    close: () => context.close(),
  };
}
