// Which RSVP places refresh My Calendar? READ-ONLY: every RSVP PUT/DELETE is
// answered in the browser with {ok:true} (page.route), so no row is written.
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";

const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/calendar";
const who = process.argv[2] || "blake";
const cookieStr = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = cookieStr.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const log = [];
await ctx.route("**/api/events/*/rsvp", async (route) => {
  log.push(`MOCKED ${route.request().method()} ${new URL(route.request().url()).pathname}`);
  await route.fulfill({ status: 200, json: { ok: true } });
});
// The local Events tab is empty for every seed account, so the campus list is
// answered with test_open_club's own list (a read), in the browser only.
await ctx.route(/\/api\/events\?limit=50(&|$)/, async (route) => {
  const res = await route.fetch({ url: "http://localhost:3000/api/events?limit=50&org_id=cbde0202-311a-4dad-9af1-08c08f99d009" });
  await route.fulfill({ response: res });
});
const page = await ctx.newPage();
page.on("request", (r) => { if (r.url().includes("/api/me/calendar")) log.push(`GET ${new URL(r.url()).pathname}${new URL(r.url()).search ? "?…" : ""} frame=${r.frame() === page.mainFrame() ? "main" : "iframe"}`); });

// 1. Desktop /campus, Events tab: click Going on the first card.
await page.goto("http://localhost:3000/campus?tab=events", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForSelector('[id^="event-"]', { timeout: 30000 });
await page.waitForTimeout(1500);
log.push("--- click Interested on /campus Events (blake is Going; mocked PUT)");
const going = page.locator('[id^="event-"] button', { hasText: /^Interested/ }).first();
if (await going.count()) { await going.click(); await page.waitForTimeout(1500); } else log.push("no Going button found");

// 2. Desktop /profile (static profile.html): open the calendar icon.
log.push("--- open /profile calendar icon");
await page.goto("http://localhost:3000/profile", { waitUntil: "load" });
await page.waitForTimeout(3000);
log.push(`profile url now ${page.url().replace("http://localhost:3000", "")}`);
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
const calBtn = page.locator('button[aria-label="Calendar"]').first();
if (await calBtn.count()) {
  await calBtn.click();
  await page.waitForTimeout(1200);
  const pills = await page.locator("#modalCalGrid .cal-modal-event-pill").count();
  const ls = await page.evaluate(() => { try { return localStorage.getItem("vibe_cal_events_v1"); } catch { return "err"; } });
  log.push(`profile modal pills=${pills} localStorage vibe_cal_events_v1=${ls}`);
  await page.screenshot({ path: `${OUT}/profile-static-calendar-1440.png` });
} else log.push("no calendar button on profile");

for (const l of log) console.log(l);
await browser.close();
