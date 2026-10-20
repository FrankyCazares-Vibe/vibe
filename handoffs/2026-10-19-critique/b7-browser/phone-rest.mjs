import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const GR = "98fb9cd2-8630-4c3d-88f2-c3e91182e32f", LO = "3ea7db07-0b86-46f4-b7e2-b267b0461c04", EV = "bed10830-5563-41a8-b875-625e12eb0dde";
const browser = await chromium.launch();
const which = process.argv[2] || "all";

async function deleteVia(p, text, shotBase, { menuShot = false, confirmShot = false } = {}) {
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(700);
  if (!(await tagNear(p, text, 'button[aria-label="Message actions"], button[aria-label="More"]'))) throw new Error("no menu button near " + text);
  await p.locator("[data-b7-target]").scrollIntoViewIfNeeded();
  await p.locator("[data-b7-target]").click();
  const del = p.getByRole("button", { name: "Delete" }).or(p.getByRole("menuitem", { name: "Delete" })).first();
  await del.waitFor();
  await sleep(300);
  if (menuShot) await p.screenshot({ path: `${SHOTS}/${shotBase}-menu.png` });
  await del.click();
  const dlg = p.getByRole("alertdialog");
  await dlg.waitFor();
  const words = (await dlg.innerText()).replace(/\n+/g, " | ");
  await sleep(250);
  if (confirmShot) await p.screenshot({ path: `${SHOTS}/${shotBase}-confirm.png` });
  const [resp] = await Promise.all([
    p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    dlg.getByRole("button", { name: "Delete" }).click(),
  ]);
  console.log(shotBase, "|", words.slice(0, 90), "| DELETE", resp.status(), await resp.text());
  await p.getByText(text, { exact: true }).first().waitFor({ state: "detached", timeout: 10000 }).catch(() => console.log("text still shown!"));
  await sleep(500);
  await p.screenshot({ path: `${SHOTS}/${shotBase}-deleted.png` });
}

if (which === "all" || which === "group") {
  const c = await ctx(browser, "blake", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + GR, { waitUntil: "load" });
  await deleteVia(p, "B7 test: group hello from Blake", "B7-phone-light-group", { confirmShot: true });
  await c.close();
}
if (which === "all" || which === "lounge") {
  const c = await ctx(browser, "blake", { phone: true, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  await deleteVia(p, "B7 test: lounge hello from Blake", "B7-phone-night-lounge", { menuShot: true });
  await c.close();
}
if (which === "all" || which === "event") {
  const c = await ctx(browser, "blake", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + EV, { waitUntil: "load" });
  await deleteVia(p, "B7 test: see you at game night", "B7-phone-light-event", { menuShot: true });
  await c.close();
}
await browser.close();
