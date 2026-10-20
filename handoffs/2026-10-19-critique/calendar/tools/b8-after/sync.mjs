// Does My Calendar update after an RSVP from: the Events tab, the Messages
// club panel, the Otto-corner window, and a second tab? RSVPs are mocked in
// the browser (common.mjs); the calendar mock reflects them. blake, 1440.
import { BASE, OUT, REAL, launch, makeCtx, settle } from "./common.mjs";

const theme = process.argv[2] || "night";
const browser = await launch();
const { ctx, log } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
// The local Events tab is empty for seed accounts: answer it with the club's own list (a read).
await ctx.route(/\/api\/events\?limit=50(&|$)/, async (route) => {
  const res = await route.fetch({ url: `${BASE}/api/events?limit=50&org_id=cbde0202-311a-4dad-9af1-08c08f99d009` });
  await route.fulfill({ response: res });
});
const main = await ctx.newPage();
let navGets = 0;
main.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname === "/api/me/calendar" && !u.search && r.frame() === main.mainFrame()) navGets++;
});
const studyKind = () => main.evaluate((id) => {
  const b = [...document.querySelectorAll("aside button[aria-label]")].find((x) => x.getAttribute("aria-label").startsWith("Tue Oct 20 2026"));
  return b ? b.getAttribute("aria-label") : null;
}, REAL.study);
async function step(name, fn) {
  const before = navGets;
  await fn();
  await main.waitForTimeout(2500);
  console.log(theme, name, "→ LeftNav calendar reads:", navGets - before, "| Oct 20 says:", await studyKind(), "|", log.slice(-1)[0] ?? "");
}

// 1. The Events tab on /campus.
await main.goto(`${BASE}/campus?tab=events`, { waitUntil: "load" });
await main.waitForSelector(`#event-${REAL.study}`, { timeout: 45000 });
await settle(main, 2500);
console.log(theme, "start | Oct 20 says:", await studyKind(), "| visibility", await main.evaluate(() => document.visibilityState));
await step("1 Events tab: Interested", () => main.locator(`#event-${REAL.study} button`, { hasText: /^Interested/ }).first().click());

// 2. A second tab (the club page): Going there, the first tab hears it.
const tab2 = await ctx.newPage();
await tab2.goto(`${BASE}/orgs/test_open_club`, { waitUntil: "load" });
await tab2.waitForSelector(`#event-${REAL.study}`, { timeout: 30000 });
await tab2.waitForTimeout(1500);
console.log(theme, "tab visibility main/tab2:", await main.evaluate(() => document.visibilityState), await tab2.evaluate(() => document.visibilityState));
await step("2 second tab: Going", () => tab2.locator(`#event-${REAL.study} button`, { hasText: /^Going/ }).first().click());
await tab2.close();

// 3. The Otto-corner window (an iframe of /messages?mini=1): RSVP inside it.
await main.bringToFront();
const orb = main.locator('button[aria-label^="Open Otto"]').first();
await orb.click();
await main.waitForTimeout(1500);
await main.getByRole("tab", { name: /^Messages/ }).first().click();
await main.waitForTimeout(3000);
const frame = await (await main.locator('iframe[src*="mini=1"]').first().elementHandle()).contentFrame();
await frame.goto(`${BASE}/messages?mini=1&channel=${REAL.gameRoom}`, { waitUntil: "load" });
await main.waitForTimeout(5000);
await frame.locator('button[aria-label*="RSVP" i]').first().click();
await main.waitForTimeout(1200);
const gameKind = () => main.evaluate(() => [...document.querySelectorAll("aside button[aria-label]")].find((x) => x.getAttribute("aria-label").startsWith("Thu Oct 15 2026"))?.getAttribute("aria-label"));
console.log(theme, "Oct 15 before:", await gameKind());
const before = navGets;
await frame.getByRole("button", { name: /^Interested/ }).first().click();
await main.waitForTimeout(2500);
console.log(theme, "3 Otto-corner window: Interested → LeftNav calendar reads:", navGets - before, "| Oct 15 says:", await gameKind(), "|", log.slice(-1)[0]);
await main.screenshot({ path: `${OUT}/B8-sync-mini-messenger-${theme}-1440.png` });

// 4. The desktop Messages club panel (/messages, the dialog).
await main.goto(`${BASE}/messages?channel=${REAL.gameRoom}`, { waitUntil: "load" });
await settle(main, 6000);
await step("4 Messages club panel: Going", async () => {
  await main.locator('button[aria-label*="RSVP" i]').first().click();
  await main.waitForTimeout(800);
  await main.getByRole("button", { name: /^Going/ }).last().click();
});

// 5. Back to the tab: no re-read within 30 s, one after.
const b5 = navGets;
await main.evaluate(() => window.dispatchEvent(new Event("focus")));
await main.waitForTimeout(800);
console.log(theme, "5 focus right away → reads:", navGets - b5);
await main.waitForTimeout(30500);
await main.evaluate(() => window.dispatchEvent(new Event("focus")));
await main.waitForTimeout(1500);
console.log(theme, "5 focus after 31 s → reads:", navGets - b5);
await browser.close();
