// Item 4, LOCAL ONLY: a like pops the heart; a refused unlike (the DELETE answered 429 here) puts the heart
// back WITHOUT a pop. Blake likes one seed post for real and unlikes it again at the end.
import { chromium, ctx, BASE, SHOTS, sleep, until } from "./lib.mjs";

const LIKED = { id: "0d683cc0-b775-4a4e-8c37-f4b2b42cc5c0", text: "Second demo account here" }; // Blake liked it already
const UNLIKED = { id: "b595a02e-e9cd-4a02-ad9d-db947c701cdc", text: "testing #mobile" }; // not liked
const out = {};
const browser = await chromium.launch();

/** The burst's dots under a like button: the spans LikeBurst draws (4 px, round). */
const dots = (button) =>
  button.evaluate((b) => Array.from(b.querySelectorAll("span[aria-hidden] > span")).filter((s) => s.style.width === "4px").length);
const likeCall = (post, method) => (x) => x.url().includes(`/api/posts/${post.id}/like`) && x.request().method() === method;

async function run(label, { phone, dark, open, button }) {
  const c = await ctx(browser, "blake", { phone, dark });
  const p = await c.newPage();
  const r = {};
  // 1. A refused unlike (the DELETE answered 429 here, nothing written): the heart comes back on, no pop.
  await p.route(`**/api/posts/${LIKED.id}/like`, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Slow down a little.", code: "rate_limited" }) })
      : route.continue(),
  );
  await open(p, LIKED);
  let b = await button(p, LIKED);
  await b.scrollIntoViewIfNeeded();
  await sleep(800);
  r.likedAtLoad = await b.getAttribute("aria-pressed");
  r.dotsAtLoad = await dots(b);
  const [refused] = await Promise.all([p.waitForResponse(likeCall(LIKED, "DELETE")), b.click()]);
  r.refusedStatus = refused.status();
  r.rolledBackMs = await until(async () => (await b.getAttribute("aria-pressed")) === "true", 5000, 25);
  await sleep(120);
  r.dotsAfterRefusedUnlike = await dots(b);
  await sleep(300);
  await p.screenshot({ path: `${SHOTS}/S80fix-${label}-refused-unlike-no-pop.png` });
  // 2. A real like on another post pops; then a real unlike puts the seed back.
  await open(p, UNLIKED);
  b = await button(p, UNLIKED);
  await b.scrollIntoViewIfNeeded();
  await sleep(800);
  r.unlikedAtLoad = await b.getAttribute("aria-pressed");
  const [liked] = await Promise.all([p.waitForResponse(likeCall(UNLIKED, "POST")), b.click()]);
  r.likeStatus = liked.status();
  await sleep(120);
  r.dotsAfterLike = await dots(b);
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/S80fix-${label}-like-pops.png` });
  await sleep(1200);
  const [un] = await Promise.all([p.waitForResponse(likeCall(UNLIKED, "DELETE")), b.click()]);
  r.unlikeStatus = un.status();
  await c.close();
  return r;
}

out.desktop = await run("desktop-light-campus", {
  phone: false,
  dark: false,
  open: async (p, post) => {
    if (!p.url().endsWith("/campus")) await p.goto(`${BASE}/campus`, { waitUntil: "load" });
    await p.locator("article", { hasText: post.text }).first().waitFor({ timeout: 30000 });
  },
  button: async (p, post) => p.locator("article", { hasText: post.text }).first().locator('button[aria-label="Like"]').first(),
});
out.phone = await run("phone-night-post-viewer", {
  phone: true,
  dark: true,
  open: async (p, post) => {
    await p.goto(`${BASE}/posts/${post.id}`, { waitUntil: "load" });
    await p.locator('button[aria-label^="Like,"], button[aria-label^="Unlike,"]').first().waitFor({ timeout: 30000 });
  },
  button: async (p) => p.locator('button[aria-label^="Like,"], button[aria-label^="Unlike,"]').first(),
});
await browser.close();
console.log(JSON.stringify(out, null, 2));
