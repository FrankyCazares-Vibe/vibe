// B7 review repair (Oct 19, 2026): the browser walk for findings 2, 3, 5 and 6.
// LOCAL dev server only. Posts its own rows through the app's routes, all
// starting "B7 rv:"; afterwards delete them and the notes they leave:
//   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "delete from public.messages where content like 'B7 rv:%' or deleted_at is not null;"
// Run from /Users/franciscocazares/vibe: node handoffs/2026-10-19-critique/b7-browser/review.mjs
import { execSync } from "node:child_process";
import { chromium, ctx, BASE, SHOTS, sleep } from "./lib.mjs";

const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba", LO = "3ea7db07-0b86-46f4-b7e2-b267b0461c04", BO = "d3c31eb8-01af-4654-9b47-034ddaea8b3f";
const cookie = (who) => execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" }).trim();
const H = (who) => ({ Cookie: cookie(who), "content-type": "application/json", origin: BASE });
async function api(who, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H(who), body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: j };
}
const post = async (who, ch, body) => (await api(who, "POST", `/api/me/threads/${ch}/messages`, body)).body?.message?.id;
const browser = await chromium.launch();
async function pane(p) {
  for (let i = 0; i < 60; i++) {
    const f = p.frames().find((fr) => fr.url().includes("/html/messages.html"));
    if (f) return f;
    await sleep(500);
  }
  throw new Error("no pane frame");
}

// ── 2a. Desktop DM pane, 1440 Night: the quote under Avery's reply. ─────────
{
  const q = await post("blake", DM, { content: "B7 rv: desktop quoted words" });
  await post("avery", DM, { content: "B7 rv: replying to that", parent_message_id: q });
  const ca = await ctx(browser, "avery", { phone: false, dark: true });
  const pa = await ca.newPage();
  await pa.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
  const fa = await pane(pa);
  await fa.locator(".msg-row", { hasText: "B7 rv: replying to that" }).first().waitFor({ timeout: 30000 });
  const cb = await ctx(browser, "blake", { phone: false, dark: true });
  const pb = await cb.newPage();
  await pb.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
  const fb = await pane(pb);
  const wrap = fb.locator(".dm-bubble-wrap", { hasText: "B7 rv: desktop quoted words" }).filter({ hasNot: fb.locator(".dm-quote") }).last();
  await wrap.waitFor({ timeout: 30000 });
  await wrap.scrollIntoViewIfNeeded();
  await wrap.hover();
  await sleep(300);
  await wrap.locator(".dm-act-del").click();
  const dlg = fb.getByRole("alertdialog");
  await dlg.waitFor();
  const [resp] = await Promise.all([
    pb.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    dlg.getByRole("button", { name: "Delete" }).click(),
  ]);
  console.log("2a DELETE", resp.status(), await resp.text());
  await sleep(400);
  const ownQuote = await fb.locator(".dm-quote-body").evaluateAll((els) => els.map((e) => e.textContent));
  console.log("2a blake's pane, quotes right after:", JSON.stringify(ownQuote.slice(-3)));
  await pb.screenshot({ path: `${SHOTS}/B7-rv-desk-night-pane-blake-after.png` });
  const t0 = Date.now();
  let healed = false;
  for (let i = 0; i < 20 && !healed; i++) {
    await sleep(500);
    const qs = await fa.locator(".dm-quote-body").evaluateAll((els) => els.map((e) => e.textContent));
    healed = !qs.some((t) => (t || "").includes("B7 rv: desktop quoted words")) && qs.includes("Message deleted");
  }
  console.log("2a avery's open pane: quote healed", healed, "after", Date.now() - t0, "ms");
  await pa.screenshot({ path: `${SHOTS}/B7-rv-desk-night-pane-avery-after.png` });

  // ── 3. Pin and react on the note, as Avery (her pane still shows the old row's menu on a phone). ──
  const pin = await api("avery", "PUT", `/api/me/threads/${DM}/messages/${q}/pin`);
  const react = await api("avery", "POST", `/api/me/threads/${DM}/messages/${q}/react`, { emoji: "🔥" });
  console.log("3 pin on the note:", pin.status, JSON.stringify(pin.body), "| react:", react.status, JSON.stringify(react.body));
  await ca.close(); await cb.close();
}

// ── 2b. Phone DM, 390 Light: Blake deletes; the quote under Avery's reply. ───
{
  const q = await post("blake", DM, { content: "B7 rv: phone quoted words" });
  await post("avery", DM, { content: "B7 rv: phone reply", parent_message_id: q });
  const c = await ctx(browser, "blake", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + DM, { waitUntil: "load" });
  await p.getByText("B7 rv: phone reply", { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(800);
  const tagged = await p.evaluate(() => {
    const leaf = Array.from(document.querySelectorAll("body *")).filter((el) => el.textContent === "B7 rv: phone quoted words" && el.offsetParent !== null && !el.closest('[style*="ellipsis"]'));
    let el = leaf[leaf.length - 1];
    for (let i = 0; i < 8 && el; i++) {
      const b = el.querySelector('button[aria-label="Message actions"]');
      if (b) { b.setAttribute("data-rv", ""); return true; }
      el = el.parentElement;
    }
    return false;
  });
  console.log("2b tagged the bubble's menu:", tagged);
  await p.locator("[data-rv]").click();
  await p.getByRole("button", { name: "Delete" }).first().click();
  const dlg = p.getByRole("alertdialog");
  await dlg.waitFor();
  const [resp] = await Promise.all([
    p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    dlg.getByRole("button", { name: "Delete" }).click(),
  ]);
  console.log("2b DELETE", resp.status(), await resp.text());
  await sleep(600);
  console.log("2b the words left on screen:", await p.getByText("B7 rv: phone quoted words").count());
  await p.screenshot({ path: `${SHOTS}/B7-rv-phone-light-dm-quote-after.png` });
  await c.close();
}

// ── 6. Desktop Lounge, 1440 Light: focus after a keyboard delete. ────────────
{
  await post("blake", LO, { content: "B7 rv: lounge focus check" });
  const c = await ctx(browser, "blake", { phone: false, dark: false });
  const p = await c.newPage();
  await p.goto(BASE + "/messages?channel=" + LO, { waitUntil: "load" });
  const text = "B7 rv: lounge focus check";
  await p.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await sleep(700);
  const row = p.locator(".vibe-hover-row", { hasText: text }).last();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await sleep(300);
  await row.getByRole("button", { name: "More" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await p.getByRole("alertdialog").waitFor();
  await p.keyboard.press("Tab");
  const [resp] = await Promise.all([
    p.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/messages/")),
    p.keyboard.press("Enter"),
  ]);
  console.log("6 DELETE", resp.status());
  await sleep(600);
  const active = await p.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName} data-chat-row=${a.getAttribute("data-chat-row") !== null} text=${(a.textContent || "").trim().slice(0, 30)}` : "none";
  });
  console.log("6 focus after the delete:", active);
  await p.screenshot({ path: `${SHOTS}/B7-rv-desk-light-lounge-focus-after.png` });
  await c.close();
}

// ── 5. A deleted Board post in the inbox, as Blake: "Post deleted", flagged, no unread dot. ──
{
  await api("blake", "GET", "/api/me/inbox"); // nothing to mark; just warm the route
  await api("blake", "POST", `/api/me/threads/${BO}/read`).catch(() => null);
  const pid = await post("avery", BO, { content: "B7 rv: Board post to delete" });
  const before = (await api("blake", "GET", "/api/me/inbox")).body?.clubs?.find((c) => c.board?.room_id === BO);
  console.log("5 before:", JSON.stringify(before?.board));
  const del = await api("avery", "DELETE", `/api/me/threads/${BO}/messages/${pid}`);
  console.log("5 DELETE", del.status, JSON.stringify(del.body));
  const after = (await api("blake", "GET", "/api/me/inbox")).body?.clubs?.find((c) => c.board?.room_id === BO);
  console.log("5 after:", JSON.stringify(after?.board));
  for (const dark of [false, true]) {
    const c = await ctx(browser, "blake", { phone: true, dark });
    const p = await c.newPage();
    await p.goto(BASE + "/messages", { waitUntil: "load" });
    await p.getByText("Post deleted").first().waitFor({ timeout: 30000 }).catch(() => console.log("5 no 'Post deleted' on the home"));
    await sleep(800);
    await p.screenshot({ path: `${SHOTS}/B7-rv-phone-${dark ? "night" : "light"}-home-board-post-deleted.png` });
    await c.close();
  }
}
await browser.close();
