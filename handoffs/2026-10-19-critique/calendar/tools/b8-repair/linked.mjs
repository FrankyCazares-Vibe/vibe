// Repair pass: the linked card keeps a focus mark after the flash fades, and
// an officer's own Cancel never gets "isn't listed anymore" over its result.
// avery (owner of test_open_club), 1440, Night and Light. The DELETE is
// answered in the browser with { notify_failed: true }; nothing is written.
import { BASE, OUT, REAL, launch, makeCtx, settle } from "../b8-after/common.mjs";

const browser = await launch();
for (const theme of ["night", "light"]) {
  for (const [w, h, who] of [[1440, 900, "avery"], [390, 844, "blake"]]) {
    const { ctx } = await makeCtx(browser, who, { theme, width: w, height: h, phone: w < 768, extra: false });
    const deletes = [];
    await ctx.route(`**/api/events/${REAL.study}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deletes.push("DELETE");
      await route.fulfill({ status: 200, json: { ok: true, notified: 0, notify_failed: true } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/orgs/test_open_club?event=${REAL.study}`, { waitUntil: "load" });
    await page.waitForSelector(`[data-event-anchor="${REAL.study}"]`, { timeout: 45000 });
    await settle(page, 4000);
    const focus = await page.evaluate((eid) => {
      const el = document.activeElement;
      const cs = el ? getComputedStyle(el) : null;
      return { isAnchor: el?.getAttribute("data-event-anchor") === eid, outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : null, offset: cs?.outlineOffset };
    }, REAL.study);
    console.log(theme, w, who, "4s after load:", JSON.stringify(focus));
    await page.screenshot({ path: `${OUT}/B8r-focus-${theme}-${w}.png` });
    if (who === "avery") {
      const card = page.locator(`[data-event-anchor="${REAL.study}"]`);
      await card.getByRole("button", { name: "Cancel event" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel event" }).click();
      await page.waitForTimeout(1500);
      const toasts = await page.evaluate(() => {
        const t = document.body.innerText;
        return { notices: t.includes("Event cancelled, but the notices didn't send"), notListed: t.includes("That event isn't listed anymore.") };
      });
      console.log(theme, "after Cancel:", JSON.stringify(toasts), "deletes:", deletes.length, "card gone:", (await card.count()) === 0);
      await page.screenshot({ path: `${OUT}/B8r-cancel-toast-${theme}-1440.png` });
    }
    if (errors.length) console.log("ERRORS", errors.join(" | "));
    await ctx.close();
  }
}
await browser.close();
