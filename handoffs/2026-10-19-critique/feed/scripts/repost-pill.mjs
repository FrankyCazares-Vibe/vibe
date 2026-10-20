import { open, hideBadge } from "./common.mjs";
const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/feed";
for (const mobile of [true, false]) {
  const { browser, page, log } = await open({ who: "blake", mobile, injectReposters: true });
  await page.goto("http://localhost:3000/campus", { waitUntil: "load", timeout: 90000 });
  await page.getByText(/reposted this/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await hideBadge(page);
  const pills = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("div")).filter((d) => /reposted this$/.test(d.textContent.trim()) && d.children.length <= 2 && getComputedStyle(d).borderRadius === "999px");
    return els.map((d) => {
      const r = d.getBoundingClientRect();
      // nearest card container
      let c = d.parentElement; while (c && !(parseFloat(getComputedStyle(c).borderRadius) >= 14)) c = c.parentElement;
      const cr = c ? c.getBoundingClientRect() : null;
      const cs = getComputedStyle(d);
      return { text: d.textContent.trim(), pillW: Math.round(r.width), pillH: Math.round(r.height), top: Math.round(r.top + window.scrollY), cardW: cr ? Math.round(cr.width) : null, bg: cs.backgroundColor, color: cs.color, display: cs.display };
    });
  });
  console.log(mobile ? "MOBILE" : "DESKTOP", JSON.stringify(pills, null, 1));
  const first = page.getByText(/reposted this/).nth(1);
  await first.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/m2-${mobile ? "phone" : "desktop"}-repost-pill-today.png` });
  console.log(log.filter((l) => l.startsWith("INJECTED") || l.startsWith("PAGEERROR")).join("\n"));
  await browser.close();
}
