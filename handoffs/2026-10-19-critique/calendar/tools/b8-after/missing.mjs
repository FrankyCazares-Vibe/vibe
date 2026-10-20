import { BASE, OUT, launch, makeCtx } from "./common.mjs";
const browser = await launch();
for (const theme of ["night", "light"]) {
  const { ctx } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/orgs/test_open_club?event=11111111-2222-4333-8444-555555555555`, { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const ok = await page.getByText("That event isn't listed anymore.").first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  console.log(theme, "toast:", ok, "after", Date.now() - t0, "ms; count", await page.getByText("That event isn't listed anymore.").count());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/B8-orglink-missing-${theme}-1440.png` });
  await page.waitForTimeout(6000);
  console.log(theme, "toast after 6s:", await page.getByText("That event isn't listed anymore.").count());
  await ctx.close();
}
await browser.close();
