// Record the demo: the landing hero, Franky's morning in the app, the closing wordmark.
// LOCAL dev server and LOCAL database only (run scripts/demo-seed.mjs first, the same day).
//   DEMO_BASE=http://localhost:3102 node scripts/demo-video/record.mjs && scripts/demo-video/cut.sh
// Writes raw .webm clips and cuts.json; cut.sh joins them into one vertical mp4.
import { execSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { BASE, glide, onScreen, open, tap, wait } from "./lib.mjs";

// Clips go OUTSIDE the repo: they show Franky's own pictures and the repo is public.
const OUT = (process.env.DEMO_OUT ?? `${process.env.HOME}/vibe-demo-video/take`).replace(/\/?$/, "/");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const LINE = "hey are you going to this event tonight?";
const cuts = {};

/** One recorded context. `run` gets (page, mark): mark(name) notes a time, in seconds from the clip's start. */
async function clip(name, who, run) {
  const { browser, context, page } = await open({ who, video: OUT });
  const t0 = Date.now();
  const marks = {};
  const mark = (m) => { marks[m] = (Date.now() - t0) / 1000; };
  try {
    await run(page, mark);
  } finally {
    const video = page.video();
    await context.close();
    renameSync(await video.path(), `${OUT}${name}.webm`);
    await browser.close();
    cuts[name] = marks;
    console.log(name, JSON.stringify(marks));
  }
}

// 1. The landing page hero: the sky lights up.
await clip("a-hero", null, async (page, mark) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  mark("start");
  await wait(4600);
  mark("end");
});

// 2. The app, as Franky.
const takeStart = new Date().toISOString();
await clip("b-app", "franky", async (page, mark) => {
  await page.goto(`${BASE}/campus`, { waitUntil: "networkidle" });
  await wait(1200);
  mark("start");
  await wait(1400);
  await glide(page, 1500, 6200);
  await wait(900);
  // Back to the top first: the panes share one vertical scroll, so Events would open scrolled past its cards.
  await glide(page, -1500, 1300);
  await wait(500);

  await tap(page, page.getByRole("button", { name: "Events", exact: true }).first(), { pause: 3200 });
  mark("events");

  await tap(page, page.getByRole("button", { name: "Orgs", exact: true }).first(), { pause: 1500 });
  await tap(page, await onScreen(page, page.locator('a[href="/orgs/sae"]')), { pause: 400 });
  await page.waitForURL("**/orgs/sae");
  await wait(2600);
  await glide(page, 620, 3200);
  await wait(1600);
  mark("sae");

  await tap(page, page.locator('a[href="/campus"]').last(), { pause: 400 });
  await page.waitForURL("**/campus");
  await wait(2200);
  await tap(page, await onScreen(page, page.getByRole("button", { name: "More actions", exact: true })), { pause: 1100 });
  await tap(page, page.getByText("Send to chats", { exact: true }).last(), { pause: 1300 });
  await tap(page, page.locator("button, label", { hasText: "@jamesandres" }).last(), { pause: 700 });
  await tap(page, page.getByPlaceholder("Add a message (optional)"), { pause: 400 });
  await page.keyboard.type(LINE, { delay: 62 });
  await wait(700);
  await tap(page, page.getByRole("button", { name: /^Send/ }).last(), { pause: 1800 });
  mark("sent");

  await tap(page, page.locator('a[href="/messages"]').last(), { pause: 400 });
  await page.waitForURL("**/messages");
  await wait(1800);
  await tap(page, page.locator("button", { hasText: "James Andres" }).first(), { pause: 3600 });
  mark("end");
});

// The take wrote a shared post and a line into Franky's thread with James: take them back out,
// so the next take (and the seed's "ends on James's last line") starts from the same place.
try {
  const db = execSync("grep -m1 '^project_id' /Users/franciscocazares/vibe/supabase/config.toml", { encoding: "utf8" }).match(/"([^"]+)"/)[1];
  const sql = `delete from public.messages where created_at >= '${takeStart}' and user_id = (select id from public.users where handle = 'franky');`;
  console.log("cleanup:", execSync(`docker exec -i supabase_db_${db} psql -U postgres -d postgres -tA -c "${sql}"`, { encoding: "utf8" }).trim());
} catch (e) {
  console.log("cleanup FAILED, the take's messages are still in the thread:", e.message.split("\n")[0]);
}

// 3. The landing page's closing wordmark and tagline.
await clip("c-close", null, async (page, mark) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => { const el = document.querySelector(".vln-close"); window.scrollTo(0, el.offsetTop - 90); });
  await wait(1200);
  mark("start");
  await wait(4200);
  mark("end");
});

writeFileSync(`${OUT}cuts.json`, JSON.stringify(cuts, null, 2));
console.log("done");
