// A six-row month with a busy day on a short screen: the day shows the chips
// its row can hold, then "+N more", and nothing leaves the day. blake.
import { BASE, OUT, launch, makeCtx, settle } from "../b8-after/common.mjs";
const id = (n) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`;
const at = (d, h) => new Date(2027, 0, d, h).toISOString();
const JAN = [1, 2, 3, 4].map((n) => ({ kind: "personal", id: id(n), title: `January plan number ${n} with a long name`, starts_at: at(8, 8 + n), ends_at: null, location: "", notes: "", color: "#9B7BFF" }));
JAN.push({ kind: "personal", id: id(9), title: "One thing", starts_at: at(20, 9), ends_at: null, location: "", notes: "", color: "#5A9CFF" });
const browser = await launch();
for (const theme of ["night", "light"]) {
  for (const [w, h] of [[1366, 768], [1280, 720]]) {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: w, height: h, extra: false });
    await ctx.route("**/api/me/calendar*", async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      await route.fulfill({ response: res, json: { ...j, entries: [...(j.entries || []), ...JAN] } });
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/campus`, { waitUntil: "load" });
    await page.waitForSelector('button[title="Open full calendar"]', { timeout: 45000 });
    await settle(page, 1500);
    await page.click('button[title="Open full calendar"]');
    await page.waitForSelector('[role="dialog"]');
    for (let i = 0; i < 3; i++) await page.getByRole("dialog").getByRole("button", { name: "Next month" }).click();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"] > div');
      const grid = [...dlg.querySelectorAll("div")].find((d) => (d.style.gridTemplateRows || "").includes("minmax(64px"));
      const cells = [...grid.children];
      const busy = cells.find((c) => c.querySelector("button")?.getAttribute("aria-label")?.startsWith("Friday, January 8"));
      const one = cells.find((c) => c.querySelector("button")?.getAttribute("aria-label")?.startsWith("Wednesday, January 20"));
      const inDay = (cell) => [...cell.querySelectorAll("[title], button")].every((c) => c.getBoundingClientRect().bottom <= cell.getBoundingClientRect().bottom + 0.5);
      const key = dlg.querySelector('[role="group"][aria-label="Colour key"]').getBoundingClientRect();
      return { rows: cells.length / 7, rowH: Math.round(cells[0].getBoundingClientRect().height * 10) / 10,
        busy: { chips: busy.querySelectorAll("[title]").length, more: [...busy.querySelectorAll("button")].map((b) => b.textContent).filter((t) => /more/.test(t)), fits: inDay(busy) },
        single: { chips: one.querySelectorAll("[title]").length, fits: inDay(one) }, keyBottom: Math.round(key.bottom), innerHeight };
    });
    console.log(theme, `${w}x${h}`, JSON.stringify(r));
    await page.screenshot({ path: `${OUT}/B8r-modal-6rows-${theme}-${w}x${h}.png` });
    await ctx.close();
  }
}
await browser.close();
