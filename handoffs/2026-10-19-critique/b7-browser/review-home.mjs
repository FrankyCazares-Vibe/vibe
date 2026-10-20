// B7 review repair (Oct 19, 2026): a DM whose last message was deleted, on the phone home (PersonRow).
// LOCAL only; its row starts "B7 rv:" and the cleanup line is in review.mjs's header.
import { execSync } from "node:child_process";
import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba";
const H = { Cookie: execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" }).trim(), "content-type": "application/json", origin: BASE };
const sent = await (await fetch(`${BASE}/api/me/threads/${DM}/messages`, { method: "POST", headers: H, body: JSON.stringify({ content: "B7 rv: last line to delete" }) })).json();
const del = await (await fetch(`${BASE}/api/me/threads/${DM}/messages/${sent.message.id}`, { method: "DELETE", headers: H })).json();
console.log("DELETE", JSON.stringify(del));
const threads = await (await fetch(`${BASE}/api/me/threads`, { headers: H })).json();
console.log("thread preview:", JSON.stringify((threads.threads || []).find((t) => t.id === DM)?.last_message));
const browser = await chromium.launch();
for (const dark of [false, true]) {
  const c = await ctx(browser, "blake", { phone: true, dark });
  const p = await c.newPage();
  await p.goto(BASE + "/messages", { waitUntil: "load" });
  await p.getByText("Message deleted").first().waitFor({ timeout: 30000 });
  await sleep(800);
  const style = await p.getByText("Message deleted", { exact: true }).first().evaluate((el) => getComputedStyle(el).fontStyle);
  console.log(dark ? "night" : "light", "row line style:", style);
  await p.screenshot({ path: `${SHOTS}/B7-rv-phone-${dark ? "night" : "light"}-home-dm-deleted-preview.png` });
  await c.close();
}
await browser.close();
