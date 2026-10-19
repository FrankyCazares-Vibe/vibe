/**
 * Tests for `sources.ts` (CONTRACT.md §3.3-3.4, §8): the fixed calendar
 * list; Jaguars home-only and timed-only, the result-prefix strip, matchup,
 * sentence-case sport, promo, venue, the end rule, the host locks on every
 * link (game page, tickets, ESPN+ only with "TV: ESPN+"), the swim-meet
 * merge; LiveWhale's drops (tags, all day, online, cancelled three ways,
 * over 12 h), ALL-CAPS places and ids; the merge (Featured wins, the
 * window, the order, the cap); and the two real fixtures.
 *
 * Run with:
 *   node --test src/lib/school-events/sources.test.ts
 *
 * WHY THE RESOLVE HOOK: sources.ts imports "./ics" with no extension, which
 * Node's type stripping won't add (the rolling-strip-view.test.ts pattern).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

import type { IcsEvent } from "./ics";
import type { SchoolEvent } from "./types";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("sources.test.ts needs Node >= 22.15 (module.registerHooks)");
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const {
  SCHOOL_CAMPUS_ID,
  SCHOOL_FEEDS,
  mergeSchoolEvents,
  normalizeAthletics,
  normalizeFeed,
  normalizeFeedWithCount,
  normalizeLiveWhale,
  sameHost,
} = await import("./sources");
const { parseIcs } = await import("./ics");

const [ATHLETICS, AFFAIRS, FEATURED] = SCHOOL_FEEDS;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Sat Nov 7 2026, 5:00 PM on campus. */
const T = Date.parse("2026-11-07T22:00:00Z");
const HOME = "Indianapolis, Ind., James T. Morris Arena";

function ics(p: Partial<IcsEvent>): IcsEvent {
  return { uid: "vcal_1", summary: "", location: "", description: "", url: null, start: T, end: null, allDay: false, status: null, x: {}, ...p };
}
const game = (p: Partial<IcsEvent>) => normalizeAthletics([ics({ location: HOME, ...p })], ATHLETICS);
const lw = (p: Partial<IcsEvent>, feed = AFFAIRS) =>
  normalizeLiveWhale([ics({ summary: "Paws and Relax", location: "Campus Center", end: T + HOUR, x: { "X-LIVEWHALE-ID": "2445550" }, ...p })], feed);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.ics`, import.meta.url), "utf8");

test("the calendar list is fixed, in credit order, every link https on its own host", () => {
  assert.equal(SCHOOL_CAMPUS_ID, "indianapolis");
  assert.deepEqual(
    SCHOOL_FEEDS.map((f) => [f.key, f.host, f.format]),
    [
      ["athletics", "Athletics", "sidearm"],
      ["iu-student-affairs", "Student Affairs", "livewhale"],
      ["iu-featured", "IU Indianapolis", "livewhale"],
    ],
  );
  assert.equal(ATHLETICS.credit, "From the IU Indy athletics calendar");
  assert.equal(AFFAIRS.feed_url, "https://events.iu.edu/live/ical/events/group_id/24");
  assert.equal(FEATURED.feed_url, "https://events.iu.edu/live/ical/events/group_id/342");
  for (const feed of SCHOOL_FEEDS) {
    assert.equal(sameHost(feed.feed_url, feed.feed_host), feed.feed_url);
    assert.equal(sameHost(feed.calendar_url, feed.feed_host), feed.calendar_url);
  }
  assert.ok(Object.isFrozen(SCHOOL_FEEDS) && Object.isFrozen(ATHLETICS));
});

test("sameHost: https on the host or www.host only", () => {
  assert.equal(sameHost("https://iuindyjags.com/x?a=1&b=2", "iuindyjags.com"), "https://iuindyjags.com/x?a=1&b=2");
  assert.equal(sameHost("https://www.iuindyjags.com/x", "iuindyjags.com"), "https://www.iuindyjags.com/x");
  for (const bad of [
    "http://iuindyjags.com/x",
    "javascript:alert(1)",
    "https://iuindyjags.com.evil.example/x",
    "https://evil.example/iuindyjags.com",
    "https://iuindyjags.com@evil.example/",
    "https://user:pw@iuindyjags.com/",
    "https://iuindyjags.com:8443/",
    "not a url",
    "",
    null,
  ]) {
    assert.equal(sameHost(bad, "iuindyjags.com"), null, String(bad));
  }
});

test("athletics: home and timed only; away, all-day and TBA rows never show", () => {
  const out = normalizeAthletics(
    [
      ics({ uid: "home", summary: "IU Indy Volleyball vs Cleveland State", location: HOME }),
      ics({ uid: "away", summary: "IU Indy Volleyball at Oakland", location: "Rochester, Mich." }),
      ics({ uid: "allday", summary: "IU Indy Men's Swimming vs House of Champions", location: HOME, allDay: true }),
      // IU Indy visiting a school across town is listed in Indianapolis, but it's not a home game.
      ics({ uid: "across-town", summary: "IU Indy Men's Golf at Butler Invite", location: "Indianapolis, Ind." }),
      ics({ uid: "greenwood", summary: "IU Indy Volleyball vs Wright State", location: "Greenwood, Ind., Indianapolis Arena" }),
    ],
    ATHLETICS,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["athletics:home"],
  );
});

test("athletics: an 'at' row stays only at IU Indy's own venue (a meet it hosts)", () => {
  const at = (venue: string) =>
    game({ uid: "meet", summary: "IU Indy Women's Track and Field at Jaguar Invitational", location: `Indianapolis, Ind., ${venue}` });
  const [meet] = at("Michael A. Carroll Stadium");
  assert.equal(meet.title, "IU Indy vs Jaguar Invitational");
  assert.equal(meet.sport, "Women's track and field");
  assert.equal(meet.location, "Michael A. Carroll Stadium");
  for (const venue of ["James T. Morris Arena", "the jungle", "IU Natatorium"]) assert.equal(at(venue).length, 1, venue);
  // Across town (Butler's arena), or no venue at all: IU Indy is the visitor.
  assert.equal(at("Hinkle Fieldhouse").length, 0);
  assert.equal(game({ summary: "IU Indy Men's Basketball at Butler", location: "Indianapolis, Ind." }).length, 0);
});

test("athletics: prefix strip, matchup, sentence-case sport, promo, title", () => {
  const [ev] = game({ summary: "[W] IU Indy Men's Basketball vs UT Martin - Bob Lovell Day" });
  assert.equal(ev.kind, "game");
  assert.equal(ev.title, "IU Indy vs UT Martin");
  assert.deepEqual(ev.matchup, { home: "IU Indy", away: "UT Martin" });
  assert.equal(ev.sport, "Men's basketball");
  assert.equal(ev.promo, "Bob Lovell Day");
  assert.equal(ev.source, "athletics");
  assert.equal(ev.host, "Athletics");
  assert.equal(ev.featured, false);
  assert.equal(game({ summary: "IU Indy Volleyball vs. Northern Kentucky" })[0].sport, "Volleyball");
  assert.equal(game({ summary: "IU Indy Women's Swimming vs Butler" })[0].sport, "Women's swimming");
  assert.equal(game({ summary: "IU Indy Volleyball vs Wright State" })[0].promo, null);
  // A title that doesn't parse: the cleaned summary, still a game, no matchup.
  const [odd] = game({ summary: "[N] Jaguar Madness" });
  assert.equal(odd.title, "Jaguar Madness");
  assert.equal(odd.kind, "game");
  assert.equal(odd.matchup, null);
  assert.equal(odd.sport, null);
  assert.ok(game({ summary: `IU Indy Volleyball vs ${"Very Long Name ".repeat(12)}` })[0].title.length <= 120);
});

test("athletics: the venue after 'Indianapolis, Ind., ' (escaped first comma), else 'Indianapolis'", () => {
  const [parsed] = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261022T190000Z\r\nLOCATION:Indianapolis\\, Ind., IU Natatorium\r\nSUMMARY:IU Indy Men's Swimming vs Ball State\r\nEND:VEVENT\r\nEND:VCALENDAR",
  );
  assert.equal(normalizeAthletics([parsed], ATHLETICS)[0].location, "IU Natatorium");
  assert.equal(game({ summary: "IU Indy Volleyball vs X", location: "Indianapolis, Ind." })[0].location, "Indianapolis");
});

test("athletics: the end is the feed's when after the start and at most 6 h later, else start + 2 h", () => {
  const end = (e: number | null) => game({ summary: "IU Indy Volleyball vs X", end: e })[0].ends_at;
  assert.equal(end(T + 2.5 * HOUR), new Date(T + 2.5 * HOUR).toISOString());
  assert.equal(end(T + 6 * HOUR), new Date(T + 6 * HOUR).toISOString());
  assert.equal(end(T + 7 * HOUR), new Date(T + 2 * HOUR).toISOString());
  assert.equal(end(null), new Date(T + 2 * HOUR).toISOString());
  assert.equal(end(T), new Date(T + 2 * HOUR).toISOString());
  assert.equal(end(T - HOUR), new Date(T + 2 * HOUR).toISOString());
});

test("athletics: links are host-locked; ESPN+ only when the feed says 'TV: ESPN+'", () => {
  const desc = (lines: string[]) => game({ summary: "IU Indy Volleyball vs X", description: lines.join("\n") })[0];
  const full = desc([
    "[W] IU Indy Volleyball vs X",
    "W 3-1",
    "TV: ESPN+",
    "Streaming Video: https://www.espn.com/watch/player?id=1",
    "Tickets: https://am.ticketmaster.com/iuindy/buy/26-VB",
  ]);
  assert.equal(full.tickets_url, "https://am.ticketmaster.com/iuindy/buy/26-VB");
  assert.equal(full.watch_url, "https://www.espn.com/watch/player?id=1");
  // No score, no description text, is ever kept.
  assert.ok(!JSON.stringify(full).includes("3-1"));
  assert.equal(desc(["TV: WNDY-TV", "Streaming Video: https://www.espn.com/watch/1"]).watch_url, null);
  assert.equal(desc(["Streaming Video: https://www.espn.com/watch/1"]).watch_url, null);
  assert.equal(desc(["TV: ESPN+", "Streaming Video: https://espn.com.evil.example/1"]).watch_url, null);
  assert.equal(desc(["TV: ESPN+", "Streaming Video: http://www.espn.com/watch/1"]).watch_url, null);
  assert.equal(desc(["TV: ESPN+", "Streaming Video: https://espn.com/watch/1"]).watch_url, "https://espn.com/watch/1");
  assert.equal(desc(["Tickets: https://ticketmaster.com.evil.example/x"]).tickets_url, null);
  assert.equal(desc(["Tickets: javascript:alert(1)"]).tickets_url, null);
  assert.equal(desc(["Tickets: https://ticketmaster.com/x"]).tickets_url, "https://ticketmaster.com/x");
  // The game page: `&amp;` decoded by the parser, then locked to the athletics host.
  const [parsed] = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261107T220000Z\r\nLOCATION:Indianapolis\\, Ind., Arena\r\nSUMMARY:IU Indy Volleyball vs X\r\nURL:https://iuindyjags.com/calendar.aspx?game_id=17459&amp;sport_id=1\r\nEND:VEVENT\r\nEND:VCALENDAR",
  );
  assert.equal(normalizeAthletics([parsed], ATHLETICS)[0].url, "https://iuindyjags.com/calendar.aspx?game_id=17459&sport_id=1");
  assert.equal(game({ summary: "IU Indy Volleyball vs X", url: "javascript:alert(1)" })[0].url, null);
  assert.equal(game({ summary: "IU Indy Volleyball vs X", url: "https://evil.example/calendar.aspx" })[0].url, null);
});

test("athletics: one meet listed once per opponent is one item (same start, venue and sport)", () => {
  const nat = "Indianapolis, Ind., IU Natatorium";
  const row = (uid: string, summary: string, p: Partial<IcsEvent> = {}) => ics({ uid, summary, location: nat, ...p });
  const out = normalizeAthletics(
    [
      row("w1", "[W] IU Indy Women's Swimming vs Xavier", { url: "https://iuindyjags.com/g?id=w1" }),
      row("m1", "[W] IU Indy Men's Swimming vs Xavier"),
      row("w2", "[W] IU Indy Women's Swimming vs Bellarmine", { description: "Tickets: https://am.ticketmaster.com/iuindy/swim" }),
      row("w3", "[W] IU Indy Women's Swimming vs Eastern Illinois"),
      row("w4", "[L] IU Indy Women's Swimming vs Bowling Green"),
      row("w5", "[W] IU Indy Women's Swimming vs Butler"),
      row("w6", "IU Indy Women's Swimming vs Butler"),
      row("later", "IU Indy Women's Swimming vs Ball State", { start: T + DAY }),
    ],
    ATHLETICS,
  );
  assert.deepEqual(
    out.map((e) => [e.id, e.title]),
    [
      ["athletics:w1", "IU Indy vs Xavier, Bellarmine, Eastern Illinois and 2 more"],
      ["athletics:m1", "IU Indy vs Xavier"],
      ["athletics:later", "IU Indy vs Ball State"],
    ],
  );
  assert.equal(out[0].url, "https://iuindyjags.com/g?id=w1");
  assert.equal(out[0].matchup?.away, "Xavier, Bellarmine, Eastern Illinois and 2 more");
  assert.equal(out[0].tickets_url, "https://am.ticketmaster.com/iuindy/swim");
  const two = normalizeAthletics([row("a", "IU Indy Men's Swimming vs Xavier"), row("b", "IU Indy Men's Swimming vs Wabash")], ATHLETICS);
  assert.equal(two.length, 1);
  assert.equal(two[0].title, "IU Indy vs Xavier, Wabash");
});

test("LiveWhale: a normal row, its id, url lock, host and Featured flag", () => {
  const [ev] = lw({ url: "https://events.iu.edu/studentaffairs-indianapolis/event/2445550-paws" });
  assert.deepEqual(ev, {
    id: "iu:2445550",
    source: "iu-student-affairs",
    kind: "event",
    title: "Paws and Relax",
    matchup: null,
    sport: null,
    promo: null,
    starts_at: new Date(T).toISOString(),
    ends_at: new Date(T + HOUR).toISOString(),
    location: "Campus Center",
    host: "Student Affairs",
    url: "https://events.iu.edu/studentaffairs-indianapolis/event/2445550-paws",
    tickets_url: null,
    watch_url: null,
    featured: false,
  } satisfies SchoolEvent);
  const [featured] = lw({}, FEATURED);
  assert.equal(featured.featured, true);
  assert.equal(featured.host, "IU Indianapolis");
  assert.equal(featured.source, "iu-featured");
  assert.equal(lw({ x: {}, uid: "20261210T230000Z-2445560@events.iu.edu" })[0].id, "iu:20261210T230000Z-2445560@events.iu.edu");
  assert.equal(lw({ x: {}, uid: "" }).length, 0);
  assert.equal(lw({ url: "https://evil.example/event" })[0].url, null);
  assert.equal(lw({ end: null })[0].ends_at, new Date(T + HOUR).toISOString());
  assert.equal(lw({ location: "" })[0].location, null);
});

test("LiveWhale: a long title is cut without splitting an emoji", () => {
  const [ev] = lw({ summary: `${"a".repeat(118)}😀${"b".repeat(5)}` });
  assert.ok(ev.title.length <= 120);
  assert.ok(ev.title.endsWith("…"));
  const units = [...ev.title].filter((ch) => ch.length === 1).map((ch) => ch.charCodeAt(0));
  assert.ok(units.every((c) => c < 0xd800 || c > 0xdfff), "no lone surrogate");
});

test("LiveWhale drops: tags, all day, online, cancelled three ways, longer than 12 h", () => {
  const tags = (t: string) => lw({ x: { "X-LIVEWHALE-ID": "1", "X-LIVEWHALE-TAGS": t } }).length;
  assert.equal(tags("DoSA Fall 2026 Events|Internal Events"), 0);
  assert.equal(tags("Conference|Sign-up Required"), 0);
  assert.equal(tags(" travel required "), 0);
  assert.equal(tags("Fall Semester|Fitness classes"), 0);
  assert.equal(tags("Group Fitness Classes"), 0);
  assert.equal(tags("Professional Development Page - National"), 0);
  assert.equal(tags("HWP|Fitness|Health and wellness"), 1);
  assert.equal(lw({ allDay: true }).length, 0);
  assert.equal(lw({ x: { "X-LIVEWHALE-ID": "1", "X-LIVEWHALE-ALL-DAY": "1" } }).length, 0);
  assert.equal(lw({ location: "https://iu.zoom.us/j/1" }).length, 0);
  assert.equal(lw({ location: "HTTP://teams.example" }).length, 0);
  assert.equal(lw({ status: "CANCELLED" }).length, 0);
  assert.equal(lw({ x: { "X-LIVEWHALE-ID": "1", "X-LIVEWHALE-CANCELED": "true" } }).length, 0);
  assert.equal(lw({ summary: "CANCELED: Paws and Relax" }).length, 0);
  assert.equal(lw({ summary: "Cancelled: Paws and Relax" }).length, 0);
  assert.equal(lw({ end: T + 13 * HOUR }).length, 0);
  assert.equal(lw({ end: T + 12 * HOUR }).length, 1);
});

test("LiveWhale places: ALL-CAPS over 3 letters goes to Title Case; the rest stays", () => {
  assert.equal(lw({ location: "CAMPUS CENTER" })[0].location, "Campus Center");
  assert.equal(lw({ location: "CAMPUS CENTER 305 (ATRIUM)" })[0].location, "Campus Center 305 (Atrium)");
  assert.equal(lw({ location: "UC 115" })[0].location, "UC 115");
  assert.equal(lw({ location: "Inlow Hall (School of Law)" })[0].location, "Inlow Hall (School of Law)");
});

function school(id: string, startMs: number, p: Partial<SchoolEvent> = {}): SchoolEvent {
  return {
    id,
    source: "iu-student-affairs",
    kind: "event",
    title: `Event ${id}`,
    matchup: null,
    sport: null,
    promo: null,
    starts_at: new Date(startMs).toISOString(),
    ends_at: new Date(startMs + HOUR).toISOString(),
    location: null,
    host: "Student Affairs",
    url: null,
    tickets_url: null,
    watch_url: null,
    featured: false,
    ...p,
  };
}

test("merge: one row per id, and the Featured copy wins whichever list it's in", () => {
  const plain = school("iu:1", T);
  const featured = school("iu:1", T, { source: "iu-featured", host: "IU Indianapolis", featured: true });
  for (const lists of [[[plain], [featured]], [[featured], [plain]]]) {
    const out = mergeSchoolEvents(lists, T);
    assert.equal(out.length, 1);
    assert.equal(out[0].featured, true);
    assert.equal(out[0].source, "iu-featured");
  }
  // Two plain copies: the first stays.
  const other = school("iu:1", T, { title: "Second copy" });
  assert.equal(mergeSchoolEvents([[plain], [other]], T)[0].title, "Event iu:1");
});

test("merge: one event on several days (one id) shows the day that's on now or next", () => {
  // A 6-9 PM fair Tue, Wed and Thu; LiveWhale gives every day the same id.
  const tue = Date.parse("2026-11-03T23:00:00Z");
  const fair = (day: number) => school("iu:777", tue + day * DAY, { ends_at: new Date(tue + day * DAY + 3 * HOUR).toISOString() });
  const days = [fair(0), fair(1), fair(2)];
  const pick = (now: number, lists = [days]) => mergeSchoolEvents(lists, now).map((e) => e.starts_at);
  // Monday: Tuesday is next. Tuesday 7 PM: Tuesday is on.
  assert.deepEqual(pick(tue - DAY), [days[0].starts_at]);
  assert.deepEqual(pick(tue + HOUR), [days[0].starts_at]);
  // Wednesday noon and Wednesday 7 PM: Wednesday, not Tuesday's finished copy.
  assert.deepEqual(pick(tue + DAY - 6 * HOUR), [days[1].starts_at]);
  assert.deepEqual(pick(tue + DAY + HOUR), [days[1].starts_at]);
  // All over: the last day stays (ended rows are kept, like a game's "Final").
  assert.deepEqual(pick(tue + 2 * DAY + 4 * HOUR), [days[2].starts_at]);
  // The first day out of the window doesn't take the later days with it (the window runs first).
  assert.deepEqual(pick(tue + 4 * DAY + HOUR), [days[2].starts_at]);
  // The same day in both IU groups: still the Featured copy, in any order.
  const featuredWed = { ...fair(1), source: "iu-featured" as const, featured: true };
  for (const lists of [[days, [featuredWed]], [[featuredWed], days]]) {
    const out = mergeSchoolEvents(lists, tue + DAY + HOUR);
    assert.equal(out.length, 1);
    assert.equal(out[0].featured, true);
  }
});

test("merge: started from 4 days ago up to (not including) 8 days ahead, ended ones kept", () => {
  const out = mergeSchoolEvents(
    [
      [
        school("too-old", T - 4 * DAY - 1),
        school("oldest-kept", T - 4 * DAY),
        school("ended-yesterday", T - DAY),
        school("last-kept", T + 8 * DAY - 1),
        school("too-far", T + 8 * DAY),
      ],
    ],
    T,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["oldest-kept", "ended-yesterday", "last-kept"],
  );
});

test("merge: soonest first, then title, then id; at most 200", () => {
  const out = mergeSchoolEvents(
    [
      [school("b", T + HOUR, { title: "Same" }), school("a", T + HOUR, { title: "Same" })],
      [school("z", T + HOUR, { title: "Alpha" }), school("y", T)],
    ],
    T,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["y", "z", "a", "b"],
  );
  const many = Array.from({ length: 250 }, (_, i) => school(`iu:${i}`, T + i * 60_000));
  const capped = mergeSchoolEvents([many], T);
  assert.equal(capped.length, 200);
  assert.equal(capped[199].id, "iu:199");
});

test("normalizeFeed never throws: junk and an empty calendar are []", () => {
  assert.deepEqual(normalizeFeed("<html>oops</html>", ATHLETICS), []);
  assert.deepEqual(normalizeFeed("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", FEATURED), []);
  assert.deepEqual(normalizeFeed(undefined as unknown as string, AFFAIRS), []);
  assert.deepEqual(normalizeFeedWithCount(undefined as unknown as string, AFFAIRS), { parsed: 0, events: [] });
});

test("normalizeFeedWithCount: how many rows came in, beside the ones kept", () => {
  const affairs = normalizeFeedWithCount(fixture("iu-student-affairs"), AFFAIRS);
  assert.deepEqual([affairs.parsed, affairs.events.length], [125, 20]);
  assert.deepEqual(affairs.events, normalizeFeed(fixture("iu-student-affairs"), AFFAIRS));
  // Every row an away game: rows in, none kept (read-server.ts logs this).
  const away = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261107T220000Z\r\nSUMMARY:IU Indy Volleyball at Oakland\r\nLOCATION:Rochester\\, Mich.\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.deepEqual(normalizeFeedWithCount(away, ATHLETICS), { parsed: 1, events: [] });
});

test("fixture: Student Affairs keeps 20 of 125 (checked Oct 19 with these rules)", () => {
  const out = normalizeFeed(fixture("iu-student-affairs"), AFFAIRS);
  assert.equal(out.length, 20);
  const titles = out.map((e) => e.title);
  for (const t of ["Graduate School Fair", "Flu Shot Clinic", "Campus Cleanup", "IU Indy First Gen Student Celebration"]) {
    assert.ok(titles.includes(t), t);
  }
  assert.ok(!titles.includes("Mat Pilates") && !titles.includes("Yoga") && !titles.includes("Sober October Challenge"));
  assert.ok(out.every((e) => e.id.startsWith("iu:") && (e.url === null || e.url.startsWith("https://events.iu.edu/"))));
  assert.ok(out.every((e) => e.location === null || /[a-z]/.test(e.location)));
});

test("fixture: athletics is home games only, with the Oct 22 swim meet and the Nov 7 basketball game", () => {
  const out = normalizeFeed(fixture("athletics"), ATHLETICS);
  assert.ok(out.length > 0);
  assert.ok(out.every((e) => e.kind === "game" && e.id.startsWith("athletics:")));
  assert.ok(out.every((e) => e.url === null || e.url.startsWith("https://iuindyjags.com/")));
  assert.ok(out.every((e) => e.tickets_url === null || new URL(e.tickets_url).hostname.endsWith("ticketmaster.com")));
  assert.ok(out.every((e) => e.watch_url === null || new URL(e.watch_url).hostname.endsWith("espn.com")));
  const swim = out.filter((e) => e.starts_at === "2026-10-22T19:00:00.000Z");
  assert.deepEqual(
    swim.map((e) => [e.sport, e.title, e.location]),
    [
      ["Men's swimming", "IU Indy vs Ball State", "IU Natatorium"],
      ["Women's swimming", "IU Indy vs Ball State", "IU Natatorium"],
    ],
  );
  const lovell = out.find((e) => e.starts_at === "2026-11-07T22:00:00.000Z");
  assert.equal(lovell?.title, "IU Indy vs UT Martin");
  assert.equal(lovell?.promo, "Bob Lovell Day");
  assert.equal(lovell?.location, "James T. Morris Arena");
  assert.equal(lovell?.ends_at, "2026-11-08T00:00:00.000Z");
  // The Oct 3 meet: nine rows in the feed, two items.
  assert.equal(out.filter((e) => e.starts_at === "2026-10-03T16:00:00.000Z").length, 2);
});
