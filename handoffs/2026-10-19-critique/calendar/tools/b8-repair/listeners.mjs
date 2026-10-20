// Repair pass: the Otto-corner window's own home ("Your week") and Otto's
// Upcoming list follow an RSVP made elsewhere. blake, 1440. RSVP writes are
// answered in the browser (../b8-after/common.mjs); nothing is written.
import { BASE, OUT, REAL, launch, makeCtx, settle } from "../b8-after/common.mjs";

const theme = process.argv[2] || "night";
const browser = await launch();
const { ctx, log } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
await ctx.route(/\/api\/events\?limit=50(&|$)/, async (route) => {
  const res = await route.fetch({ url: `${BASE}/api/events?limit=50&org_id=cbde0202-311a-4dad-9af1-08c08f99d009` });
  await route.fulfill({ response: res });
});
// Otto's payload: the real answer, with the RSVPs made in this run on its
// event rows, so a re-read shows on screen.
let ottoReads = 0;
await ctx.route("**/api/me/otto", async (route) => {
  if (route.request().method() !== "GET") return route.continue();
  ottoReads++;
  const res = await route.fetch();
  const j = await res.json();
  const upcoming = [{ kind: "event", id: REAL.study, title: `Open Club Study Night (read ${ottoReads})`, starts_at: "2026-10-21T00:00:00.000Z", location: "Library", viewer_status: "maybe" }, ...(j.upcoming || []).filter((u) => u.id !== REAL.study)];
  await route.fulfill({ response: res, json: { ...j, upcoming } });
});

// 1. /campus with the Otto-corner window open on its home.
const main = await ctx.newPage();
await main.goto(`${BASE}/campus?tab=events`, { waitUntil: "load" });
await main.waitForSelector(`#event-${REAL.study}`, { timeout: 45000 });
await settle(main, 2500);
await main.locator('button[aria-label^="Open Otto"]').first().click();
await main.waitForTimeout(1500);
await main.getByRole("tab", { name: /^Messages/ }).first().click();
await main.waitForTimeout(5000);
const frame = await (await main.locator('iframe[src*="mini=1"]').first().elementHandle()).contentFrame();
let weekReads = 0;
main.on("request", (r) => { if (r.frame() === frame && r.url().includes("/api/me/calendar?from=")) weekReads++; });
const oct20 = () => frame.evaluate(() => [...document.querySelectorAll("button[aria-haspopup='dialog']")].map((b) => b.getAttribute("aria-label") || "").find((l) => l.startsWith("Tuesday, October 20")) ?? null);
console.log(theme, "corner home, Oct 20 before:", await oct20());
// The corner window's scrim covers the page here, so the tap is sent to the button itself.
await main.locator(`#event-${REAL.study} button`, { hasText: /^Interested/ }).first().evaluate((b) => b.click());
await main.waitForTimeout(3000);
console.log(theme, "Events tab Interested → corner week reads:", weekReads, "| Oct 20 now:", await oct20(), "|", log.slice(-1)[0]);
await main.screenshot({ path: `${OUT}/B8r-corner-home-${theme}-1440.png` });

// 2. /otto: an RSVP in another tab re-reads Upcoming.
const otto = await ctx.newPage();
await otto.goto(`${BASE}/otto`, { waitUntil: "load" });
await settle(otto, 3000);
const before = ottoReads;
const upText = () => otto.evaluate(() => document.body.innerText.match(/Open Club Study Night[^\n]*/)?.[0] ?? null);
console.log(theme, "/otto Upcoming before:", await upText(), "reads so far:", before);
await main.bringToFront();
await main.locator(`#event-${REAL.study} button`, { hasText: /^Going/ }).first().evaluate((b) => b.click());
await otto.bringToFront();
await otto.waitForTimeout(3000);
console.log(theme, "RSVP in the /campus tab → /otto reads:", ottoReads - before, "| Upcoming now:", await upText());
await otto.screenshot({ path: `${OUT}/B8r-otto-upcoming-${theme}-1440.png` });
await browser.close();
