// B10 door screen shots. READ-ONLY: the door feed route is answered from the
// browser (page.route) for GET, and POST/DELETE are stubbed too, so nothing
// reaches the database. Usage: node door-shots.mjs <prefix> [states...]
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";

const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/shots";
const EVENT = "dfebb8db-c353-44ae-873f-8e1b9d390d40"; // Chat Seed Game Night (chat_seed_club)
const prefix = process.argv[2] || "B10-before";
const only = process.argv.slice(3);

function cookiesFor(who) {
  const s = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
  return s.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
}

function feedFor(state, count) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const stepStart = now - (now % 30000);
  const step = (s, code) => ({ code, link: `http://localhost:3000/campus/checkin/${EVENT}?checkin=AbCdEfGhIjKlMnOpQrStUv${code}`, starts_at: iso(s), ends_at: iso(s + 30000) });
  const base = { event_id: EVENT, server_now: iso(now), count, current: null, next: null, open: false };
  if (state === "before") return { ...base, opens_at: iso(now + 40 * 60000), closes_at: iso(now + 4 * 3600000) };
  if (state === "after") return { ...base, opens_at: iso(now - 5 * 3600000), closes_at: iso(now - 10 * 60000) };
  if (state === "closed") return { ...base, opens_at: iso(now - 30 * 60000), closes_at: iso(now + 3 * 3600000) };
  // Oct 19 re-review: an open feed whose last step ends 4 s from now (the
  // reads after it all fail, so the door runs out of codes).
  if (state === "stale") return { ...base, open: true, opens_at: iso(now - 30 * 60000), closes_at: iso(now + 3 * 3600000), current: step(now - 56000, "4812"), next: step(now - 26000, "0937") };
  return { ...base, open: true, opens_at: iso(now - 30 * 60000), closes_at: iso(now + 3 * 3600000), current: step(stepStart, "4812"), next: step(stepStart + 30000, "0937") };
}

const LONG = "Sigma Alpha Epsilon Fall Philanthropy Kickoff Night at the Canal";
const cases = [
  // [name, who, state, count, opts]
  ["open", "avery", "open", 12],
  ["start", "avery", "closed", 0],
  ["before", "avery", "before", 0],
  ["after", "avery", "after", 7],
  ["member", "blake", null, 0],
  ["after-nobody", "avery", "after", 0],
  // An officer by the page's check whose feed says org_role_required.
  ["refused", "avery", null, 0],
  // One good read, then every read fails (500): after 8 s no code is left.
  ["stale", "avery", "stale", 3, { failAfterFirst: true, wait: 8000 }],
  // One good read, then a failed one while the codes still work (DOOR_POLL_MS is 10 s).
  ["reconnecting", "avery", "open", 3, { failAfterFirst: true, wait: 11500 }],
  // Safari with its bars showing (iPhone 14/15, iPhone SE), short and long title.
  ["open-short", "avery", "open", 12, { sizes: ["390x664", "375x553"] }],
  ["open-short-long", "avery", "open", 12, { sizes: ["390x664", "375x553", "320x568"], title: LONG }],
];
const sizes = [["390", 390, 844, true], ["1440", 1440, 900, false]];
const sizeOf = (wh) => { const [w, h] = wh.split("x").map(Number); return [wh, w, h, w < 760]; };
const themes = ["night", "light"];

const browser = await chromium.launch();
const cookieCache = {};
const metrics = [];
for (const [name, who, state, count, opts = {}] of cases) {
  if (only.length && !only.includes(name)) continue;
  cookieCache[who] ??= cookiesFor(who);
  for (const [sz, w, h, phone] of opts.sizes ? opts.sizes.map(sizeOf) : sizes) {
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: theme === "night" ? "dark" : "light",
        ...(phone ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
      });
      await ctx.addCookies(cookieCache[who]);
      await ctx.addInitScript((t) => { try { localStorage.setItem("vibe_theme", t); } catch {} }, theme === "night" ? "dark" : "light");
      const page = await ctx.newPage();
      const writes = [];
      let cur = state;
      let reads = 0;
      await page.route("**/api/events/*/checkin/door*", async (route) => {
        const m = route.request().method();
        if (m !== "GET") writes.push("stubbed " + m + " door");
        if (opts.failAfterFirst && reads++ > 0) return route.fulfill({ status: 500, json: { ok: false, code: "request_failed" } });
        if (!cur) return route.fulfill({ status: 403, json: { ok: false, code: "org_role_required" } });
        if (m === "POST") cur = "open";
        if (m === "DELETE") cur = "closed";
        return route.fulfill({ json: { ok: true, door: feedFor(cur, count) } });
      });
      // Never let any other write through.
      await page.route("**/api/**", async (route) => {
        if (route.request().method() === "GET") return route.fallback();
        writes.push(route.request().method() + " " + new URL(route.request().url()).pathname);
        return route.fulfill({ json: { ok: true } });
      });
      await page.goto(`http://localhost:3000/campus/checkin/${EVENT}/door`, { waitUntil: "load" });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForTimeout(opts.wait ?? 1800);
      if (opts.title) await page.evaluate((t) => { document.querySelector("main h1").textContent = t; }, opts.title);
      const m = await page.evaluate(() => {
        const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
        const links = [...document.querySelectorAll("main a, main button")].map((e) => ({ t: e.textContent.trim(), r: r(e) }));
        return {
          docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, vh: innerHeight,
          theme: document.documentElement.dataset.theme,
          controls: links,
          qr: r(document.querySelector(".vibe-door-qr")),
          qrKids: document.querySelector(".vibe-door-qr")?.children.length ?? null,
          stopBottom: (() => { const b = [...document.querySelectorAll("main button")].find((e) => /Stop/.test(e.textContent)); return b ? Math.round(b.getBoundingClientRect().bottom) : null; })(),
          code: r(document.querySelector(".vibe-door-code")),
          h1: r(document.querySelector("main h1")),
        };
      });
      metrics.push({ shot: `${prefix}-${name}-${sz}-${theme}`, writes, ...m });
      await page.screenshot({ path: `${OUT}/${prefix}-${name}-${sz}-${theme}.png` });
      await ctx.close();
    }
  }
}
await browser.close();
for (const m of metrics) console.log(JSON.stringify(m));
