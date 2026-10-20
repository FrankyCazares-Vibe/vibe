// Desktop Messages: does an RSVP from the club/event panel refresh My Calendar
// and the week band? READ-ONLY: the RSVP PUT/DELETE is answered in the browser.
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
  log.push(`MOCKED ${route.request().method()} rsvp`);
  await route.fulfill({ status: 200, json: { ok: true } });
});
const page = await ctx.newPage();
page.on("request", (r) => {
  if (r.url().includes("/api/me/calendar")) {
    const u = new URL(r.url());
    log.push(`GET /api/me/calendar${u.search ? " (week band, ranged)" : " (LeftNav)"} frame=${r.frame() === page.mainFrame() ? "main" : "iframe"}`);
  }
});
await page.goto("http://localhost:3000/messages?channel=bed10830-5563-41a8-b875-625e12eb0dde", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForTimeout(6000);
log.push("--- page settled; looking for an RSVP pill");
const pill = page.locator('button[aria-label*="RSVP" i], button[aria-label*="Going" i], button[aria-label*="Maybe" i]').first();
log.push(`pills found: ${await page.locator('button[aria-label*="RSVP" i], button[aria-label*="Going" i], button[aria-label*="Maybe" i]').count()}`);
if (await pill.count()) {
  log.push(`clicking pill: ${await pill.getAttribute("aria-label")}`);
  await pill.click();
  await page.waitForTimeout(800);
  const maybe = page.getByRole("button", { name: /^Maybe/ }).first();
  if (await maybe.count()) { await maybe.click(); await page.waitForTimeout(2000); } else log.push("no Maybe row in dialog");
}
await page.screenshot({ path: `${OUT}/messages-desktop-after-rsvp-1440.png` });
for (const l of log) console.log(l);
await browser.close();
