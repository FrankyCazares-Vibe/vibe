import { execSync } from "node:child_process";
import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
import { tagNear } from "./lib2.mjs";
const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba", LO = "3ea7db07-0b86-46f4-b7e2-b267b0461c04";
const browser = await chromium.launch();
const blakeCookie = execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const apiDelete = (ch, id) => fetch(`${BASE}/api/me/threads/${ch}/messages/${id}`, { method: "DELETE", headers: { cookie: blakeCookie, origin: BASE } }).then(async (r) => `${r.status} ${await r.text()}`);

{ // 1. Phone: Cancel, then Back, leave the message and the chat as they were.
  const c = await ctx(browser, "blake", { phone: true, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
  const text = "B7 test: cancel and back check";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(600);
  const open = async () => {
    await tagNear(p, text, 'button[aria-label="Message actions"]');
    await p.locator("[data-b7-target]").click();
    await p.getByRole("button", { name: "Delete" }).first().click();
    await p.getByRole("alertdialog").waitFor();
  };
  await open();
  await p.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await sleep(600);
  console.log("cancel: dialog", await p.getByRole("alertdialog").count(), "| text", await p.getByText(text, { exact: true }).count(), "| url", p.url().includes("channel="));
  await open();
  await p.goBack();
  await sleep(1200);
  console.log("back: dialog", await p.getByRole("alertdialog").count(), "| text", await p.getByText(text, { exact: true }).count(), "| url", p.url().includes("channel="));
  await c.close();
}
{ // 2. Desktop club room: Escape closes the confirm, not the chat.
  const c = await ctx(browser, "blake", { phone: false, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  const text = "B7 test: lounge escape check";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(600);
  const row = p.locator(".vibe-hover-row", { hasText: text }).last();
  await row.hover();
  await row.getByRole("button", { name: "More" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await p.getByRole("alertdialog").waitFor();
  await p.keyboard.press("Escape");
  await sleep(800);
  console.log("escape: dialog", await p.getByRole("alertdialog").count(), "| text", await p.getByText(text, { exact: true }).count(), "| room still open", await p.getByPlaceholder("Message the Lounge").count());
  await c.close();
}
{ // 3. The other person's OPEN phone DM, while Blake deletes.
  const c = await ctx(browser, "avery", { phone: true, dark: true });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
  const text = "B7 test: phone other side check";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  console.log("api delete:", await apiDelete(DM, "4a985f18-7c2d-49e8-81fd-92e6863301ca"));
  await sleep(8000);
  console.log("phone DM open, 8 s later, still shows the words:", await p.getByText(text, { exact: true }).count());
  await p.reload({ waitUntil: "load" });
  await sleep(3000);
  console.log("after reopening:", await p.getByText(text, { exact: true }).count());
  await c.close();
}
{ // 4. The other person's OPEN phone Lounge, while Blake deletes.
  const c = await ctx(browser, "avery", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  const text = "B7 test: lounge other side check";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  console.log("api delete:", await apiDelete(LO, "03da7fce-b08e-419e-b829-69225b10abdb"));
  const t0 = Date.now();
  const gone = await p.getByText(text, { exact: true }).first().waitFor({ state: "detached", timeout: 35000 }).then(() => true, () => false);
  console.log("phone Lounge open: words gone by themselves:", gone, "after", Date.now() - t0, "ms");
  await p.screenshot({ path: `${SHOTS}/B7-phone-light-lounge-other-side-live.png` });
  await c.close();
}
await browser.close();
