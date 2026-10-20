// Phone month sheet: a day's plan rows without a chat open the club page.
import { BASE, OUT, launch, makeCtx, settle } from "./common.mjs";
const browser = await launch();
for (const theme of ["night", "light"]) {
  const { ctx } = await makeCtx(browser, "blake", { theme, width: 390, height: 844, phone: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/messages`, { waitUntil: "load" });
  await page.waitForSelector('a[href*="?event="]', { timeout: 45000 });
  await settle(page, 1200);
  await page.getByRole("button", { name: /your week|month/i }).first().click().catch(async () => { await page.getByText("Your week").first().click(); });
  await page.waitForTimeout(1500);
  const day = page.getByRole("button", { name: /^Wednesday, October 21/ }).first();
  if (await day.count()) { await day.click(); await page.waitForTimeout(800); }
  const rows = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a[href*="?event="], [data-vaul-drawer] a[href*="?event="]')].map((a) => `${a.getAttribute("aria-label")?.slice(0, 80)} -> ${a.getAttribute("href").slice(0, 36)} h=${Math.round(a.getBoundingClientRect().height)}`));
  console.log(theme, "month rows:", JSON.stringify(rows), "docW", await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: `${OUT}/B8-phone-month-${theme}-390.png` });
  await ctx.close();
}
await browser.close();
