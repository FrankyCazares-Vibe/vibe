// Repair pass: the club page shows a linked event past the list's 60-day
// horizon (My Calendar reads 180 days ahead). One clearly named test event is
// made through the app's own route as avery (an officer of chat_seed_club,
// LOCAL database) and deleted through the app's route at the end.
import { BASE, OUT, launch, makeCtx, settle } from "../b8-after/common.mjs";
const ORG = "66a097ac-b729-472e-a086-13e12257edf2";
const browser = await launch();
const owner = await makeCtx(browser, "avery", { theme: "light", width: 1280, height: 800, extra: false });
const op = await owner.ctx.newPage();
await op.goto(`${BASE}/campus`, { waitUntil: "load" });
const made = await op.evaluate(async (org) => {
  const r = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org_id: org, title: "B8 repair test, delete me", description: "", location: "Test row", starts_at: "2027-01-15T01:00:00.000Z", ends_at: "2027-01-15T03:00:00.000Z" }) });
  return { status: r.status, body: await r.json() };
}, ORG);
const id = made.body?.event?.id ?? made.body?.id;
console.log("made:", made.status, id);
try {
  if (!id) throw new Error("no event made: " + JSON.stringify(made.body).slice(0, 200));
  for (const theme of ["night", "light"]) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { ctx } = await makeCtx(browser, "blake", { theme, width: w, height: h, phone: w < 768, extra: false });
      const page = await ctx.newPage();
      const urls = [];
      page.on("request", (q) => { if (q.url().includes("/api/events?org_id=")) urls.push(q.url().replace(BASE, "")); });
      await page.goto(`${BASE}/orgs/chat_seed_club?event=${id}`, { waitUntil: "load" });
      const found = await page.waitForSelector(`[data-event-anchor="${id}"]`, { timeout: 30000 }).then(() => true, () => false);
      await settle(page, 1500);
      const r = await page.evaluate((eid) => {
        const el = document.querySelector(`[data-event-anchor="${eid}"]`);
        const b = el?.getBoundingClientRect();
        return { inView: !!b && b.top >= 0 && b.bottom <= innerHeight + 1, focused: document.activeElement === el, toast: document.body.innerText.includes("isn't listed anymore"), docW: document.documentElement.scrollWidth };
      }, id);
      const plain = await page.evaluate(async (org) => (await fetch(`/api/events?org_id=${org}&limit=50`).then((x) => x.json())).events.map((e) => e.id), ORG);
      console.log(theme, w, "found:", found, JSON.stringify(r), "| list reads:", JSON.stringify(urls.map((u) => u.replace(/org_id=[^&]+/, "org_id=…"))), "| without include it is listed:", plain.includes(id));
      await page.screenshot({ path: `${OUT}/B8r-orglink-far-${theme}-${w}.png` });
      await ctx.close();
    }
  }
} finally {
  if (id) {
    const del = await op.evaluate(async (eid) => (await fetch(`/api/events/${eid}`, { method: "DELETE" })).status, id);
    const again = await op.evaluate(async ([eid, org]) => (await fetch(`/api/events?org_id=${org}&include=${eid}`).then((x) => x.json())).events.some((e) => e.id === eid), [id, ORG]);
    console.log("deleted:", del, "still listed with include:", again);
  }
  await browser.close();
}
