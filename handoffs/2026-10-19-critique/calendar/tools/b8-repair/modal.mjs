// Repair pass (Oct 19, 2026): My Calendar fits short laptop screens, the key
// stays on screen, old coral entries are blue, coral is not a swatch.
// blake, Night and Light. RSVP writes mocked (../b8-after/common.mjs).
import { BASE, OUT, launch, makeCtx, settle } from "../b8-after/common.mjs";

const measure = (page) => page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"] > div');
  const grid = [...dlg.querySelectorAll("div")].find((d) => (d.style.gridTemplateRows || "").includes("minmax(64px"));
  const scroller = grid.parentElement;
  const sr = scroller.getBoundingClientRect();
  const cells = [...grid.children];
  const rows = cells.length / 7;
  const hs = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10))];
  const ws = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().width * 10) / 10))];
  const lastBottom = Math.max(...cells.map((c) => c.getBoundingClientRect().bottom));
  const key = dlg.querySelector('[role="group"][aria-label="Colour key"]').getBoundingClientRect();
  const chips = [...grid.querySelectorAll("a[title], span[title]")];
  const outside = chips.filter((c) => { const r = c.getBoundingClientRect(); const p = c.parentElement.getBoundingClientRect(); return r.bottom > p.bottom + 0.5 || r.right > p.right + 0.5; }).map((c) => c.title);
  const more = [...grid.querySelectorAll("button")].filter((b) => /more$/.test(b.textContent)).map((b) => b.textContent);
  const run = chips.find((c) => c.title === "Run club");
  return {
    month: dlg.querySelector("span[style*='min-width: 140px']")?.textContent,
    modal: [Math.round(dlg.getBoundingClientRect().top), Math.round(dlg.getBoundingClientRect().bottom)],
    rows, rowHeights: hs, colWidths: ws,
    scrollerBottom: Math.round(sr.bottom), lastRowBottom: Math.round(lastBottom), scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
    key: [Math.round(key.top), Math.round(key.bottom)], keyOnScreen: key.bottom <= innerHeight, innerHeight,
    chips: chips.length, chipsOutsideDay: outside, more,
    runClubBar: run ? getComputedStyle(run).backgroundImage.slice(0, 60) : null,
    docW: document.documentElement.scrollWidth,
  };
});

const browser = await launch();
for (const theme of ["night", "light"]) {
  for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800], [1280, 720]]) {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: w, height: h });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/campus`, { waitUntil: "load" });
    await page.waitForSelector('button[title="Open full calendar"]', { timeout: 45000 });
    await settle(page, 1500);
    await page.click('button[title="Open full calendar"]');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(800);
    console.log(theme, `${w}x${h}`, JSON.stringify(await measure(page)), errors.length ? "ERRORS " + errors.join(" | ") : "");
    await page.screenshot({ path: `${OUT}/B8r-modal-${theme}-${w}x${h}.png` });
    if (h <= 768) {
      // Jan 2027 starts on a Friday: a six-row month.
      for (let i = 0; i < 3; i++) await page.getByRole("dialog").getByRole("button", { name: "Next month" }).click();
      await page.waitForTimeout(500);
      console.log(theme, `${w}x${h}`, "six rows:", JSON.stringify(await measure(page)));
      await page.screenshot({ path: `${OUT}/B8r-modal-6rows-${theme}-${w}x${h}.png` });
    }
    if (w === 1440) {
      await page.getByRole("button", { name: /New Event/ }).click();
      await page.waitForTimeout(500);
      const swatches = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].filter((b) => !b.textContent.trim()).map((b) => b.style.background).filter((bg) => /^rgb\(|^#/.test(bg)));
      console.log(theme, "swatches:", JSON.stringify(swatches));
      await page.screenshot({ path: `${OUT}/B8r-swatches-${theme}-1440.png` });
    }
    await ctx.close();
  }
}
await browser.close();
