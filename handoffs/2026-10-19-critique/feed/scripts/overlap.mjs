import { open, hideBadge } from "./common.mjs";
const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/feed";
const { browser, page } = await open({ who: "blake", mobile: false, injectReposters: true });
await page.goto("http://localhost:3000/campus", { waitUntil: "load", timeout: 90000 });
await page.getByText(/reposted this/).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
await hideBadge(page);
const r = await page.evaluate(() => {
  const art = document.querySelector("article[data-post-id]");
  const pill = Array.from(art.querySelectorAll("div")).find((d) => /reposted this$/.test(d.textContent.trim()) && getComputedStyle(d).borderRadius === "999px");
  const kebab = art.querySelector('button[aria-label="Post actions"]');
  const a = pill.getBoundingClientRect(), b = kebab.getBoundingClientRect();
  const overlap = !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
  return { pill: [a.left, a.top, a.right, a.bottom].map(Math.round), kebab: [b.left, b.top, b.right, b.bottom].map(Math.round), overlap, parentDisplay: getComputedStyle(pill.parentElement).display, parentDir: getComputedStyle(pill.parentElement).flexDirection, parentAlign: getComputedStyle(pill.parentElement).alignItems };
});
console.log(JSON.stringify(r));
const el = page.locator("article[data-post-id]").first();
await el.screenshot({ path: `${OUT}/m2-desktop-pill-under-kebab.png` });
await browser.close();
