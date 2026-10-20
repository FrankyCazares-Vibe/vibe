// Repair pass: one key on every calendar. Interested is a coral ring in the
// Messages week strip, the desktop week band, the phone month sheet and the
// cards; the phone's Up next keeps the event time whole. blake, both themes.
// RSVPs and the club space answer are changed in the browser only.
import { BASE, OUT, REAL, launch, makeCtx, settle } from "../b8-after/common.mjs";

const markStyles = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((b) => {
  const spans = [...b.querySelectorAll("span[aria-hidden]")].filter((x) => x.getBoundingClientRect().width === 5);
  const m = spans[0];
  if (!m) return null;
  const cs = getComputedStyle(m);
  if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.borderTopStyle === "none") return null;
  return `${(b.getAttribute("aria-label") || "").slice(0, 34)} :: bg ${cs.backgroundColor} border ${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`;
}).filter(Boolean), sel);

const rings = (page) => page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.textContent.trim() === "Interested" && s.querySelector("span[aria-hidden]")).map((s) => {
  const r = getComputedStyle(s.querySelector("span[aria-hidden]"));
  return `${r.width} ${r.borderTopWidth} ${r.borderTopStyle} ${r.borderTopColor}`;
}));

const browser = await launch();
for (const theme of ["night", "light"]) {
  // 1. Desktop /messages: the week band beside the left-nav mini calendar.
  {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: 1440, height: 900 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/messages`, { waitUntil: "load" });
    await settle(page, 6000);
    console.log(theme, "band marks:", JSON.stringify(await markStyles(page, "nav button[aria-haspopup='dialog']")));
    console.log(theme, "band Interested words:", JSON.stringify(await rings(page)));
    await page.screenshot({ path: `${OUT}/B8r-weekband-${theme}-1440.png` });
    await ctx.close();
  }
  // 2. Phone 390: the week strip, the cards, the month sheet.
  {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: 390, height: 844, phone: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/messages`, { waitUntil: "load" });
    await page.waitForSelector(`a[href*="event=${REAL.study}"]`, { timeout: 45000 });
    await settle(page, 1500);
    console.log(theme, "phone strip marks:", JSON.stringify(await markStyles(page, "button[aria-haspopup='dialog']")));
    console.log(theme, "phone card Interested words:", JSON.stringify(await rings(page)));
    await page.screenshot({ path: `${OUT}/B8r-phone-week-${theme}-390.png` });
    await page.getByRole("button", { name: /^Sat/ }).first().click();
    await page.waitForTimeout(1500);
    console.log(theme, "month marks:", JSON.stringify(await markStyles(page, "[role='dialog'] button[aria-pressed]")));
    console.log(theme, "month Interested pills:", JSON.stringify(await rings(page)));
    await page.screenshot({ path: `${OUT}/B8r-phone-month-${theme}-390.png` });
    await ctx.close();
  }
  // 3. Phone 375: Up next on the club space, an Interested event tomorrow 7:30 PM.
  {
    const { ctx } = await makeCtx(browser, "blake", { theme, width: 375, height: 812, phone: true });
    await ctx.route("**/api/orgs/test_open_club/space*", async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(19, 30, 0, 0);
      const tonight = new Date(); tonight.setHours(21, 30, 0, 0);
      const up = (j.up_next || []).map((e, i) => (i === 0 ? { ...e, viewer_status: "maybe", starts_at: tomorrow.toISOString(), ends_at: new Date(tomorrow.getTime() + 7200e3).toISOString(), state: "soon" } : e));
      if (up.length === 1) up.push({ ...up[0], id: "00000000-0000-4000-8000-000000000777", title: "Late study break", viewer_status: "going", starts_at: tonight.toISOString(), ends_at: new Date(tonight.getTime() + 3600e3).toISOString() });
      await route.fulfill({ response: res, json: { ...j, up_next: up } });
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/messages`, { waitUntil: "load" });
    await settle(page, 2500);
    await page.getByRole("button", { name: /Test Open Club/ }).first().click();
    await page.waitForSelector('section[aria-label="Up next"]', { timeout: 30000 });
    await settle(page, 1200);
    const cards = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Up next"] [role="group"] > *')].map((c) => {
      const line = c.querySelector("span");
      const time = line.querySelector("span");
      return { label: c.getAttribute("aria-label"), line1: line.textContent, timeCut: time.scrollWidth > time.clientWidth + 0.5, lineW: Math.round(line.scrollWidth), room: Math.round(line.clientWidth) };
    }));
    console.log(theme, "up next 375:", JSON.stringify(cards));
    await page.locator('section[aria-label="Up next"]').screenshot({ path: `${OUT}/B8r-upnext-${theme}-375.png` });
    await ctx.close();
  }
}
await browser.close();
