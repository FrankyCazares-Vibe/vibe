// Phone 390x844 (iPhone UA), blake, Night and Light: Your week cards and the
// month list without a chat open the club page at the event (Events tab, card
// flashed). Calendar answers carry the synthetic rows (common.mjs).
import { BASE, OUT, REAL, launch, makeCtx, settle } from "./common.mjs";

const browser = await launch();
for (const theme of ["night", "light"]) {
  const { ctx } = await makeCtx(browser, "blake", { theme, width: 390, height: 844, phone: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/messages`, { waitUntil: "load" });
  await page.waitForSelector(`a[href*="event=${REAL.study}"]`, { timeout: 45000 });
  await settle(page, 1500);
  const cards = await page.evaluate(() => [...document.querySelectorAll('a[href*="?event="]')].map((a) => ({ label: a.getAttribute("aria-label")?.slice(0, 90), href: a.getAttribute("href"), w: Math.round(a.getBoundingClientRect().width) })));
  console.log(theme, "week links:", JSON.stringify(cards));
  console.log(theme, "page width", await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: `${OUT}/B8-phone-week-${theme}-390.png` });
  await page.locator(`a[href*="event=${REAL.study}"]`).first().click();
  await page.waitForURL(/\/orgs\/test_open_club\?event=/, { timeout: 30000 });
  await page.waitForSelector(`[data-event-anchor="${REAL.study}"]`, { timeout: 30000 });
  await settle(page, 900);
  const r = await page.evaluate((id) => {
    const el = document.querySelector(`[data-event-anchor="${id}"]`);
    const b = el.getBoundingClientRect();
    const tab = document.querySelector(".vibe-org-content")?.getAttribute("data-tab");
    return { tab, visible: b.height > 0, inView: b.top >= 0 && b.top < innerHeight, focused: document.activeElement === el, docW: document.documentElement.scrollWidth };
  }, REAL.study);
  console.log(theme, "phone club page:", JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/B8-phone-orglink-${theme}-390.png` });
  await ctx.close();
}
await browser.close();
