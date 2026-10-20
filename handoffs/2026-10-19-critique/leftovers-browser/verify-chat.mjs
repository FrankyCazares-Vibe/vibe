// Items 1-3 of the delete-own-message leftovers, LOCAL ONLY. Rows: "S80 fix: ..." (cleanup in cleanup.sql).
import { chromium, ctx, api, BASE, SHOTS, sleep, until } from "./lib.mjs";

const DM = "c1fd3fec-a59c-402f-8a90-5d9c36137bba"; // blake <-> avery
const GR = "98fb9cd2-8630-4c3d-88f2-c3e91182e32f"; // a group with both
const BO = "d3c31eb8-01af-4654-9b47-034ddaea8b3f"; // the club's Board
const out = {};
const send = async (who, ch, content, extra = {}) => {
  const r = await api(who, "POST", `/api/me/threads/${ch}/messages`, { content, ...extra });
  if (r.status !== 200 || !r.json?.message?.id) throw new Error(`send ${who} ${ch}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.message.id;
};
const del = async (who, ch, id) => (await api(who, "DELETE", `/api/me/threads/${ch}/messages/${id}`)).json;
const blakeCounts = async () => {
  const [threads, badge, otto] = await Promise.all([
    api("blake", "GET", "/api/me/threads"),
    api("blake", "GET", "/api/me/badge"),
    api("blake", "GET", "/api/me/otto"),
  ]);
  const all = [...(threads.json?.threads ?? []), ...(threads.json?.requests ?? [])];
  const dm = all.find((t) => t.id === DM);
  const gr = all.find((t) => t.id === GR);
  return {
    dm: dm && { unread: dm.unread, preview: dm.last_message?.content, deleted: dm.last_message?.deleted ?? false },
    gr: gr && { unread: gr.unread, preview: gr.last_message?.content, deleted: gr.last_message?.deleted ?? false },
    badgeMessages: badge.json?.messages,
    ottoUnread: otto.json?.counts?.unread,
  };
};

// ── 1. Unread counts (blake's chats closed) ─────────────────────────────────
await api("blake", "POST", `/api/me/threads/${DM}/read`);
await api("blake", "POST", `/api/me/threads/${GR}/read`);
out.before = await blakeCounts();
const u1 = await send("avery", DM, "S80 fix: unread check in the dm");
const u2 = await send("avery", GR, "S80 fix: unread check in the group");
out.afterSend = await blakeCounts();
out.del1 = await del("avery", DM, u1);
out.del2 = await del("avery", GR, u2);
out.afterDelete = await blakeCounts();

// ── 3. No reply under a deleted Board post ──────────────────────────────────
const post = await send("avery", BO, "S80 fix: Board post that will be deleted");
const live = await api("blake", "POST", `/api/me/threads/${BO}/messages`, { content: "S80 fix: reply while the post is live", thread_root_id: post });
out.replyLive = live.status;
out.delPost = await del("avery", BO, post);
const dead = await api("blake", "POST", `/api/me/threads/${BO}/messages`, { content: "S80 fix: reply after the post was deleted", thread_root_id: post });
out.replyDeleted = { status: dead.status, body: dead.json };

// ── 2. The phone's open dm / group sees the other side (390) ────────────────
const browser = await chromium.launch();
async function phoneWatch(channel, dark, tag) {
  const c = await ctx(browser, "blake", { phone: true, dark });
  const p = await c.newPage();
  const reads = [];
  p.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(`/threads/${channel}/read`)) reads.push(Date.now()); });
  await p.goto(`${BASE}/messages?channel=${channel}`, { waitUntil: "load" });
  await p.getByText("Message deleted", { exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const notesBefore = await p.getByText("Message deleted", { exact: true }).count();
  const text = `S80 fix: ${tag} arrives on the open phone`;
  const id = await send("avery", channel, text);
  const tArrive = await until(async () => (await p.getByText(text, { exact: true }).count()) > 0, 15000);
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/S80fix-phone-${dark ? "night" : "light"}-${tag}-arrived.png` });
  const readsAfterArrive = reads.length;
  await del("avery", channel, id);
  const tDelete = await until(async () => (await p.getByText(text, { exact: true }).count()) === 0, 15000);
  await sleep(400);
  const notesAfter = await p.getByText("Message deleted", { exact: true }).count();
  await p.screenshot({ path: `${SHOTS}/S80fix-phone-${dark ? "night" : "light"}-${tag}-deleted.png` });
  await c.close();
  return { arriveMs: tArrive, deleteMs: tDelete, notesBefore, notesAfter, markReadOnMount: reads.length > 0, markReadAfterArrive: readsAfterArrive >= 2 };
}
out.phoneDm = await phoneWatch(DM, true, "dm");
out.phoneGroup = await phoneWatch(GR, false, "group");

// ── The lists after (phone 390 + desktop 1440) ──────────────────────────────
{
  const c = await ctx(browser, "blake", { phone: true, dark: false });
  const p = await c.newPage();
  await p.goto(`${BASE}/messages`, { waitUntil: "load" });
  await p.getByText("Message deleted").first().waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(1200);
  await p.screenshot({ path: `${SHOTS}/S80fix-phone-light-home-after.png` });
  out.phoneHomeUnreadLabels = await p.locator('[aria-label*=", unread"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await c.close();
}
{
  const c = await ctx(browser, "blake", { phone: false, dark: true });
  const p = await c.newPage();
  await p.goto(`${BASE}/messages?channel=${DM}`, { waitUntil: "load" });
  await sleep(4000);
  // The desktop pane (an iframe) on the dm: a message Avery sends and deletes while it is open.
  const frame = p.frames().find((f) => f.url().includes("/html/messages.html"));
  const text = "S80 fix: desktop pane still learns of it";
  const id = await send("avery", DM, text);
  const tA = frame ? await until(async () => (await frame.locator(".msg-row", { hasText: text }).count()) > 0, 15000) : null;
  await del("avery", DM, id);
  const tD = frame ? await until(async () => (await frame.locator(".msg-row", { hasText: text }).count()) === 0, 15000) : null;
  await sleep(500);
  await p.screenshot({ path: `${SHOTS}/S80fix-desktop-night-dm-after.png` });
  out.desktopPane = { frame: !!frame, arriveMs: tA, deleteMs: tD };
  await c.close();
}
await browser.close();
out.final = await blakeCounts();
console.log(JSON.stringify(out, null, 2));
