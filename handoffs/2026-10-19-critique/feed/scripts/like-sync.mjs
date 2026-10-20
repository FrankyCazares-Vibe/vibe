// MOBILE 1 repro: like in the viewer, close, read the card; then the reverse.
import { open, hideBadge } from "./common.mjs";
const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/feed";

const { browser, page, log } = await open({ who: "blake", mobile: true });
await page.goto("http://localhost:3000/campus", { waitUntil: "load", timeout: 90000 });
await hideBadge(page);
// Wait for a feed card's Like button.
const cardLike = page.locator('main button[aria-label="Like"], main button[aria-label="Unlike"]').first();
await cardLike.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await hideBadge(page);

const cardState = async () => {
  const b = page.locator('main button[aria-pressed][aria-label="Like"], main button[aria-pressed][aria-label="Unlike"]').first();
  return { pressed: await b.getAttribute("aria-pressed"), text: (await b.innerText()).trim() };
};
const viewerLikeState = async () =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Post"]');
    if (!dlg) return null;
    const repost = Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent.trim() === "Repost");
    if (!repost) return "no-bar";
    const like = repost.previousElementSibling?.previousElementSibling;
    const path = like?.querySelector("svg path");
    return { text: like?.textContent.trim(), fill: like?.querySelector("svg")?.getAttribute("fill") ?? path?.getAttribute("fill"), html: like?.innerHTML.slice(0, 160) };
  });
const clickViewerLike = async () =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Post"]');
    const repost = Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent.trim() === "Repost");
    repost.previousElementSibling.previousElementSibling.click();
  });
const openFirstCard = async () => {
  // Tap the card body (its author row area), not a button.
  const card = cardLike.locator("xpath=ancestor::div[contains(@style,'border-radius: 18px')][1]");
  const box = await card.boundingBox();
  await page.mouse.click(box.x + box.width - 60, box.y + 70);
  await page.locator('[role="dialog"][aria-label="Post"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Post"]');
    return dlg && Array.from(dlg.querySelectorAll("button")).some((b) => b.textContent.trim() === "Repost");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(600);
};
const closeViewer = async () => {
  await page.locator('[role="dialog"][aria-label="Post"] button[aria-label="Close"]').first().click();
  await page.locator('[role="dialog"][aria-label="Post"]').waitFor({ state: "detached", timeout: 15000 });
  await page.waitForTimeout(500);
};

const results = [];
await cardLike.scrollIntoViewIfNeeded();
results.push({ step: "0 feed loaded", card: await cardState() });
await page.screenshot({ path: `${OUT}/m1-0-feed-before.png` });

// A: open, like in viewer, close.
await openFirstCard();
results.push({ step: "A1 viewer open", viewer: await viewerLikeState() });
await clickViewerLike();
await page.waitForTimeout(500);
results.push({ step: "A2 liked in viewer", viewer: await viewerLikeState() });
await page.screenshot({ path: `${OUT}/m1-1-liked-in-viewer.png` });
await closeViewer();
results.push({ step: "A3 closed: card", card: await cardState() });
await page.screenshot({ path: `${OUT}/m1-2-card-after-close.png` });
// Reopen: the viewer re-reads the (simulated) server.
await openFirstCard();
results.push({ step: "A4 reopened viewer", viewer: await viewerLikeState() });
await page.screenshot({ path: `${OUT}/m1-3-reopened-viewer.png` });
// B: unlike in the viewer, close, card.
await clickViewerLike();
await page.waitForTimeout(500);
results.push({ step: "B1 unliked in viewer", viewer: await viewerLikeState() });
await closeViewer();
results.push({ step: "B2 closed: card", card: await cardState() });
// C: like on the card, then unlike-in-viewer path already shown; now card -> viewer.
const b = page.locator('main button[aria-pressed][aria-label="Like"], main button[aria-pressed][aria-label="Unlike"]').first();
await b.click();
await page.waitForTimeout(600);
results.push({ step: "C1 tapped card heart", card: await cardState() });
await openFirstCard();
results.push({ step: "C2 viewer after card like", viewer: await viewerLikeState() });
await clickViewerLike();
await page.waitForTimeout(500);
results.push({ step: "C3 unliked in viewer", viewer: await viewerLikeState() });
await closeViewer();
results.push({ step: "C4 closed: card", card: await cardState() });
await page.screenshot({ path: `${OUT}/m1-4-card-after-viewer-unlike.png` });

console.log(JSON.stringify(results, null, 1));
console.log(log.filter((l) => !l.includes("/view") || true).join("\n"));
await browser.close();
