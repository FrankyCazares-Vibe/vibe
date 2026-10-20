import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba", GR = "98fb9cd2-8630-4c3d-88f2-c3e91182e32f";
const browser = await chromium.launch();
async function pane(p) {
  for (let i = 0; i < 60; i++) {
    const f = p.frames().find((fr) => fr.url().includes("/html/messages.html"));
    if (f) return f;
    await sleep(500);
  }
  throw new Error("no pane frame");
}
async function deleteInPane(p, f, text, base, dark) {
  const wrap = f.locator(".msg-row", { hasText: text }).last();
  await wrap.waitFor({ timeout: 30000 });
  await wrap.scrollIntoViewIfNeeded();
  await sleep(400);
  await f.locator(".dm-bubble-wrap", { hasText: text }).last().hover();
  await sleep(400);
  const del = f.locator(".dm-bubble-wrap", { hasText: text }).last().locator(".dm-act-del");
  await del.waitFor({ state: "visible", timeout: 5000 });
  await p.screenshot({ path: `${SHOTS}/${base}-pill.png` });
  await del.click();
  const dlg = f.getByRole("alertdialog");
  await dlg.waitFor();
  console.log(base, "dialog:", (await dlg.innerText()).replace(/\n+/g, " | "));
  await sleep(250);
  await p.screenshot({ path: `${SHOTS}/${base}-confirm.png` });
  const [resp] = await Promise.all([
    p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    dlg.getByRole("button", { name: "Delete" }).click(),
  ]);
  console.log(base, "DELETE", resp.status(), await resp.text());
  await f.locator(".msg-row", { hasText: text }).waitFor({ state: "detached", timeout: 10000 });
  await sleep(600);
  await p.screenshot({ path: `${SHOTS}/${base}-deleted.png` });
}
// Avery's desktop pane on the DM, open BEFORE Blake deletes: does the note arrive by itself?
const ca = await ctx(browser, "avery", { phone: false, dark: true });
const pa = await ca.newPage();
await pa.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
const fa = await pane(pa);
await fa.locator(".msg-row", { hasText: "B7 test: this one I will delete on desktop" }).first().waitFor({ timeout: 30000 });

const cb = await ctx(browser, "blake", { phone: false, dark: true });
const pb = await cb.newPage();
await pb.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
const fb = await pane(pb);
await deleteInPane(pb, fb, "B7 test: this one I will delete on desktop", "B7-desktop-night-dm", true);
const t0 = Date.now();
await fa.locator(".msg-row", { hasText: "B7 test: this one I will delete on desktop" }).waitFor({ state: "detached", timeout: 15000 }).then(
  () => console.log("avery's open pane dropped the text after", Date.now() - t0, "ms"),
  () => console.log("avery's open pane still shows it after 15 s"),
);
await sleep(500);
await pa.screenshot({ path: `${SHOTS}/B7-desktop-night-dm-other-side-live.png` });
console.log("avery pane notes:", await fa.locator(".dm-deleted").count());
await ca.close(); await cb.close();

// Light: a group, Blake.
const cl = await ctx(browser, "blake", { phone: false, dark: false });
const pl = await cl.newPage();
await pl.goto(BASE + "/messages?channel=" + GR, { waitUntil: "load" });
const fl = await pane(pl);
await deleteInPane(pl, fl, "B7 test: group line for desktop delete", "B7-desktop-light-group", false);
await browser.close();
