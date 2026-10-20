// Desktop mini messenger (Otto corner iframe of /messages?mini=1): does an
// RSVP made inside it refresh the page's My Calendar? READ-ONLY (mocked PUT).
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";

const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/calendar";
const cookieStr = execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = cookieStr.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const log = [];
await ctx.route("**/api/events/*/rsvp", async (route) => {
  log.push(`MOCKED ${route.request().method()} rsvp from ${route.request().frame()?.url().replace("http://localhost:3000", "")}`);
  await route.fulfill({ status: 200, json: { ok: true } });
});
const page = await ctx.newPage();
page.on("request", (r) => {
  if (r.url().includes("/api/me/calendar")) log.push(`GET /api/me/calendar${new URL(r.url()).search ? " ranged" : ""} frame=${r.frame() === page.mainFrame() ? "MAIN (LeftNav)" : "iframe"}`);
});
await page.goto("http://localhost:3000/campus", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForTimeout(3000);
const orb = page.locator('button[aria-label^="Open Otto"]').first();
log.push(`orb: ${await orb.count()}`);
await orb.click();
await page.waitForTimeout(2000);
const msgTab = page.getByRole("tab", { name: /^Messages/ }).first();
log.push(`messages tab: ${await msgTab.count()}`);
if (await msgTab.count()) { await msgTab.click(); await page.waitForTimeout(4000); }
const frameEl = page.locator('iframe[src*="mini=1"]').first();
log.push(`mini iframe: ${await frameEl.count()}`);
if (await frameEl.count()) {
  const frame = await (await frameEl.elementHandle()).contentFrame();
  await frame.goto("http://localhost:3000/messages?mini=1&channel=bed10830-5563-41a8-b875-625e12eb0dde", { waitUntil: "load" });
  await page.waitForTimeout(6000);
  log.push("--- inside the mini messenger, event chat open");
  const pill = frame.locator('button[aria-label*="RSVP" i]').first();
  log.push(`pills in iframe: ${await frame.locator('button[aria-label*="RSVP" i]').count()}`);
  if (await pill.count()) {
    await pill.click();
    await page.waitForTimeout(1200);
    const maybe = frame.getByRole("button", { name: /^Maybe/ }).first();
    log.push(`Maybe rows: ${await frame.getByRole("button", { name: /^Maybe/ }).count()}`);
    if (await maybe.count()) { await maybe.click(); await page.waitForTimeout(2500); }
  }
}
await page.screenshot({ path: `${OUT}/mini-messenger-rsvp-1440.png` });
for (const l of log) console.log(l);
await browser.close();
