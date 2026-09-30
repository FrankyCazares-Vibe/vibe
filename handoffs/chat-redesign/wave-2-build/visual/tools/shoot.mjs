// The visual pass shooter (handoffs/chat-redesign/wave-2-build/visual).
//
// Shoots every new chat_v2 screen state of the REAL app (next dev, the API
// answered from fixtures.mjs through page.route) at 375×812 @2x in Light and
// Night, then every W0_* mockup at 390×844 (full page). Files land in OUT_DIR
// as <nn>-<state>-<light|night>.png and mockup-<Name>.png, with
// unmocked.json (every /api call the fixtures did not know) and shots.json
// (what was shot, with notes).
//
// Run (see README.md):
//   node fake-supabase.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
//     SUPABASE_SERVICE_ROLE_KEY=x npx next dev -p 3111 &
//   OUT_DIR=../out node shoot.mjs [--real-time] [--only=<substring>] [--themes=light|night] [--no-mockups] [--clip-week]
//
// --clip-week injects one harness-side style, `section[aria-labelledby="your-week-heading"]{overflow-x:clip}`
// (S2-notes REQUEST R8: the home's week bloom widens the mobile layout viewport past 375 until
// that clip lands in src/). Every shot records the layout viewport it was taken at
// (`layout: { innerWidth, scrollWidth }` in shots.json), so an overflow is visible in the record.
//
// Playwright is resolved from this folder's node_modules (never the repo's);
// Chromium from PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { makeFixtures, ZONE } from "./fixtures.mjs";
import { cookieFor } from "./harness-session.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${def}`).slice(name.length + 3);

const REAL_TIME = flag("real-time");
const ONLY = opt("only", "");
const THEMES = opt("themes", "light,night").split(",").filter(Boolean);
const NO_MOCKUPS = flag("no-mockups");
const CLIP_WEEK = flag("clip-week");
const APP = process.env.APP_URL || "http://localhost:3111";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const OUT = path.resolve(process.env.OUT_DIR || path.join(HERE, "out"));
// Defaults are for this file's committed home, handoffs/chat-redesign/wave-2-build/visual/tools/.
const MOCKUPS_DIR = path.resolve(process.env.MOCKUPS_DIR || path.join(HERE, "../../../boards"));
const FONTS = path.join(HERE, "fonts");
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium";
/** Thu 2026-10-08 18:12 in Indianapolis: the frozen browser clock and the fixtures' NOW. */
const NOW = REAL_TIME ? new Date() : new Date("2026-10-08T18:12:00-04:00");
const VIEWPORT = { width: 375, height: 812 };
const TALL = { width: 375, height: 2300 };

fs.mkdirSync(OUT, { recursive: true });
const fixtures = makeFixtures(NOW);
const { rooms, newestPostId, orgs } = fixtures.ids;
const unmocked = [];
const shots = [];
const consoleLog = [];
let currentState = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fonts served from disk (Chromium cannot reach Google Fonts in the cloud) ──
function fontFile(url) {
  const u = new URL(url);
  if (u.hostname === "fonts.googleapis.com") {
    const fam = u.searchParams.get("family") || "";
    return { file: path.join(FONTS, fam.includes("opsz") ? "mock.css" : "app.css"), type: "text/css" };
  }
  if (u.hostname === "fonts.gstatic.com") {
    return { file: path.join(FONTS, u.pathname.slice(1).replace(/\//g, "_")), type: "font/woff2" };
  }
  return null;
}
async function routeFonts(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const hit = fontFile(route.request().url());
    if (hit && fs.existsSync(hit.file)) {
      await route.fulfill({ status: 200, contentType: hit.type, body: fs.readFileSync(hit.file), headers: { "access-control-allow-origin": "*" } });
    } else {
      await route.fulfill({ status: 404, body: "" });
    }
  });
}

// ── the API from the fixtures ────────────────────────────────────────────────
let variant = {};
async function routeApi(page) {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const hit = fixtures.answer(req.method(), req.url(), { ...variant, postBody: req.postData() ?? undefined });
    if (!hit) {
      const line = `${req.method()} ${new URL(req.url()).pathname}${new URL(req.url()).search}`;
      if (!unmocked.includes(line)) unmocked.push(line);
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "not mocked", code: "not_found" }) });
      return;
    }
    if (hit.delayMs) await sleep(hit.delayMs);
    await route.fulfill({ status: hit.status, contentType: "application/json", body: JSON.stringify(hit.body) });
  });
  // The SSR desktop tree's iframe (MessagesSwitch renders it before hydration): never load it.
  await page.route("**/html/*.html*", (route) => route.fulfill({ status: 204, body: "" }));
}

// ── pages ────────────────────────────────────────────────────────────────────
async function newPage(context) {
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  // The Next dev-tools badge (<nextjs-portal>, bottom-left) sits exactly over
  // the composer's "+" and intercepts clicks (a document-level
  // `display:none !important` does not reach it): remove the host the moment
  // it appears, and keep removing it.
  await page.addInitScript(() => {
    const zap = () => {
      document.querySelectorAll("nextjs-portal").forEach((n) => {
        n.style.setProperty("display", "none", "important");
        n.style.setProperty("pointer-events", "none", "important");
        n.remove();
      });
    };
    // An init script runs before <html> exists, so the observer waits for <body>.
    const tick = setInterval(() => {
      zap();
      if (document.body) {
        new MutationObserver(zap).observe(document.body, { childList: true, subtree: true });
        clearInterval(tick);
      }
    }, 30);
  });
  if (CLIP_WEEK) {
    await page.addInitScript(() => {
      const add = () => {
        if (document.getElementById("harness-clip-week") || !document.head) return;
        const s = document.createElement("style");
        s.id = "harness-clip-week";
        s.textContent = 'section[aria-labelledby="your-week-heading"]{overflow-x:clip}';
        document.head.appendChild(s);
      };
      const tick = setInterval(() => {
        add();
        if (document.head) clearInterval(tick);
      }, 30);
    });
  }
  await routeFonts(page);
  await routeApi(page);
  page.on("pageerror", (e) => {
    console.error("  [pageerror]", e.message);
    consoleLog.push({ state: currentState, kind: "pageerror", text: e.message.slice(0, 400) });
  });
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const text = m.text();
    if (/favicon|404 \(Not Found\)/.test(text)) return;
    consoleLog.push({ state: currentState, kind: m.type(), text: text.slice(0, 400) });
    if (m.type() === "error") console.error("  [console]", text.split("\n")[0].slice(0, 160));
  });
  return page;
}
async function settle(page, ms = 600) {
  await page.evaluate(() => document.fonts.ready);
  await sleep(ms);
}
async function shot(page, name, theme, note = "", opts = {}) {
  const file = `${name}-${theme}.png`;
  // The Next dev-tools badge (a <nextjs-portal> host) is not the app: drop it before the shot.
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  await page.screenshot({ path: path.join(OUT, file), fullPage: false, ...opts });
  // The layout viewport at the shot: mobile Chromium widens it to the widest content (S2-notes R8).
  const layout = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  shots.push({ file, state: name, theme, note, layout, clipWeek: CLIP_WEEK });
  console.log(`  shot ${file}${note ? `  (${note})` : ""}  [layout ${layout.innerWidth}/${layout.scrollWidth}]`);
}
async function gotoHome(page, query = "") {
  await page.goto(`${APP}/messages${query}`, { waitUntil: "load" });
  await page.waitForSelector('[role="tablist"]', { timeout: 60_000 });
  await settle(page, 900);
}
async function openSpace(page, roomId, waitFor) {
  await page.goto(`${APP}/messages?channel=${roomId}`, { waitUntil: "load" });
  await page.waitForSelector(waitFor, { timeout: 60_000 });
  // vaul's slide-in and the thread's bottom anchoring.
  await settle(page, 1400);
}
const tallShot = async (page, name, theme, note) => {
  await page.setViewportSize(TALL);
  await settle(page, 900);
  await shot(page, name, theme, note);
  await page.setViewportSize(VIEWPORT);
  await settle(page, 400);
};
const tray = (page) => page.getByRole("button", { name: "Add a poll, sign-up or event" });
async function longPress(page, text) {
  const bubble = page.getByText(text).first();
  await bubble.scrollIntoViewIfNeeded();
  await sleep(1200);
  const box = await bubble.boundingBox();
  if (!box) throw new Error("bubble not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
}
const trayRow = (page, title) => page.getByRole("navigation", { name: /^Add to / }).getByRole("button", { name: new RegExp(`^${title}`) });

// ── the states ───────────────────────────────────────────────────────────────
// Each: { name, note, run(page, theme) }. `variant` is reset before each.
const STATES = [
  { name: "01-home-all", note: "All: 2 clubs (Salsa pinned + unread Board, Chess muted) merged with 2 dms + 1 group; the week with a live, a tonight and an ended card", run: (p, t) => gotoHome(p).then(() => shot(p, "01-home-all", t)) },
  { name: "02-home-chats", note: "Chats filter: dms + group only", run: (p, t) => gotoHome(p, "?tab=chats").then(() => shot(p, "02-home-chats", t)) },
  { name: "03-home-clubs", note: "Clubs filter", run: (p, t) => gotoHome(p, "?tab=clubs").then(() => shot(p, "03-home-clubs", t)) },
  { name: "04-home-requests", note: "Requests filter: one waiting", run: (p, t) => gotoHome(p, "?tab=requests").then(() => shot(p, "04-home-requests", t)) },
  {
    name: "05-home-no-clubs",
    note: "Clubs filter with clubs: [] (11.9.2)",
    run: async (p, t) => {
      variant = { clubsEmpty: true };
      await gotoHome(p, "?tab=clubs");
      await shot(p, "05-home-no-clubs", t);
    },
  },
  {
    name: "06-home-empty-week",
    note: "calendar entries: [] (11.9.1)",
    run: async (p, t) => {
      variant = { weekEmpty: true };
      await gotoHome(p);
      await shot(p, "06-home-empty-week", t);
    },
  },
  {
    name: "07-club-lounge",
    note: "Salsa Club on the Lounge via ?channel= (Up next: live + tonight; Board strip unread; the composer)",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await shot(p, "07-club-lounge", t);
      await tallShot(p, "08-club-lounge-full", t, "the same, 375×2300 so every Lounge row shows: text runs, poll, closed anonymous poll, sign-up, event card, cancelled card, removed own message, quote");
    },
  },
  {
    name: "09-board",
    note: "the Board, folded (4 posts newest first, one a card; Reply / 3 replies / 12 replies)",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaBoard, 'input[aria-label="Post to the Board"]');
      await shot(p, "09-board", t);
      await p.getByRole("button", { name: /^Show 3 replies/ }).first().click();
      await p.waitForSelector('[role="group"][aria-label="Replies"]', { timeout: 20_000 });
      await settle(p, 700);
      await shot(p, "10-board-fold-open", t, "the newest post's fold open: 2 replies + a stub, the Reply quietly field");
    },
  },
  {
    name: "11-event-live",
    note: "the event chat layer on Fall Formal (live; 5 going avatars; the viewer is going)",
    run: async (p, t) => {
      await openSpace(p, rooms.fallFormal, 'input[aria-label="Message the event chat"]');
      await shot(p, "11-event-live", t);
      await p.getByRole("button", { name: "You're going. Change your RSVP" }).click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await settle(p, 900);
      await shot(p, "20-rsvp-sheet", t, "the RSVP sheet over the live event chat");
    },
  },
  {
    name: "12-event-closed",
    note: "a closed event chat (Welcome Mixer, ended 19 days ago: Closed pill, the closed tile, no composer)",
    run: async (p, t) => {
      await openSpace(p, rooms.welcomeMixer, "text=This chat is closed.");
      await shot(p, "12-event-closed", t);
    },
  },
  {
    name: "13-event-after",
    note: "extra: an ended event chat still open (Open Practice: Ended · chat open N more days)",
    run: async (p, t) => {
      await openSpace(p, rooms.openPractice, 'input[aria-label="Message the event chat"]');
      await shot(p, "13-event-after", t);
    },
  },
  {
    name: "14-tray",
    note: "the + tray open over the Lounge",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await p.waitForSelector('nav[aria-label^="Add to "]', { timeout: 20_000 });
      await settle(p, 700);
      await shot(p, "14-tray", t);
      await trayRow(p, "Poll").click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await settle(p, 900);
      await shot(p, "15-new-poll-empty", t, "New poll, empty (CTA disabled)");
      await p.getByRole("textbox", { name: "Question" }).fill("Playlist for the formal?");
      await p.getByRole("textbox", { name: "Option 1" }).fill("Bachata-heavy");
      await p.getByRole("textbox", { name: "Option 2" }).fill("Classic salsa");
      await p.getByRole("button", { name: "Add option" }).click();
      await p.getByRole("textbox", { name: "Option 3" }).fill("Mix it up");
      await p.getByRole("switch", { name: /Anonymous/ }).click();
      await settle(p, 500);
      await shot(p, "16-new-poll-filled", t, "New poll filled: 3 options, Anonymous on, CTA enabled");
    },
  },
  {
    name: "17-new-signup",
    note: "New sign-up: a title and two slots (the stepper, Remove, Add slot)",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await trayRow(p, "Sign-up").click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await settle(p, 900);
      await p.getByRole("textbox", { name: "Title" }).fill("Rides to the formal");
      await p.getByRole("textbox", { name: "Slot 1" }).fill("Leaving from Union, 6:30");
      await p.getByRole("button", { name: "Add slot" }).click();
      await p.getByRole("textbox", { name: "Slot 2" }).fill("Leaving from Ball Hall, 6:45");
      await p.getByRole("button", { name: /^One more spot/ }).last().click();
      await settle(p, 500);
      await shot(p, "17-new-signup", t);
    },
  },
  {
    name: "18-share-event",
    note: "Share an event: 3 upcoming (one selected) + a note",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await trayRow(p, "Event").click();
      await p.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 20_000 });
      await settle(p, 900);
      await p.getByRole("radio").nth(1).click();
      await p.getByRole("textbox", { name: "Add a line, optional" }).fill("Come hang after the formal");
      await settle(p, 500);
      await shot(p, "18-share-event", t);
    },
  },
  {
    name: "19-share-event-empty",
    note: "Share an event with no upcoming events (CTA disabled)",
    run: async (p, t) => {
      variant = { shareEmpty: true };
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await trayRow(p, "Event").click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await p.getByText("No upcoming events.").waitFor({ timeout: 20_000 });
      await settle(p, 900);
      await shot(p, "19-share-event-empty", t);
    },
  },
  {
    name: "21-long-press-remove",
    note: "a 700 ms press (page.mouse) on Sam's bubble: the picker with Reply / Report / Remove (the viewer is an officer)",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      const bubble = p.getByText("Yes!! bringing the good one").first();
      await bubble.scrollIntoViewIfNeeded();
      await sleep(1200);
      const box = await bubble.boundingBox();
      if (!box) throw new Error("bubble not visible");
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await sleep(750);
      await p.mouse.up();
      await p.getByRole("button", { name: "Remove" }).waitFor({ timeout: 10_000 });
      await settle(p, 400);
      await shot(p, "21-long-press-remove", t);
    },
  },
  {
    name: "22-empty-club",
    note: "an officer's brand new club (Night Hikers: 1 member, no events, empty Lounge) — 11.9.3",
    run: async (p, t) => {
      await openSpace(p, rooms.hikersLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      // The screen writes a typographic apostrophe (It’s), so match either.
      await p.getByText(/It.s just you so far\./).waitFor({ timeout: 20_000 });
      await settle(p, 500);
      await shot(p, "22-empty-club", t);
    },
  },
  {
    name: "23-load-failed",
    note: "/api/me/inbox → 500: Couldn't load your clubs. in the club position, the threads still listed",
    run: async (p, t) => {
      variant = { inbox500: true };
      await gotoHome(p);
      await p.getByText("Couldn't load your clubs.").waitFor({ timeout: 20_000 });
      await settle(p, 500);
      await shot(p, "23-load-failed", t);
    },
  },
  {
    name: "24-skeleton",
    note: "/api/me/inbox delayed 10 s, shot ~1 s after load: the list skeleton under the week and the filters",
    run: async (p, t) => {
      variant = { inboxDelayMs: 10_000 };
      await p.goto(`${APP}/messages`, { waitUntil: "load" });
      await p.waitForSelector('[role="tablist"]', { timeout: 60_000 });
      await sleep(1000);
      await shot(p, "24-skeleton", t);
    },
  },
  // ── run 2: the states the three reviews listed as "not shot" and reachable ──
  {
    name: "25-new-signup-empty",
    note: "run 2 (review-S3): New sign-up untouched — one slot, no X, the CTA disabled",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await trayRow(p, "Sign-up").click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await settle(p, 900);
      await shot(p, "25-new-signup-empty", t);
    },
  },
  {
    name: "26-remove-confirm",
    note: "run 2 (review-S2): the long press on Sam's bubble, then Remove — the RemoveConfirm alert dialog",
    run: async (p, t) => {
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await longPress(p, "Yes!! bringing the good one");
      await p.getByRole("button", { name: "Remove" }).waitFor({ timeout: 10_000 });
      await p.getByRole("button", { name: "Remove" }).click();
      await p.waitForSelector('[role="alertdialog"]', { timeout: 10_000 });
      await settle(p, 500);
      await shot(p, "26-remove-confirm", t);
    },
  },
  {
    name: "27-member-board",
    note: "run 2 (review-S2): a member's Board (Chess Club): Nothing on the Board yet. + the Only officers post tile",
    run: async (p, t) => {
      await openSpace(p, rooms.chessBoard, "text=Nothing on the Board yet.");
      await shot(p, "27-member-board", t);
    },
  },
  {
    name: "28-member-lounge-picker",
    note: "run 2 (review-S2): a member's Lounge (Chess Club) with the picker on Priya's bubble (its Message actions button) — Reply / Report, no Remove",
    run: async (p, t) => {
      await openSpace(p, rooms.chessLounge, "text=Anyone up for blitz tonight?");
      // The 700 ms press does not open the picker on this two-row Lounge in the harness
      // (it does on Salsa's, state 21); the bubble's "Message actions" button opens the same picker.
      await p.getByRole("button", { name: "Message actions" }).first().click();
      await p.getByRole("button", { name: "Report this message" }).waitFor({ timeout: 10_000 });
      await settle(p, 400);
      await shot(p, "28-member-lounge-picker", t);
    },
  },
  {
    name: "29-event-empty-soon",
    note: "run 2 (review-S2): an empty event chat that starts tonight (Late Night Social): the Soon pill, Say hi to everyone going., the Maybe pill",
    run: async (p, t) => {
      await openSpace(p, rooms.lateNight, "text=Say hi to everyone going.");
      await shot(p, "29-event-empty-soon", t);
    },
  },
  {
    name: "30-home-chats-empty",
    note: "run 2 (review-S1): Chats with no threads (EmptyState tab=all)",
    run: async (p, t) => {
      variant = { threadsEmpty: true };
      await gotoHome(p, "?tab=chats");
      await p.getByText("No conversations yet").waitFor({ timeout: 20_000 });
      await settle(p, 400);
      await shot(p, "30-home-chats-empty", t);
    },
  },
  {
    name: "31-home-requests-empty",
    note: "run 2 (review-S1): Requests with none waiting (EmptyState tab=requests)",
    run: async (p, t) => {
      variant = { threadsEmpty: true };
      await gotoHome(p, "?tab=requests");
      await p.getByText("No message requests").waitFor({ timeout: 20_000 });
      await settle(p, 400);
      await shot(p, "31-home-requests-empty", t);
    },
  },
  {
    name: "32-week-failed",
    note: "run 2 (review-S1): /api/me/calendar → 500: Couldn't load your week. in the week's row",
    run: async (p, t) => {
      variant = { calendar500: true };
      await gotoHome(p);
      await p.getByText("Couldn't load your week.").waitFor({ timeout: 20_000 });
      await settle(p, 400);
      await shot(p, "32-week-failed", t);
    },
  },
  {
    name: "33-club-failed",
    note: "run 2 (review-S2): /api/orgs/salsa-club/space → 500: Couldn't load this club. in the club layer",
    run: async (p, t) => {
      variant = { space500: true };
      await openSpace(p, rooms.salsaLounge, "text=Couldn't load this club.");
      await shot(p, "33-club-failed", t);
    },
  },
  {
    name: "34-board-failed",
    note: "run 2 (review-S2): the Board chip tapped from the Lounge with the Board's read → 500: Couldn't load the Board.",
    run: async (p, t) => {
      // The ?channel= deep link resolves the room through the same thread GET, so a 500 there
      // never opens the club: open the Lounge and tap the Board chip instead.
      variant = { thread500: rooms.salsaBoard };
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await p.getByRole("navigation", { name: /^Rooms in / }).getByRole("button", { name: /^Board/ }).click();
      await p.getByText("Couldn't load the Board.").waitFor({ timeout: 20_000 });
      await settle(p, 700);
      await shot(p, "34-board-failed", t);
    },
  },
  {
    name: "35-share-events-failed",
    note: "run 2 (review-S3): Share an event with the list failing (space?events=1 → 500): Couldn't load your events.",
    run: async (p, t) => {
      variant = { shareEvents500: true };
      await openSpace(p, rooms.salsaLounge, 'button[aria-label="Add a poll, sign-up or event"]');
      await tray(p).click();
      await trayRow(p, "Event").click();
      await p.waitForSelector('[role="dialog"]', { timeout: 20_000 });
      await p.getByText("Couldn't load your events.").waitFor({ timeout: 20_000 });
      await settle(p, 900);
      await shot(p, "35-share-events-failed", t);
    },
  },
  {
    name: "36-flag-pending",
    note: "run 2 (review-S1): /api/me/features delayed 10 s, shot ~1 s after load: the FlagPending header (no pills) over the list skeleton",
    run: async (p, t) => {
      variant = { featuresDelayMs: 10_000 };
      await p.goto(`${APP}/messages`, { waitUntil: "load" });
      await p.getByRole("button", { name: "New message" }).waitFor({ timeout: 60_000 });
      await sleep(1000);
      await shot(p, "36-flag-pending", t);
    },
  },
];

// ── the mockups ──────────────────────────────────────────────────────────────
const MOCKUPS = ["W0_Home", "W0_EmptyWeek", "W0_EmptyClubs", "W0_Club", "W0_Club_Light", "W0_Board", "W0_Room", "W0_Cards", "W0_Tray", "W0_NewPoll", "W0_NewSignup", "W0_ShareEvent", "W0_EmptyClub"];

async function shootMockups(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: ZONE, locale: "en-US" });
  for (const name of MOCKUPS) {
    const file = path.join(MOCKUPS_DIR, `${name}.dc.html`);
    if (!fs.existsSync(file)) {
      console.warn(`  mockup missing: ${file}`);
      continue;
    }
    const page = await context.newPage();
    await routeFonts(page);
    await page.goto(`file://${file}`, { waitUntil: "load" });
    await settle(page, 800);
    const out = `mockup-${name}.png`;
    await page.screenshot({ path: path.join(OUT, out), fullPage: true });
    shots.push({ file: out, state: name, theme: "mockup", note: "the design, 390 wide, full page" });
    console.log(`  shot ${out}`);
    await page.close();
  }
  await context.close();
}

// ── PNG size: palette-quantize anything over ~300 KB (sharp from the repo) ───
async function shrink() {
  let sharp = null;
  try {
    const req = createRequire(import.meta.url);
    sharp = req(process.env.SHARP_DIR || path.join(HERE, "../../../../../node_modules/sharp"));
  } catch (e) {
    console.warn("  sharp not available, PNGs left as shot:", e.message);
    return;
  }
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".png"))) {
    const file = path.join(OUT, f);
    const before = fs.statSync(file).size;
    if (before <= 300 * 1024) continue;
    const tmp = `${file}.tmp`;
    await sharp(file).png({ palette: true, quality: 92, compressionLevel: 9, effort: 8 }).toFile(tmp);
    fs.renameSync(tmp, file);
    console.log(`  shrunk ${f}: ${(before / 1024).toFixed(0)} KB → ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`NOW = ${NOW.toISOString()} (${REAL_TIME ? "wall clock" : "frozen"}), app ${APP}, out ${OUT}`);
  fs.mkdirSync(path.join(OUT, "fixtures"), { recursive: true });
  for (const [name, body] of Object.entries(fixtures.dump())) fs.writeFileSync(path.join(OUT, "fixtures", name), JSON.stringify(body, null, 2));

  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined, headless: true });
  const cookie = cookieFor(SUPABASE_URL);
  const states = STATES.filter((s) => !ONLY || s.name.includes(ONLY) || s.note.includes(ONLY));

  for (const theme of THEMES) {
    const night = theme === "night";
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      timezoneId: ZONE,
      locale: "en-US",
      colorScheme: night ? "dark" : "light",
    });
    await context.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }]);
    // What theme.ts reads before paint: the device preference, resolved by THEME_BOOT_SCRIPT.
    await context.addInitScript((pref) => {
      try {
        localStorage.setItem("vibe_theme", pref);
      } catch {}
    }, night ? "dark" : "light");

    // Warm the dev server's compile of /messages once, so the first state is not the slow one.
    if (states.length) {
      const warm = await newPage(context);
      await warm.goto(`${APP}/messages`, { waitUntil: "load", timeout: 180_000 });
      await warm.waitForSelector('[role="tablist"]', { timeout: 120_000 });
      await warm.close();
    }

    for (const state of states) {
      variant = {};
      currentState = `${state.name}-${theme}`;
      console.log(`[${theme}] ${state.name}`);
      const page = await newPage(context);
      try {
        await state.run(page, theme);
      } catch (e) {
        console.error(`  FAILED ${state.name} (${theme}): ${e.message.split("\n").slice(0, 14).join("\n    ")}`);
        try {
          await page.screenshot({ path: path.join(OUT, `${state.name}-${theme}-FAILED.png`) });
        } catch {}
        shots.push({ file: null, state: state.name, theme, note: `FAILED: ${e.message.split("\n")[0]}` });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  if (!NO_MOCKUPS) await shootMockups(browser);
  await browser.close();
  await shrink();
  // A partial run (--only / --themes / --no-mockups) merges into the previous run's records.
  const readJson = (f, def) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
    } catch {
      return def;
    }
  };
  const partial = !!ONLY || NO_MOCKUPS || THEMES.length < 2;
  const prevShots = partial ? readJson("shots.json", { shots: [] }).shots : [];
  const shotKey = (s) => `${s.state}|${s.theme}`;
  const mergedShots = [...prevShots.filter((s) => !shots.some((n) => shotKey(n) === shotKey(s))), ...shots].sort((a, b) => (a.file ?? a.state).localeCompare(b.file ?? b.state));
  const prevUnmocked = partial ? readJson("unmocked.json", []) : [];
  const prevConsole = partial ? readJson("console.json", []).filter((c) => !shots.some((n) => `${n.state}-${n.theme}` === c.state)) : [];
  fs.writeFileSync(path.join(OUT, "unmocked.json"), JSON.stringify([...new Set([...prevUnmocked, ...unmocked])], null, 2));
  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify([...prevConsole, ...consoleLog], null, 2));
  fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify({ now: NOW.toISOString(), realTime: REAL_TIME, shots: mergedShots }, null, 2));
  console.log(`done: ${shots.filter((s) => s.file).length} files, ${unmocked.length} unmocked call(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
