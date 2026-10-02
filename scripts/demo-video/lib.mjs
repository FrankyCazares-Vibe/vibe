// Shared setup for exploring and recording the demo on the LOCAL dev server.
import { execSync } from "node:child_process";
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";

export const BASE = process.env.DEMO_BASE ?? "http://localhost:3102";
export const SIZE = { width: 390, height: 844 };

/** A signed-in (or anonymous) phone-sized Night context. `video` = a folder to record into. */
export async function open({ who = null, video = null } = {}) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(BASE)) throw new Error("refusing: not a local dev server");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    timezoneId: "America/Indiana/Indianapolis",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ...(video ? { recordVideo: { dir: video, size: { width: SIZE.width * 2, height: SIZE.height * 2 } } } : {}),
  });
  if (who) {
    const raw = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
    await context.addCookies(raw.split("; ").map((p) => {
      const i = p.indexOf("=");
      return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE };
    }));
  }
  // Off camera: Next's dev badge and error overlay. On camera: a soft dot where a finger lands.
  await context.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = "nextjs-portal{display:none!important}.demo-tap{position:fixed;z-index:2147483647;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.28);border:1px solid rgba(255,255,255,.5);pointer-events:none;animation:demo-tap .55s ease-out forwards}@keyframes demo-tap{from{transform:scale(.5);opacity:1}to{transform:scale(1.25);opacity:0}}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));
    window.__demoTap = (x, y) => {
      const d = document.createElement("div");
      d.className = "demo-tap";
      d.style.left = x + "px";
      d.style.top = y + "px";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 700);
    };
  });
  const page = await context.newPage();
  return { browser, context, page };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tap a locator the way a finger would, with the dot. */
export async function tap(page, locator, { pause = 700 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("tap: nothing to tap");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(([a, b]) => window.__demoTap?.(a, b), [x, y]);
  await wait(180);
  await page.touchscreen.tap(x, y);
  await wait(pause);
}

/** A slow, eased scroll of the element under (x, y), or the page. */
export async function glide(page, dy, ms = 2400, at = [195, 500]) {
  await page.evaluate(async ([dy, ms, x, y]) => {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) break;
      el = el.parentElement;
    }
    const target = el && el !== document.body ? el : document.scrollingElement;
    const from = target.scrollTop, t0 = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        target.scrollTop = from + dy * e;
        u < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, [dy, ms, at[0], at[1]]);
}

/** The first match of a locator that is actually on screen (the campus panes sit side by side, all in the DOM). */
export async function onScreen(page, locator) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    const b = await locator.nth(i).boundingBox();
    if (b && b.x >= 0 && b.x + b.width <= SIZE.width + 1 && b.y >= 0 && b.y < SIZE.height) return locator.nth(i);
  }
  throw new Error("onScreen: no match is on screen");
}
