// Desktop /messages week band: the word "Interested", and cards without a
// chat link to the club page at the event. blake, 1440, both themes.
import { BASE, OUT, launch, makeCtx, settle } from "./common.mjs";
const browser = await launch();
for (const theme of ["night", "light"]) {
  const { ctx } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/messages`, { waitUntil: "load" });
  await settle(page, 6000);
  const r = await page.evaluate(() => ({
    links: [...document.querySelectorAll('a[href*="?event="]')].filter((a) => !a.closest("aside")).map((a) => `${a.textContent.trim().slice(0, 60)} -> ${a.getAttribute("href").slice(0, 40)}`),
    maybe: document.body.innerText.includes("Maybe"),
    interested: (document.body.innerText.match(/Interested/g) || []).length,
    docW: document.documentElement.scrollWidth,
  }));
  console.log(theme, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/B8-weekband-${theme}-1440.png` });
  await ctx.close();
}
await browser.close();
