// Focus after Start and Stop, the sideways phone, and a long title (DOM text
// swapped in the page only). Door route stubbed in the browser: no writes.
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";
const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/shots";
const EVENT = "dfebb8db-c353-44ae-873f-8e1b9d390d40";
const s = execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs avery", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = s.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
function feed(open) {
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString(), st = now - (now % 30000);
  const step = (a, code) => ({ code, link: `http://localhost:3000/campus/checkin/${EVENT}?checkin=AbCdEfGhIjKlMnOpQrStUv${code}`, starts_at: iso(a), ends_at: iso(a + 30000) });
  return { event_id: EVENT, server_now: iso(now), count: 12, open, opens_at: iso(now - 1800000), closes_at: iso(now + 3 * 3600000), current: open ? step(st, "4812") : null, next: open ? step(st + 30000, "0937") : null };
}
const browser = await chromium.launch();
async function setup(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: "dark", ...extra });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  let open = false; const writes = [];
  await page.route("**/api/events/*/checkin/door*", async (r) => {
    const m = r.request().method();
    if (m === "POST") open = true; if (m === "DELETE") open = false;
    if (m !== "GET") writes.push("stubbed " + m);
    return r.fulfill({ json: { ok: true, door: feed(open) } });
  });
  await page.route("**/api/**", async (r) => (r.request().method() === "GET" || r.request().url().includes("/checkin/door")) ? r.fallback() : (writes.push("stubbed " + r.request().method() + " " + new URL(r.request().url()).pathname), r.fulfill({ json: { ok: true } })));
  return { ctx, page, writes, setOpen: (v) => { open = v; } };
}
// 1. focus
{
  const { ctx, page, writes } = await setup({ width: 1440, height: 900 });
  await page.goto(`http://localhost:3000/campus/checkin/${EVENT}/door`, { waitUntil: "load" });
  await page.waitForSelector("text=Start check-in");
  await page.click("text=Start check-in");
  await page.waitForSelector("text=Stop check-in");
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.click("text=Stop check-in");
  await page.waitForSelector("text=Start check-in");
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => document.activeElement?.textContent?.trim());
  const dones = await page.locator("main a", { hasText: "Done" }).count();
  console.log(JSON.stringify({ focusAfterStart: a, focusAfterStop: b, doneCount: dones, writes }));
  await ctx.close();
}
// 2. sideways phone, open
{
  const { ctx, page, writes, setOpen } = await setup({ width: 844, height: 390 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  setOpen(true);
  await page.goto(`http://localhost:3000/campus/checkin/${EVENT}/door`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForSelector("text=Stop check-in");
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => { const r = (q) => { const b = document.querySelector(q)?.getBoundingClientRect(); return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; return { docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, qr: r(".vibe-door-qr"), stop: r(".vibe-door-buttons button") }; });
  console.log("sideways", JSON.stringify(m), writes);
  await page.screenshot({ path: `${OUT}/B10-open-844x390-night.png` });
  await ctx.close();
}
// 3. long title at 390 (text swapped in the DOM only)
for (const theme of ["dark", "light"]) {
  const { ctx, page, setOpen } = await setup({ width: 390, height: 844 }, { colorScheme: theme, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("vibe_theme", t); } catch {} }, theme);
  setOpen(true);
  await page.goto(`http://localhost:3000/campus/checkin/${EVENT}/door`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForSelector("text=Stop check-in");
  await page.evaluate(() => { document.querySelector("main h1").textContent = "Paddy Murphy Pickleball Tournament and Homecoming Tailgate on the Lawn"; });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const h = document.querySelector("main h1").getBoundingClientRect(); const d = [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === "Done").getBoundingClientRect(); return { h1: [Math.round(h.x), Math.round(h.y), Math.round(h.width), Math.round(h.height)], done: [Math.round(d.x), Math.round(d.y), Math.round(d.width), Math.round(d.height)], docW: document.documentElement.scrollWidth }; });
  console.log("longtitle", theme, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/B10-open-390-longtitle-${theme === "dark" ? "night" : "light"}.png` });
  await ctx.close();
}
await browser.close();
