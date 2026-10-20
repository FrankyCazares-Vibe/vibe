/**
 * The static desktop profile's calendar reads and writes the real calendar
 * (critique D12, Oct 19, 2026). public/html/profile.html keeps it between
 * `// cal-real:start` and `// cal-real:end`; this file runs that block on a
 * small fake page (document, window, localStorage, BroadcastChannel) and
 * checks it beside B8's key (src/lib/calendar/calendar-key.ts).
 *
 * Run with:
 *   node --test src/lib/profile/static-profile-calendar.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const keySpecifier = "../calendar/calendar-key.ts";
const key = (await import(keySpecifier)) as typeof import("../calendar/calendar-key");

const REPO_ROOT = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("public/html/profile.html", REPO_ROOT), "utf8");
const START = "// cal-real:start";
const END = "// cal-real:end";
assert.equal(html.split(START).length - 1, 1);
assert.equal(html.split(END).length - 1, 1);
const block = html.slice(html.indexOf(START), html.indexOf(END));

type Req = { url: string; opts: { method?: string; json?: Record<string, unknown>; quiet?: boolean } };
type Answer = { ok: boolean; data?: unknown; message?: string };

/** A fresh page: the block run once, with every outside thing faked. */
function page(answer: (r: Req) => Answer, stored: Record<string, string> = {}) {
  const requests: Req[] = [];
  const posts: unknown[] = [];
  const toasts: string[] = [];
  const channelListeners: Array<(ev: { data: unknown }) => void> = [];
  const docListeners: Record<string, Array<() => void>> = {};
  const els: Record<string, { innerHTML: string; textContent: string; value: string; hidden: boolean; classList: { add(): void; remove(): void }; focus(): void }> = {};
  const el = (id: string) =>
    (els[id] ??= { innerHTML: "", textContent: "", value: "", hidden: true, classList: { add() {}, remove() {} }, focus() {} });
  const doc = {
    visibilityState: "visible",
    activeElement: null,
    body: { style: {} as Record<string, string> },
    getElementById: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type: string, fn: () => void) => (docListeners[type] ??= []).push(fn),
  };
  const win = {
    vibeRequest: async (url: string, opts: Req["opts"] = {}) => {
      requests.push({ url, opts });
      return answer({ url, opts });
    },
    vibeToast: (m: string) => toasts.push(m),
    addEventListener: () => {},
  };
  class FakeChannel {
    constructor(name: string) {
      assert.equal(name, "vibe-calendar");
    }
    addEventListener(_t: string, fn: (ev: { data: unknown }) => void) {
      channelListeners.push(fn);
    }
    postMessage(m: unknown) {
      posts.push(m);
    }
  }
  const storage = {
    getItem: (k: string) => (k in stored ? stored[k] : null),
    setItem: (k: string, v: string) => void (stored[k] = v),
    removeItem: (k: string) => void delete stored[k],
  };
  const api = new Function(
    "document", "window", "localStorage", "BroadcastChannel", "requestAnimationFrame", "showToast", "location",
    `${block}
    return {
      refreshCalendar, saveNewEvent, removeCalEvent, renderModalSidebar, renderModalGrid,
      _calOldEntries, _calMoveOld, _calChipHTML, _calCardHTML, _calClean,
      vibeCalKind, vibeCalBar, vibeCalHref,
      open() { modalOpen = true; },
      select(k) { modalSelectedKey = k; },
      get entries() { return calEntries; },
      get days() { return calendarEvents; },
      get state() { return _calState; },
    };`,
  )(doc, win, storage, FakeChannel, (fn: () => void) => fn(), (m: string) => toasts.push(m), { href: "" });
  const hear = (data: unknown) => channelListeners.forEach((fn) => fn({ data }));
  const fire = (type: string) => (docListeners[type] ?? []).forEach((fn) => fn());
  return { api, requests, posts, toasts, stored, el, doc, hear, fire };
}

const at = (y: number, mo: number, d: number, h = 19, mi = 0) => new Date(y, mo, d, h, mi).toISOString();
const ORG = { handle: "test_open_club", name: "Open Club", verified: false };
const GOING = { kind: "rsvp", id: "11111111-1111-4111-8111-111111111111", title: "Study <b>Night</b>", starts_at: at(2026, 9, 21), ends_at: at(2026, 9, 21, 21), location: "Library", viewer_status: "going", org: ORG, org_id: "o", room_id: "r1", room_state: "open" };
const MAYBE = { ...GOING, id: "22222222-2222-4222-8222-222222222222", title: "Game Night", viewer_status: "maybe", room_id: null };
const MINE = { kind: "personal", id: "33333333-3333-4333-8333-333333333333", title: "Dentist", starts_at: at(2026, 9, 21, 9), ends_at: null, location: "", notes: "bring card", color: "#5A9CFF" };
const calendarAnswer = (entries: unknown[]) => (r: Req): Answer =>
  r.url === "/api/me/calendar" ? { ok: true, data: { ok: true, entries } } : { ok: true, data: {} };

test("calendar key: the static copy paints and links exactly like calendar-key.ts", () => {
  const { api } = page(calendarAnswer([]));
  const shapes = [
    { kind: "rsvp", viewer_status: "going" }, { kind: "rsvp", viewer_status: "maybe" },
    { kind: "personal", color: "#5A9CFF" }, { kind: "personal" },
  ] as const;
  for (const e of shapes) assert.equal(api.vibeCalKind(e), key.calKind(e as never), JSON.stringify(e));
  // Coral (the old default, still the database's) turns blue in both twins
  // (Oct 19, 2026, merge pass: the static copy had missed it).
  for (const c of ["#5A9CFF", "#abc", "#1C1C1E", "#1c1c1e", "#FF5C35", "#ff5c35", "#F53", "red", "#12345", "", null, undefined, "url(x)", ...key.PERSONAL_COLOR_PRESETS, ...key.LEGACY_PERSONAL_COLORS]) {
    assert.equal(api.vibeCalBar(c), key.barColor(c as string), String(c));
  }
  for (const e of [GOING, MAYBE, MINE, { ...GOING, org: null }, { ...GOING, org: { handle: "a b", name: "x" } }]) {
    assert.equal(api.vibeCalHref(e), key.entryHref(e as never), JSON.stringify(e));
  }
});

test("calendar read: GET /api/me/calendar fills the days; bad rows are dropped", async () => {
  const { api, requests } = page(calendarAnswer([MINE, GOING, MAYBE, { kind: "rsvp" }, { ...MINE, starts_at: "nope" }, null]));
  await api.refreshCalendar();
  assert.deepEqual(requests.map((r) => [r.url, r.opts.method ?? "GET"]), [["/api/me/calendar", "GET"]]);
  assert.equal(api.state, "ready");
  assert.deepEqual(Object.keys(api.days), ["2026-10-21"]);
  // In start order: 9am mine, then the two 7pm RSVPs.
  assert.deepEqual(api.days["2026-10-21"].map((e: { id: string }) => e.id), [MINE.id, GOING.id, MAYBE.id]);
});

test("calendar read: a failed read keeps what was shown; with nothing shown it says so", async () => {
  let fail = false;
  const p = page((r) => (fail ? { ok: false, message: "x" } : calendarAnswer([GOING])(r)));
  await p.api.refreshCalendar();
  fail = true;
  await p.api.refreshCalendar();
  assert.equal(p.api.state, "ready");
  assert.equal(p.api.entries.length, 1);
  const q = page(() => ({ ok: false }));
  await q.api.refreshCalendar();
  assert.equal(q.api.state, "error");
  q.api.open();
  q.api.renderModalSidebar();
  assert.match(q.el("modalEventsList").innerHTML, /Couldn't load your calendar\. <button[^>]*onclick="refreshCalendar\(\)">Try again/);
});

test("calendar chips: the key's three looks; titles escaped; RSVPs link to the club at the event", () => {
  const { api } = page(calendarAnswer([]));
  const going = api._calChipHTML(GOING);
  assert.match(going, /^<a class="cal-chip cal-chip--going cal-nav-link"/);
  assert.match(going, /href="\/orgs\/test_open_club\?event=11111111-1111-4111-8111-111111111111"/);
  assert.match(going, /<svg [^>]*aria-hidden="true"/);
  assert.match(going, /Study &lt;b&gt;Night&lt;\/b&gt;/);
  assert.doesNotMatch(going, /<b>/);
  assert.match(api._calChipHTML(MAYBE), /cal-chip--interested/);
  assert.doesNotMatch(api._calChipHTML(MAYBE), /<svg/);
  const mine = api._calChipHTML(MINE);
  assert.match(mine, /^<span class="cal-chip cal-chip--yours" style="--cal-bar:#5A9CFF"/);
  assert.match(api._calChipHTML({ ...MINE, color: 'red" onmouseover="x' }), /--cal-bar:var\(--ink-muted\)/);
  // No fixed RSVP colour anywhere (the old green and amber).
  assert.doesNotMatch(block, /#1A9E5B|#B07800|vibe_cal_events_v1['"]\s*,\s*JSON/);
});

test("day panel: an RSVP has its links and no delete; your own entry has a delete", () => {
  const { api } = page(calendarAnswer([]));
  const rsvp = api._calCardHTML(GOING);
  assert.doesNotMatch(rsvp, /data-cal-del/);
  assert.match(rsvp, /<a class="cal-modal-event-name cal-nav-link" href="\/orgs\/test_open_club\?event=/);
  assert.match(rsvp, /href="\/messages\?channel=r1">Event chat</);
  assert.match(rsvp, /href="\/orgs\/test_open_club">Open Club</);
  assert.match(rsvp, /7pm – 9pm &middot; Library/);
  assert.doesNotMatch(api._calCardHTML(MAYBE), /Event chat/);
  const mine = api._calCardHTML(MINE);
  assert.match(mine, /data-cal-del="33333333-3333-4333-8333-333333333333"/);
  assert.match(mine, /bring card/);
  assert.doesNotMatch(mine, /\/orgs\//);
});

test("save: POST /api/me/personal-events with the local time; tells the other tabs", async () => {
  const saved = { id: "44444444-4444-4444-8444-444444444444", title: "Run", starts_at: at(2026, 9, 22, 7, 30), ends_at: null, location: "Canal", notes: "", color: "#5A9CFF" };
  const p = page((r) => (r.url === "/api/me/personal-events" ? { ok: true, data: { ok: true, event: saved } } : calendarAnswer([])(r)));
  Object.assign(p.el("evtName"), { value: " Run " });
  Object.assign(p.el("evtDate"), { value: "2026-10-22" });
  Object.assign(p.el("evtTime"), { value: "07:30" });
  Object.assign(p.el("evtLocation"), { value: "Canal" });
  Object.assign(p.el("evtNotes"), { value: "" });
  await p.api.saveNewEvent();
  const post = p.requests.find((r) => r.opts.method === "POST");
  assert.deepEqual(post?.opts.json, { title: "Run", starts_at: at(2026, 9, 22, 7, 30), location: "Canal", notes: "", color: "#5A9CFF" });
  assert.equal(p.api.days["2026-10-22"]?.[0]?.kind, "personal");
  assert.deepEqual(p.posts, [{ type: "calendar-changed", v: 1 }]);
  // Nothing is kept in this browser any more.
  assert.deepEqual(Object.keys(p.stored), []);
});

test("delete: DELETE /api/me/personal-events/<id> for your own entry only", async () => {
  const p = page(calendarAnswer([GOING, MINE]));
  await p.api.refreshCalendar();
  await p.api.removeCalEvent(GOING.id);
  assert.equal(p.requests.filter((r) => r.opts.method === "DELETE").length, 0);
  await p.api.removeCalEvent(MINE.id);
  assert.deepEqual(p.requests.filter((r) => r.opts.method === "DELETE").map((r) => r.url), [`/api/me/personal-events/${MINE.id}`]);
  assert.deepEqual(p.api.entries.map((e: { id: string }) => e.id), [GOING.id]);
  assert.equal(p.posts.length, 1);
});

const OLD = JSON.stringify({
  "2026-10-23": [{ name: "Club fair", time: "", location: "IMU", notes: "", color: "#2563EB" }],
  "2026-10-21": [
    { name: "  Coffee  ", time: "08:15", location: "x".repeat(250), notes: "", color: "not a colour" },
    { name: "IU Spring Career Fair", time: "", location: "IMU Alumni Hall", notes: "", color: "#FF5C35" },
  ],
  "2026-02-31": [{ name: "Bad day", time: "", location: "", notes: "", color: "#FF5C35" }],
  "junk": [{ name: "x" }],
});

test("old browser list: what can move, oldest first, demo seeds and bad days left out", () => {
  const { api } = page(calendarAnswer([]), { vibe_cal_events_v1: OLD });
  const old = api._calOldEntries();
  assert.deepEqual(old.map((x: { body: { title: string } }) => x.body.title), ["Coffee", "Club fair"]);
  assert.equal(old[0].body.starts_at, at(2026, 9, 21, 8, 15));
  assert.equal(old[1].body.starts_at, at(2026, 9, 23, 9, 0)); // no time: 9am
  assert.equal(old[0].body.location.length, 200);
  assert.equal(old[0].body.color, "#5A9CFF");
  assert.equal(old[1].body.color, "#2563EB");
});

test("old browser list: Move posts each one, then clears the list", async () => {
  const p = page(calendarAnswer([]), { vibe_cal_events_v1: OLD });
  await p.api._calMoveOld();
  const moved = p.requests.filter((r) => r.opts.method === "POST").map((r) => r.opts.json?.title);
  assert.deepEqual(moved, ["Coffee", "Club fair"]);
  assert.equal("vibe_cal_events_v1" in p.stored, false);
  assert.equal(p.posts.length, 1);
});

test("old browser list: a move that stops part way keeps the rest here and says so", async () => {
  let n = 0;
  const p = page((r) => (r.opts.method === "POST" ? (n++ === 0 ? { ok: true, data: { event: {} } } : { ok: false, message: "Slow down." }) : calendarAnswer([])(r)), { vibe_cal_events_v1: OLD });
  await p.api._calMoveOld();
  const left = JSON.parse(p.stored.vibe_cal_events_v1);
  assert.deepEqual(Object.keys(left), ["2026-10-23"]);
  assert.equal(left["2026-10-23"][0].name, "Club fair");
  assert.match(p.toasts.join(" | "), /Moved 1 of 2\. The rest stay in this browser\. Slow down\./);
});

test("sync: a calendar-changed message reads once; a hidden tab waits for its return", async () => {
  const p = page(calendarAnswer([GOING]));
  p.hear({ type: "other" });
  p.hear({ type: "calendar-changed", v: 2 });
  assert.equal(p.requests.length, 0);
  p.hear({ type: "calendar-changed", v: 1 });
  await Promise.resolve();
  assert.equal(p.requests.length, 1);
  p.doc.visibilityState = "hidden";
  p.hear({ type: "calendar-changed", v: 1 });
  p.hear({ type: "calendar-changed", v: 1 });
  assert.equal(p.requests.length, 1);
  p.doc.visibilityState = "visible";
  p.fire("visibilitychange");
  assert.equal(p.requests.length, 2);
});

test("calendar swatches: the New Event form offers calendar-key.ts's colours, in order", () => {
  // Oct 19, 2026 (merge pass): coral means an RSVP on the key, so it can't be
  // a personal colour on /profile either.
  const row = html.match(/<div class="color-picker-row"[\s\S]*?<\/div>/);
  assert.ok(row, "the colour row is on the page");
  const offered = [...row[0].matchAll(/data-color="(#[0-9A-Fa-f]{3,6})"/g)].map((m) => m[1].toUpperCase());
  assert.deepEqual(offered, key.PERSONAL_COLOR_PRESETS.map((c) => c.toUpperCase()));
});
