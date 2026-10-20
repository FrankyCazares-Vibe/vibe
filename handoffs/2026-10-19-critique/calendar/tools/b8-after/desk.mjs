// My Calendar at 1440 and 1280, Night and Light, as blake (non-admin).
import { BASE, OUT, launch, makeCtx, settle } from "./common.mjs";

const browser = await launch();
for (const theme of ["night", "light"]) {
  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: w, height: h });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/campus`, { waitUntil: "load" });
    await page.waitForSelector('button[title="Open full calendar"]', { timeout: 45000 });
    await settle(page, 2000);
    const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (w === 1440) {
      const box = await page.locator('button[title="Open full calendar"]').boundingBox();
      await page.screenshot({ path: `${OUT}/B8-mini-${theme}-1440.png`, clip: { x: Math.max(0, box.x - 12), y: box.y - 10, width: 240, height: 230 } });
      const marks = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('aside button[aria-label]')].filter((b) => /\d{4}/.test(b.getAttribute("aria-label")) && b.getAttribute("aria-label").includes(","));
        return btns.map((b) => b.getAttribute("aria-label"));
      });
      const badge = await page.locator('button[title="Open full calendar"] span').last().textContent().catch(() => null);
      console.log(theme, "mini day labels with entries:", JSON.stringify(marks), "badge:", badge);
    }
    await page.click('button[title="Open full calendar"]');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"] > div');
      const grid = [...dlg.querySelectorAll("div")].find((d) => d.style.gridAutoRows === "96px");
      const cells = [...grid.children];
      const ws = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().width * 10) / 10));
      const hs = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10));
      const chips = [...grid.querySelectorAll("a, span[title]")].filter((c) => c.getAttribute("title"));
      const outside = chips.filter((c) => {
        const r = c.getBoundingClientRect(); const p = c.parentElement.getBoundingClientRect();
        return r.right > p.right + 0.5 || r.bottom > p.bottom + 0.5;
      }).map((c) => c.getAttribute("title"));
      const cut = chips.filter((c) => { const t = c.querySelector("span:last-child") || c; return t.scrollWidth > t.clientWidth; }).map((c) => c.getAttribute("title"));
      const more = [...grid.querySelectorAll("button")].filter((b) => /more$/.test(b.textContent)).map((b) => b.textContent);
      const side = [...dlg.querySelectorAll("div")].find((d) => d.style.borderLeft && d.style.background === "var(--cream)");
      const gridRight = grid.getBoundingClientRect().right;
      return { modalW: Math.round(dlg.getBoundingClientRect().width), colWidths: [...ws], rowHeights: [...hs], cells: cells.length, chips: chips.length, chipsOutsideDay: outside, titlesCut: cut, more, gridRight: Math.round(gridRight), sideLeft: side ? Math.round(side.getBoundingClientRect().left) : null, docW: document.documentElement.scrollWidth };
    });
    console.log(theme, `${w}x${h}`, "data-theme", dataTheme, JSON.stringify(m), errors.length ? "ERRORS " + errors.join(" | ") : "");
    await page.screenshot({ path: `${OUT}/B8-modal-${theme}-${w}.png` });
    if (w === 1440) {
      await page.getByRole("button", { name: /^Wednesday, October 21/ }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/B8-daypanel-${theme}-1440.png` });
      const side = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a')].map((a) => `${a.textContent.trim().slice(0, 40)} -> ${a.getAttribute("href")}`));
      console.log(theme, "links in modal:", JSON.stringify(side));
    }
    await ctx.close();
  }
}
await browser.close();
