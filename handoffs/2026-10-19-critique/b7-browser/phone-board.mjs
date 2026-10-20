import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const BO = "d3c31eb8-01af-4654-9b47-034ddaea8b3f";
const browser = await chromium.launch();
const c = await ctx(browser, "blake", { phone: true, dark: false });
const p = await c.newPage();
await p.goto(BASE + "/messages?channel=" + BO, { waitUntil: "load" });
await p.getByText("B7 test: Board announcement from Avery", { exact: true }).first().waitFor({ timeout: 30000 });
await sleep(700);
// Open the post's replies.
const post = p.locator("article", { hasText: "B7 test: Board announcement from Avery" }).first();
await post.getByRole("button", { name: /repl/i }).first().click();
await p.getByText("B7 test: reply from Blake").first().waitFor();
await sleep(500);
if (!(await tagNear(p, "B7 test: reply from Blake", 'button[aria-label="More"]'))) throw new Error("no More near reply");
await p.locator("[data-b7-target]").click();
await p.getByRole("menuitem", { name: "Delete" }).waitFor();
await post.scrollIntoViewIfNeeded();
await sleep(300);
await p.screenshot({ path: `${SHOTS}/B7-phone-light-board-reply-menu.png` });
await p.getByRole("menuitem", { name: "Delete" }).click();
const dlg = p.getByRole("alertdialog");
await dlg.waitFor();
console.log("dialog:", (await dlg.innerText()).replace(/\n+/g, " | "));
const [resp] = await Promise.all([
  p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
  dlg.getByRole("button", { name: "Delete" }).click(),
]);
console.log("DELETE", resp.status(), await resp.text());
await post.getByText("Message deleted").first().waitFor({ timeout: 10000 });
await sleep(500);
await post.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SHOTS}/B7-phone-light-board-reply-deleted.png` });
// No Delete is offered on Avery's post to Blake (not his).
const postMore = await post.locator('button[aria-label="More"]').first();
await postMore.click();
console.log("menu on avery's post:", (await p.getByRole("menu").first().innerText()).replace(/\n+/g, " | "));
await browser.close();
