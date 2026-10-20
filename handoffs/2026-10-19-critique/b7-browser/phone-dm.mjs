import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba";
const browser = await chromium.launch();
const c = await ctx(browser, "blake", { phone: true, dark: true });
const p = await c.newPage();
p.on("response", (r) => { if (r.status() >= 500) console.log("5xx:", r.status(), r.url()); });
await p.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
await p.getByText("B7 test: dinner at 7?", { exact: true }).first().waitFor({ timeout: 30000 });
await sleep(800);
console.log("tag", await tagNear(p, "B7 test: dinner at 7?", 'button[aria-label="Message actions"]'));
await p.locator("[data-b7-target]").click();
await p.getByRole("button", { name: "Delete" }).first().waitFor();
await sleep(300);
await p.screenshot({ path: `${SHOTS}/B7-phone-night-dm-menu.png` });
await p.getByRole("button", { name: "Delete" }).first().click();
const dlg = p.getByRole("alertdialog");
await dlg.waitFor();
console.log("dialog:", (await dlg.innerText()).replace(/\n+/g, " | "));
await sleep(300);
await p.screenshot({ path: `${SHOTS}/B7-phone-night-dm-confirm.png` });
const [resp] = await Promise.all([
  p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
  dlg.getByRole("button", { name: "Delete" }).click(),
]);
console.log("DELETE", resp.status(), await resp.text());
await p.getByText("Message deleted", { exact: true }).first().waitFor({ timeout: 10000 });
await sleep(500);
await p.screenshot({ path: `${SHOTS}/B7-phone-night-dm-deleted.png` });
// The other side (avery), fresh open: the note in place and the quote of it.
const c2 = await ctx(browser, "avery", { phone: true, dark: true });
const p2 = await c2.newPage();
await p2.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
await p2.getByText("B7 test: yes, 7 works", { exact: true }).first().waitFor({ timeout: 30000 });
await sleep(800);
const notes = await p2.getByText("Message deleted", { exact: true }).count();
console.log("avery sees notes:", notes, "dinner text still there:", await p2.getByText("B7 test: dinner at 7?", { exact: true }).count());
await p2.screenshot({ path: `${SHOTS}/B7-phone-night-dm-other-side.png` });
await browser.close();
