// Shared helpers for the B8 browser checks. Every RSVP write is answered in
// the browser (page.route), and /api/me/calendar is the real answer plus the
// synthetic rows below, changed by those mocked RSVPs. No database writes.
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { execSync } from "node:child_process";

export const OUT = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/shots";
export const BASE = "http://localhost:3000";
export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
export const REAL = { study: "0e6e5e93-6939-4fd8-a18f-1e7dc6bc9849", game: "dfebb8db-c353-44ae-873f-8e1b9d390d40", gameRoom: "bed10830-5563-41a8-b875-625e12eb0dde" };

export function cookiesFor(who) {
  const s = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
  return s.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
export const EXTRA = [
  { kind: "rsvp", id: id(1), title: "Paddy Murphy Pickleball tournament on the quad", starts_at: at(21, 18), ends_at: at(21, 21), location: "Rec center", viewer_status: "going", org: { handle: "test_open_club", name: "Test Open Club", verified: false }, org_id: null, room_id: null, room_state: null },
  { kind: "rsvp", id: id(2), title: "Homecoming tailgate on the lawn behind the library", starts_at: at(21, 12), ends_at: at(21, 15), location: "Lawn", viewer_status: "maybe", org: { handle: "test_open_club", name: "Test Open Club", verified: false }, org_id: null, room_id: null, room_state: null },
  { kind: "personal", id: id(3), title: "Dentist", starts_at: at(21, 9), ends_at: null, location: "", notes: "", color: "#5A9CFF" },
  { kind: "personal", id: id(4), title: "Laundry", starts_at: at(21, 20), ends_at: null, location: "", notes: "", color: "#1C1C1E" },
  { kind: "personal", id: id(5), title: "Study group for the finance midterm, room 204", starts_at: at(23, 19), ends_at: null, location: "Library", notes: "Bring the practice exam", color: "#9B7BFF" },
  { kind: "rsvp", id: id(6), title: "Fall Formal at the Indiana Roof Ballroom", starts_at: at(24, 20), ends_at: at(24, 23), location: "Indiana Roof", viewer_status: "maybe", org: { handle: "test_open_club", name: "Test Open Club", verified: false }, org_id: null, room_id: null, room_state: null },
  { kind: "personal", id: id(7), title: "Call home", starts_at: at(24, 11), ends_at: null, location: "", notes: "", color: "#5BD18C" },
  { kind: "personal", id: id(8), title: "Run club", starts_at: at(26, 7), ends_at: null, location: "", notes: "", color: "#FF5C35" },
];

/** A context signed in as `who`, theme forced, with the stateful mocks. */
export async function makeCtx(browser, who, { theme, width, height, phone = false, extra = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme === "night" ? "dark" : "light",
    ...(phone ? { userAgent: IPHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addCookies(cookiesFor(who));
  await ctx.addInitScript((t) => { try { localStorage.setItem("vibe_theme", t); } catch {} }, theme === "night" ? "dark" : "light");
  const rsvp = new Map();
  const log = [];
  await ctx.route("**/api/events/*/rsvp", async (route) => {
    const ev = route.request().url().split("/api/events/")[1].split("/")[0];
    const m = route.request().method();
    const body = m === "PUT" ? JSON.parse(route.request().postData() || "{}") : {};
    rsvp.set(ev, m === "DELETE" ? null : body.status);
    log.push(`MOCK ${m} rsvp ${ev.slice(0, 8)} ${body.status ?? ""}`);
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await ctx.route("**/api/me/calendar*", async (route) => {
    if (route.request().url().includes("/ics")) return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    let entries = [...(j.entries || []), ...(extra ? EXTRA : [])];
    entries = entries
      .filter((e) => !(e.kind === "rsvp" && rsvp.get(e.id) === null))
      .map((e) => (e.kind === "rsvp" && rsvp.get(e.id) ? { ...e, viewer_status: rsvp.get(e.id) } : e))
      .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    await route.fulfill({ response: res, json: { ...j, entries } });
  });
  return { ctx, rsvp, log };
}

export async function settle(page, ms = 1200) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(ms);
}

export async function launch() {
  return chromium.launch();
}
