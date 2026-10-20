// Reproduce the uneven My Calendar month grid. READ-ONLY: /api/me/calendar is
// answered from the browser (page.route) with the real entries plus a few
// long-titled ones, so nothing touches the database.
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";

const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/calendar";
const cookieStr = execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = cookieStr.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });

const extra = [
  { kind: "rsvp", id: "00000000-0000-4000-8000-000000000001", title: "Paddy Murphy Pickleball tournament", starts_at: "2026-10-26T22:00:00.000Z", ends_at: "2026-10-27T01:00:00.000Z", location: "Rec center", color: "#5BD18C", viewer_status: "going", org: { handle: "sae", name: "SAE", verified: true }, org_id: null, room_id: null, room_state: null },
  { kind: "rsvp", id: "00000000-0000-4000-8000-000000000002", title: "Homecoming tailgate on the lawn", starts_at: "2026-10-26T16:00:00.000Z", ends_at: "2026-10-26T19:00:00.000Z", location: "Lawn", color: "#FFB85A", viewer_status: "maybe", org: null, org_id: null, room_id: null, room_state: null },
  { kind: "personal", id: "00000000-0000-4000-8000-000000000003", title: "Dentist", starts_at: "2026-10-26T14:00:00.000Z", ends_at: null, location: "", notes: "", color: "#FF5C35" },
  { kind: "personal", id: "00000000-0000-4000-8000-000000000004", title: "Study group for the finance midterm", starts_at: "2026-10-08T23:00:00.000Z", ends_at: null, location: "", notes: "", color: "#7C5CFF" },
];

const mode = process.argv[2] || "mock";
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  let calGets = 0;
  await page.route("**/api/me/calendar*", async (route) => {
    calGets++;
    if (mode !== "mock") return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    j.entries = [...(j.entries || []), ...extra].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    await route.fulfill({ response: res, json: j });
  });
  await page.goto("http://localhost:3000/campus", { waitUntil: "load" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForSelector('button[title="Open full calendar"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('button[title="Open full calendar"]');
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(600);
  const widths = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const grids = [...dlg.querySelectorAll("div")].filter((d) => d.style.gridTemplateColumns === "repeat(7, 1fr)");
    const g = grids[0];
    const kids = [...g.children];
    const head = kids.slice(0, 7).map((k) => Math.round(k.getBoundingClientRect().width));
    const rows = [];
    for (let r = 0; r < 6; r++) rows.push(Math.round(kids[7 + r * 7].getBoundingClientRect().height));
    return { headerWidths: head, rowHeights: rows, gridWidth: Math.round(g.getBoundingClientRect().width) };
  });
  console.log(`${w}x${h} ${mode}`, JSON.stringify(widths), "calendar GETs:", calGets);
  await page.screenshot({ path: `${OUT}/my-calendar-${mode}-${w}.png` });
  await ctx.close();
}
await browser.close();
