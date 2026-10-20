// Repair pass: two calendar changes back to back, the first read answering
// last. My Calendar must keep the newest answer. blake, 1440, Night.
import { BASE, launch, makeCtx, settle, REAL } from "../b8-after/common.mjs";
const browser = await launch();
const { ctx } = await makeCtx(browser, "blake", { theme: "night", width: 1440, height: 900, extra: false });
let armed = false, n = 0;
await ctx.route(/\/api\/me\/calendar$/, async (route) => {
  const res = await route.fetch();
  const j = await res.json();
  if (!armed) return route.fulfill({ response: res, json: j });
  n += 1;
  if (n === 1) {
    // The older read: still Going, and slow.
    await new Promise((r) => setTimeout(r, 2500));
    return route.fulfill({ response: res, json: j });
  }
  // The newer read: the RSVP is gone.
  return route.fulfill({ response: res, json: { ...j, entries: j.entries.filter((e) => e.id !== REAL.study) } });
});
const page = await ctx.newPage();
await page.goto(`${BASE}/campus`, { waitUntil: "load" });
await page.waitForSelector('button[title="Open full calendar"]', { timeout: 45000 });
await settle(page, 2000);
const oct20 = () => page.evaluate(() => [...document.querySelectorAll("aside button[aria-label]")].find((x) => x.getAttribute("aria-label").startsWith("Tue Oct 20 2026"))?.getAttribute("aria-label"));
console.log("before:", await oct20());
armed = true;
await page.evaluate(() => window.dispatchEvent(new Event("vibe:calendar-changed")));
await page.waitForTimeout(300);
await page.evaluate(() => window.dispatchEvent(new Event("vibe:calendar-changed")));
await page.waitForTimeout(4000);
console.log("reads:", n, "after both answered:", await oct20());
await browser.close();
