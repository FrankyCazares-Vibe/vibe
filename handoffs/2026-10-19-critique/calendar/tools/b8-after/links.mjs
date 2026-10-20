// Clicking an event opens its club page at that event; past events; a link to
// an event that isn't listed; the owner's view. blake (member) and avery (owner).
import { BASE, OUT, REAL, launch, makeCtx, settle } from "./common.mjs";

const browser = await launch();
async function probe(page, id) {
  return page.evaluate((eid) => {
    const el = document.querySelector(`[data-event-anchor="${eid}"]`);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, inView: r.top >= 0 && r.bottom <= innerHeight + 1, top: Math.round(r.top), focused: document.activeElement === el, flash: !!el.querySelector(":scope > span[aria-hidden]"), url: location.pathname + location.search };
  }, id);
}
for (const theme of ["night", "light"]) {
  // 1. From My Calendar on /campus: click the chip.
  const { ctx } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/campus`, { waitUntil: "load" });
  await page.waitForSelector('button[title="Open full calendar"]', { timeout: 45000 });
  await settle(page, 1500);
  await page.click('button[title="Open full calendar"]');
  await page.waitForSelector('[role="dialog"]');
  await page.locator(`[role="dialog"] a[href*="event=${REAL.study}"]`).first().click();
  await page.waitForURL(/\/orgs\/test_open_club\?event=/, { timeout: 30000 });
  await page.waitForSelector(`[data-event-anchor="${REAL.study}"]`, { timeout: 30000 });
  await settle(page, 700);
  console.log(theme, "chip click ->", JSON.stringify(await probe(page, REAL.study)), "dialog left open:", await page.locator('[role="dialog"]').count());
  await page.screenshot({ path: `${OUT}/B8-orglink-upcoming-${theme}-1440.png` });

  // 2. A past event (Chat Seed Game Night ended Oct 15): its row in Past events.
  await page.goto(`${BASE}/orgs/chat_seed_club?event=${REAL.game}`, { waitUntil: "load" });
  await page.waitForSelector(`[data-event-anchor="${REAL.game}"]`, { timeout: 30000 });
  await settle(page, 700);
  console.log(theme, "past ->", JSON.stringify(await probe(page, REAL.game)));
  await page.screenshot({ path: `${OUT}/B8-orglink-past-${theme}-1440.png` });

  // 3. A link to an event that isn't there.
  await page.goto(`${BASE}/orgs/test_open_club?event=11111111-2222-4333-8444-555555555555`, { waitUntil: "load" });
  await settle(page, 3500);
  const toast = await page.getByText("That event isn't listed anymore.").count();
  console.log(theme, "missing -> toast shown:", toast);
  await page.screenshot({ path: `${OUT}/B8-orglink-missing-${theme}-1440.png` });
  await ctx.close();

  // 4. The owner (avery) on the past event: "Who came" and the flash.
  const owner = await makeCtx(browser, "avery", { theme, width: 1440, height: 900, extra: false });
  const op = await owner.ctx.newPage();
  await op.goto(`${BASE}/orgs/chat_seed_club?event=${REAL.game}`, { waitUntil: "load" });
  await op.waitForSelector(`[data-event-anchor="${REAL.game}"]`, { timeout: 30000 });
  await settle(op, 700);
  console.log(theme, "owner past ->", JSON.stringify(await probe(op, REAL.game)), "who came:", await op.locator(`[data-event-anchor="${REAL.game}"] button`).count());
  await op.screenshot({ path: `${OUT}/B8-orglink-owner-past-${theme}-1440.png` });
  await owner.ctx.close();
}
await browser.close();
