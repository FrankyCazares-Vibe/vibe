// B7 review repair (Oct 19, 2026): focus after a keyboard delete of a Board post (desktop, 1440 Night).
// LOCAL only; its row starts "B7 rv:" and the cleanup line is in review.mjs's header.
import { execSync } from "node:child_process";
import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";
const BO = "d3c31eb8-01af-4654-9b47-034ddaea8b3f";
const H = { Cookie: execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs avery", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" }).trim(), "content-type": "application/json", origin: BASE };
await fetch(`${BASE}/api/me/threads/${BO}/messages`, { method: "POST", headers: H, body: JSON.stringify({ content: "B7 rv: Board focus check" }) });
const browser = await chromium.launch();
const c = await ctx(browser, "avery", { phone: false, dark: true });
const p = await c.newPage();
await p.goto(BASE + "/messages?channel=" + BO, { waitUntil: "load" });
const text = "B7 rv: Board focus check";
await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
await sleep(700);
const post = p.locator("article", { hasText: text }).first();
await post.getByRole("button", { name: "More" }).first().click();
await p.getByRole("menuitem", { name: "Delete" }).click();
await p.getByRole("alertdialog").waitFor();
await p.keyboard.press("Tab");
const [resp] = await Promise.all([
  p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
  p.keyboard.press("Enter"),
]);
console.log("DELETE", resp.status());
await sleep(700);
console.log("focus after:", await p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.getAttribute("data-chat-row") ? "data-chat-row" : ""} ${(a.textContent || "").includes("Post deleted") ? "holds 'Post deleted'" : ""}` : "none"; }));
await p.screenshot({ path: `${SHOTS}/B7-rv-desk-night-board-focus-after.png` });
await browser.close();
