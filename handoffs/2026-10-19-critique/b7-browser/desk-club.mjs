import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const LO = "3ea7db07-0b86-46f4-b7e2-b267b0461c04", BO = "d3c31eb8-01af-4654-9b47-034ddaea8b3f";
const browser = await chromium.launch();
async function confirmAndShoot(p, base, { confirmShot }) {
  const dlg = p.getByRole("alertdialog");
  await dlg.waitFor();
  console.log(base, "dialog:", (await dlg.innerText()).replace(/\n+/g, " | "));
  await sleep(250);
  if (confirmShot) await p.screenshot({ path: `${SHOTS}/${base}-confirm.png` });
  const [resp] = await Promise.all([
    p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    dlg.getByRole("button", { name: "Delete" }).click(),
  ]);
  console.log(base, "DELETE", resp.status(), await resp.text());
}
// Lounge, Blake, Night: the hover toolbar's More menu.
{
  const c = await ctx(browser, "blake", { phone: false, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  const text = "B7 test: lounge line for desktop";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(700);
  const row = p.locator(".vibe-hover-row", { hasText: text }).last();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await sleep(300);
  await row.getByRole("button", { name: "More" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).waitFor();
  await sleep(250);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-night-lounge-menu.png` });
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await confirmAndShoot(p, "B7-desktop-night-lounge", { confirmShot: false });
  await p.getByText(text, { exact: true }).first().waitFor({ state: "detached", timeout: 10000 });
  await sleep(500);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-night-lounge-deleted.png` });
  // A note has no toolbar.
  const noteRow = p.locator(".vibe-hover-row", { hasText: "Message deleted" });
  console.log("note rows with a toolbar:", await noteRow.locator('[role="toolbar"]').count());
  await c.close();
}
// Board, Avery (owner), Light: Delete on her own post; the confirm counts the replies.
{
  const c = await ctx(browser, "avery", { phone: false, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + BO, { waitUntil: "load" });
  const text = "B7 test: Board announcement from Avery";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(700);
  const post = p.locator("article", { hasText: text }).first();
  await post.getByRole("button", { name: "More" }).first().click();
  await p.getByRole("menuitem", { name: "Delete" }).waitFor();
  await sleep(250);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-light-board-owner-menu.png` });
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await confirmAndShoot(p, "B7-desktop-light-board-owner", { confirmShot: true });
  await p.getByText("Post deleted", { exact: true }).first().waitFor({ timeout: 10000 });
  await sleep(500);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-light-board-owner-deleted.png` });
  await c.close();
}
// The other side: Blake (member), Night, desktop Board: "Post deleted", the replies still open.
{
  const c = await ctx(browser, "blake", { phone: false, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + BO, { waitUntil: "load" });
  await p.getByText("Post deleted", { exact: true }).first().waitFor({ timeout: 30000 });
  const post = p.locator("article", { hasText: "Post deleted" }).first();
  await post.getByRole("button", { name: /repl/i }).first().click();
  await p.getByText("B7 test: second reply from Blake").first().waitFor();
  console.log("reply field under a deleted post:", await post.getByPlaceholder("Reply quietly").count());
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-night-board-other-side.png` });
  await c.close();
}
await browser.close();
