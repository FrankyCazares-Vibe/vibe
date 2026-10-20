import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const LO = "3ea7db07-0b86-46f4-b7e2-b267b0461c04";
const browser = await chromium.launch();
{ // previews after the fix
  const c = await ctx(browser, "blake", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages", { waitUntil: "load" });
  await p.getByText("Chat Seed Club").first().waitFor({ timeout: 30000 });
  await sleep(1500);
  await p.screenshot({ path: `${SHOTS}/B7-phone-light-inbox-after.png` });
  await c.close();
}
{ // desktop side panel after the Board delete
  const c = await ctx(browser, "blake", { phone: false, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  await p.getByText("Announcement Board").first().waitFor({ timeout: 30000 });
  await sleep(1500);
  await p.screenshot({ path: `${SHOTS}/B7-desktop-night-lounge-side-after-board-delete.png` });
  await c.close();
}
{ // the phone's ⋯ beside my own card (opened, then cancelled: nothing deleted)
  const c = await ctx(browser, "blake", { phone: true, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  await p.getByText("S71 walk: pizza or tacos?").first().waitFor({ timeout: 30000 });
  await sleep(800);
  const ok = await tagNear(p, "S71 walk: pizza or tacos?", 'button[aria-label="Message actions"]');
  console.log("card ⋯ found:", ok);
  if (ok) {
    await p.locator("[data-b7-target]").scrollIntoViewIfNeeded();
    await p.locator("[data-b7-target]").click();
    await p.getByRole("button", { name: "Delete" }).first().waitFor();
    await sleep(300);
    await p.screenshot({ path: `${SHOTS}/B7-phone-night-own-card-menu.png` });
  }
  await c.close();
}
await browser.close();
