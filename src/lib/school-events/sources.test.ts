/**
 * Tests for `sources.ts` (CONTRACT.md §3.3-3.4, §8): the fixed calendar
 * list per campus (Bloomington's three since Oct 19, 2026, with their own
 * game rules); Jaguars home-only and timed-only, the result-prefix strip, matchup,
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
  SCHOOL_FEEDS,
  feedsForCampus,
  mergeSchoolEvents,
  normalizeAthletics,
  normalizeFeed,
  normalizeFeedWithCount,
  normalizeLiveWhale,
  sameHost,
} = await import("./sources");
const { parseIcs } = await import("./ics");
const { SCHOOL_CAMPUS_KEYS } = await import("./switch");

const [ATHLETICS, AFFAIRS, FEATURED] = feedsForCampus("indianapolis");
const [IUB_ATHLETICS, IUB_LIFE, IUB_FEATURED] = feedsForCampus("iu-bloomington");
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
  assert.deepEqual(
    feedsForCampus("indianapolis").map((f) => [f.key, f.host, f.format, f.role, f.label, f.featured]),
    [
      ["athletics", "Athletics", "sidearm", "athletics", "IU Indy Athletics", false],
      ["iu-student-affairs", "Student Affairs", "livewhale", "calendar", "IU Indianapolis Student Affairs", false],
      ["iu-featured", "IU Indianapolis", "livewhale", "calendar", "IU Indianapolis", true],
    ],
  );
  // Every feed belongs to one campus, and the switch's campus list agrees with it.
  for (const [campus, keys] of Object.entries(SCHOOL_CAMPUS_KEYS)) {
    assert.deepEqual(feedsForCampus(campus).map((f) => f.key), [...keys], campus);
  }
  assert.equal(SCHOOL_FEEDS.length, Object.values(SCHOOL_CAMPUS_KEYS).flat().length);
  assert.deepEqual([feedsForCampus("iu-kokomo"), feedsForCampus("purdue-west-lafayette"), feedsForCampus(null)], [[], [], []]);
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
  // The men's and women's teams in one meet are one item too (Oct 19, 2026), named by the plain sport.
  assert.deepEqual(
    out.map((e) => [e.id, e.title, e.sport]),
    [
      ["athletics:w1", "IU Indy vs Xavier, Bellarmine, Eastern Illinois and 2 more", "Swimming"],
      ["athletics:later", "IU Indy vs Ball State", "Women's swimming"],
    ],
  );
  assert.equal(out[0].url, "https://iuindyjags.com/g?id=w1");
  assert.equal(out[0].matchup?.away, "Xavier, Bellarmine, Eastern Illinois and 2 more");
  assert.equal(out[0].tickets_url, "https://am.ticketmaster.com/iuindy/swim");
  // Different sports at one time and place stay apart.
  const apart = normalizeAthletics([row("s", "IU Indy Women's Swimming vs X"), row("d", "IU Indy Men's Diving vs X")], ATHLETICS);
  assert.equal(apart.length, 2);
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
  // The id is the number in the event's link (Oct 19, 2026), never X-LIVEWHALE-ID; no number: title and start.
  assert.equal(lw({ url: "https://events.iu.edu/live/events/2432980-hue-knew", x: { "X-LIVEWHALE-ID": "2437042" } })[0].id, "iu:2432980");
  assert.equal(lw({ url: "https://events.iu.edu/live/events/birds-in-books" })[0].id, `iu:Paws and Relax@${new Date(T).toISOString()}`);
  // Only a number at the START of the link's last part (Oct 19, 2026): "homecoming-2026-parade" and
  // "fall-2026-career-fair" both read "2026" before, so the merge kept one of them.
  const parade = lw({ summary: "Homecoming 2026 Parade", url: "https://events.iu.edu/live/events/homecoming-2026-parade" })[0];
  const fair = lw({ summary: "Fall 2026 Career Fair", url: "https://events.iu.edu/live/events/fall-2026-career-fair" })[0];
  assert.equal(parade.id, `iu:Homecoming 2026 Parade@${new Date(T).toISOString()}`);
  assert.equal(mergeSchoolEvents([[parade, fair]], T).length, 2);
  // A bare number is the same event as its slugged copy in the other group.
  const bare = lw({ url: "https://events.iu.edu/live/events/2432980" })[0].id;
  assert.equal(bare, "iu:2432980");
  assert.equal(bare, lw({ url: "https://events.iu.edu/live/events/2432980-hue-knew/" })[0].id);
  assert.equal(lw({ url: "https://events.iu.edu/live/events/2432980-hue-knew?x=1#top" })[0].id, "iu:2432980");
  assert.equal(lw({ url: "not a link 2432980-x" })[0].id, `iu:Paws and Relax@${new Date(T).toISOString()}`);
  assert.equal(lw({ x: {}, uid: "" })[0].id, `iu:Paws and Relax@${new Date(T).toISOString()}`);
  assert.equal(lw({ summary: "" }).length, 0);
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
  // IU, IMU and LGBTQ stay in capitals (Bloomington, Oct 19, 2026: "IU CINEMA" read "Iu Cinema").
  assert.equal(lw({ location: "IU CINEMA" })[0].location, "IU Cinema");
  assert.equal(lw({ location: "IMU SOLARIUM" })[0].location, "IMU Solarium");
  assert.equal(lw({ location: "LGBTQ+ CULTURE CENTER" })[0].location, "LGBTQ+ Culture Center");
  assert.equal(lw({ location: "INDIANA MEMORIAL UNION (UNION BUILDING)" })[0].location, "Indiana Memorial Union (Union Building)");
  assert.equal(lw({ location: "JOSEPH T. TAYLOR HALL" })[0].location, "Joseph T. Taylor Hall");
  assert.equal(lw({ location: "SIDNEY AND LOIS ESKENAZI MUSEUM OF ART" })[0].location, "Sidney and Lois Eskenazi Museum of Art");
  assert.equal(lw({ location: "THE COMMONS AT THE IMU" })[0].location, "The Commons at the IMU");
  assert.equal(lw({ location: "Inlow Hall (School of Law)" })[0].location, "Inlow Hall (School of Law)");
  // Oct 19, 2026: a state after a comma stays the state, and IUA stays in capitals.
  assert.equal(lw({ location: "WELLS LIBRARY E159, BLOOMINGTON, IN 47405" })[0].location, "Wells Library E159, Bloomington, IN 47405");
  assert.equal(lw({ location: "SOUTH HALL, BLOOMINGTON, IN" })[0].location, "South Hall, Bloomington, IN");
  assert.equal(lw({ location: "IU AUDITORIUM - IUA" })[0].location, "IU Auditorium - IUA");
  assert.equal(lw({ location: "1200 E. SEVENTH ST." })[0].location, "1200 E. Seventh St.");
  assert.equal(lw({ location: "ROOM 2, ON THE LAWN" })[0].location, "Room 2, On the Lawn");
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
  // The men's and women's meet against Ball State: one item (Oct 19, 2026; it showed twice).
  assert.deepEqual(swim.map((e) => [e.sport, e.title, e.location]), [["Swimming", "IU Indy vs Ball State", "IU Natatorium"]]);
  const lovell = out.find((e) => e.starts_at === "2026-11-07T22:00:00.000Z");
  assert.equal(lovell?.title, "IU Indy vs UT Martin");
  assert.equal(lovell?.promo, "Bob Lovell Day");
  assert.equal(lovell?.location, "James T. Morris Arena");
  assert.equal(lovell?.ends_at, "2026-11-08T00:00:00.000Z");
  // The Oct 3 meet: eight rows in the feed (both teams), one item.
  assert.equal(out.filter((e) => e.starts_at === "2026-10-03T16:00:00.000Z").length, 1);
});

// ── Bloomington (Oct 19, 2026) ────────────────────────────────────────────────

const BLOOM = "Bloomington, Ind.";
const iubGame = (p: Partial<IcsEvent>) => normalizeAthletics([ics({ location: BLOOM, ...p })], IUB_ATHLETICS);

test("Bloomington: three calendars, IU Athletics first, none of them 'featured', every link on its own host", () => {
  assert.deepEqual(
    feedsForCampus("iu-bloomington").map((f) => [f.key, f.host, f.format, f.role, f.label, f.featured, f.campus_id]),
    [
      ["iub-athletics", "Athletics", "sidearm", "athletics", "IU Athletics", false, "iu-bloomington"],
      ["iub-student-life", "Student Life", "livewhale", "calendar", "IU Bloomington Student Life", false, "iu-bloomington"],
      // Group 341 is a plain calendar (decision 7): its rows never lead as "Featured by your school".
      ["iub-featured", "IU Bloomington", "livewhale", "calendar", "IU Bloomington", false, "iu-bloomington"],
    ],
  );
  assert.equal(IUB_ATHLETICS.credit, "From the IU Athletics calendar");
  assert.equal(IUB_ATHLETICS.feed_url, "https://iuhoosiers.com/calendar.ashx/calendar.ics?sport_id=0");
  assert.equal(IUB_LIFE.feed_url, "https://events.iu.edu/live/ical/events/group_id/76");
  assert.equal(IUB_FEATURED.feed_url, "https://events.iu.edu/live/ical/events/group_id/341");
  for (const feed of SCHOOL_FEEDS) {
    assert.equal(sameHost(feed.feed_url, feed.feed_host), feed.feed_url, feed.key);
    assert.equal(sameHost(feed.calendar_url, feed.feed_host), feed.calendar_url, feed.key);
    assert.equal(feed.format === "sidearm", feed.game !== null, `${feed.key}: game rules exactly for Sidearm`);
    assert.ok(Object.isFrozen(feed), feed.key);
  }
  assert.equal(normalizeLiveWhale([ics({ summary: "Talk", location: "Maxwell Hall", end: T + HOUR })], IUB_FEATURED)[0].featured, false);
});

test("Bloomington games: home on the bare place and on place + venue; neutral and away rows dropped", () => {
  const out = normalizeAthletics(
    [
      ics({ uid: "bare", summary: "Indiana University Men's Basketball vs Eastern Illinois", location: BLOOM }),
      ics({ uid: "venue", summary: "Indiana University Women's Soccer vs Purdue", location: "Bloomington, Ind., Jerry Yeagley Field at Bill Armstrong Stadium" }),
      // A "vs" game in Indianapolis is a neutral site (the Crossroads Classic), not a home game.
      ics({ uid: "indy", summary: "Indiana University Men's Basketball vs Kentucky", location: "Indianapolis, Ind., Gainbridge Fieldhouse" }),
      ics({ uid: "away", summary: "Indiana University Football at Michigan", location: "Ann Arbor, Mich." }),
      ics({ uid: "allday", summary: "Indiana University Football vs USC", location: BLOOM, allDay: true }),
      ics({ uid: "golf", summary: "Indiana University Men's Golf Highlands Invitational - Chicago Highlands Club", location: "Gilberts, Ill." }),
    ],
    IUB_ATHLETICS,
  );
  assert.deepEqual(
    out.map((e) => [e.id, e.title, e.location, e.source, e.host]),
    [
      ["iub-athletics:bare", "IU vs Eastern Illinois", "Bloomington", "iub-athletics", "Athletics"],
      ["iub-athletics:venue", "IU vs Purdue", "Jerry Yeagley Field at Bill Armstrong Stadium", "iub-athletics", "Athletics"],
    ],
  );
  // An "at" row in Bloomington stays: there's no cross-town rival, so it's a meet IU hosts.
  assert.equal(iubGame({ summary: "Indiana University Cross Country at IU Invitational" }).length, 1);
  // Indy's own rules are untouched: an "at" row across Indianapolis is still dropped.
  assert.equal(game({ summary: "IU Indy Men's Basketball at Butler", location: "Indianapolis, Ind." }).length, 0);
});

test("Bloomington games: the IU prefix becomes 'IU', a '#N' rank goes, sport and promo as in Indy", () => {
  const [ev] = iubGame({ summary: "[W] Indiana University Women's Volleyball vs #16 Penn State - Pink Out" });
  assert.equal(ev.title, "IU vs Penn State");
  assert.deepEqual(ev.matchup, { home: "IU", away: "Penn State" });
  assert.equal(ev.sport, "Women's volleyball");
  assert.equal(ev.promo, "Pink Out");
  assert.equal(ev.kind, "game");
  assert.equal(iubGame({ summary: "Indiana University Men's Swimming and Diving vs USC" })[0].sport, "Men's swimming and diving");
  // A rank inside a name ("Team #2") is left alone; only a leading "#N " is a rank.
  assert.equal(iubGame({ summary: "Indiana University Wrestling vs Team #2" })[0].title, "IU vs Team #2");
  // Indy's ranked opponents lose the rank too.
  assert.equal(game({ summary: "IU Indy Volleyball vs #9 Northern Kentucky" })[0].title, "IU Indy vs Northern Kentucky");
  // Oct 19, 2026: "(RV)" (receiving votes) is a rank too, and the ask to IU Athletics promises none.
  assert.equal(iubGame({ summary: "[W] Indiana University Women's Volleyball vs (RV) UCLA" })[0].title, "IU vs UCLA");
  assert.equal(iubGame({ summary: "Indiana University Women's Volleyball vs (rv) USC" })[0].matchup?.away, "USC");
  // A finished game's innings and a pool's length aren't part of the name; "(Exhibition)" and a name's own brackets stay.
  assert.equal(iubGame({ summary: "[N] Indiana University Softball vs Indiana Tech (10 Innings)" })[0].title, "IU vs Indiana Tech");
  assert.equal(iubGame({ summary: "Indiana University Men's Swimming and Diving vs Texas (SCM)" })[0].title, "IU vs Texas");
  assert.equal(iubGame({ summary: "Indiana University Men's Basketball vs Western Kentucky (Exhibition)" })[0].title, "IU vs Western Kentucky (Exhibition)");
  assert.equal(game({ summary: "IU Indy Men's Basketball vs Miami University (Middletown)" })[0].title, "IU Indy vs Miami University (Middletown)");
  // The team against itself: no "IU vs".
  const [squad] = iubGame({ summary: "Indiana University Wrestling vs Intrasquad (Wrestle-Offs)" });
  assert.deepEqual([squad.title, squad.matchup, squad.sport], ["IU wrestling intrasquad (Wrestle-Offs)", null, "Wrestling"]);
});

test("Bloomington games: the men's and women's meet on Oct 23 is one item, 'Swimming and diving' (fixture rows)", () => {
  const rows = parseIcs(fixture("iub-athletics")).filter((e) => e.start === Date.parse("2026-10-23T18:00:00Z"));
  assert.deepEqual(rows.map((e) => e.summary.replace(/^\[[A-Z]\]\s*/, "")).sort(), [
    "Indiana University Men's Swimming and Diving vs Kentucky",
    "Indiana University Men's Swimming and Diving vs USC",
    "Indiana University Women's Swimming and Diving vs Kentucky",
    "Indiana University Women's Swimming and Diving vs USC",
  ]);
  const out = normalizeAthletics(rows, IUB_ATHLETICS);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].title, out[0].sport, out[0].location], ["IU vs Kentucky, USC", "Swimming and diving", "Counsilman-Billingsley Aquatics Center"]);
  // The first row's id and page stay, so the item is the same one on every read.
  assert.equal(out[0].id, `iub-athletics:${rows[0].uid}`);
});

test("Bloomington games: admin.iuhoosiers.com links become iuhoosiers.com; tickets on evenue or Ticketmaster only", () => {
  const [parsed] = parseIcs(
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:vcal_28657-admin.iuhoosiers.com\r\nDTSTART:20261022T230000Z\r\nLOCATION:Bloomington\\, Ind.\r\nSUMMARY:Indiana University Women's Soccer vs Purdue\r\nURL:https://admin.iuhoosiers.com/calendar.aspx?game_id=28657&amp;sport_id=17\r\nEND:VEVENT\r\nEND:VCALENDAR",
  );
  const [ev] = normalizeAthletics([parsed], IUB_ATHLETICS);
  assert.equal(ev.url, "https://iuhoosiers.com/calendar.aspx?game_id=28657&sport_id=17");
  assert.equal(iubGame({ summary: "Indiana University Football vs X", url: "https://iuhoosiers.com/g?id=1" })[0].url, "https://iuhoosiers.com/g?id=1");
  for (const bad of ["https://admin.iuhoosiers.com.evil.example/g", "http://admin.iuhoosiers.com/g", "https://evil.example/g", "javascript:alert(1)"]) {
    assert.equal(iubGame({ summary: "Indiana University Football vs X", url: bad })[0].url, null, bad);
  }
  // Indy keeps no rewrite: its admin host would be refused, never moved.
  assert.equal(game({ summary: "IU Indy Volleyball vs X", url: "https://admin.iuindyjags.com/g" })[0].url, null);
  const tickets = (line: string) => iubGame({ summary: "Indiana University Men's Soccer vs X", description: `Tickets: ${line}` })[0].tickets_url;
  assert.equal(tickets("https://iuhoosiers.evenue.net/list/MSM"), "https://iuhoosiers.evenue.net/list/MSM");
  assert.equal(tickets("https://www.ticketmaster.com/event/1"), "https://www.ticketmaster.com/event/1");
  for (const bad of ["https://tournaflex.com/x", "https://purdue.evenue.net/x", "https://iuhoosiers.evenue.net.evil.example/x", "http://iuhoosiers.evenue.net/x"]) {
    assert.equal(tickets(bad), null, bad);
  }
  // Indy's tickets stay Ticketmaster only.
  assert.equal(game({ summary: "IU Indy Volleyball vs X", description: "Tickets: https://iuhoosiers.evenue.net/x" })[0].tickets_url, null);
});

test("Bloomington: one event in groups 76 and 341 (two X-LIVEWHALE-IDs, one link number) shows once", () => {
  const start = Date.parse("2026-10-22T22:00:00Z");
  const row = (lwid: string, url: string | null, summary = "FASE Etiquette Dinner - Fall 2026") =>
    ics({ summary, location: "UNION STREET AUDITORIUM", start, end: start + 2 * HOUR, url, x: { "X-LIVEWHALE-ID": lwid } });
  const life = normalizeLiveWhale([row("2437050", "https://events.iu.edu/live/events/2377890-fase-etiquette-dinner-fall-2026")], IUB_LIFE);
  const featured = normalizeLiveWhale([row("2377890", "https://events.iu.edu/live/events/2377890-fase-etiquette-dinner-fall-2026")], IUB_FEATURED);
  const out = mergeSchoolEvents([life, featured], start);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "iu:2377890");
  // Neither copy is "featured", so the first calendar's copy stays (Student Life).
  assert.equal(out[0].source, "iub-student-life");
  // A link with no number in both groups: the title and start still match.
  const slug = "https://events.iu.edu/live/events/birds-in-books";
  const a = normalizeLiveWhale([row("2437014", slug, "An ornithology pop-up exhibition")], IUB_LIFE);
  const b = normalizeLiveWhale([row("2451390", slug, "An ornithology pop-up exhibition")], IUB_FEATURED);
  assert.equal(mergeSchoolEvents([a, b], start).length, 1);
});

test("fixtures: Bloomington's three calendars (fetched Oct 19), home games and one row per event", () => {
  const counts = (key: string, feed: (typeof SCHOOL_FEEDS)[number]) => {
    const r = normalizeFeedWithCount(fixture(key), feed);
    return [r.parsed, r.events.length];
  };
  // 87 home games before Oct 19's fixes; the men's and women's meets on Oct 2, 9 and 23 and Jan 8 are one each now.
  assert.deepEqual(counts("iub-athletics", IUB_ATHLETICS), [282, 83]);
  assert.deepEqual(counts("iub-student-life", IUB_LIFE), [108, 103]);
  assert.deepEqual(counts("iub-featured", IUB_FEATURED), [181, 100]);
  const games = normalizeFeed(fixture("iub-athletics"), IUB_ATHLETICS);
  assert.ok(games.every((e) => e.kind === "game" && e.id.startsWith("iub-athletics:") && e.matchup?.home !== "IU Indy"));
  assert.ok(games.every((e) => e.url === null || e.url.startsWith("https://iuhoosiers.com/")));
  assert.ok(games.every((e) => !e.title.includes("#")));
  // No rank of either kind, no innings, no pool length, and no game twice (Oct 19, 2026).
  assert.ok(games.every((e) => !/\(RV\)|Innings\)|\(SCM\)/i.test(e.title)), "no rankings or notes");
  assert.equal(new Set(games.map((e) => `${e.title}|${e.starts_at}`)).size, games.length);
  assert.ok(games.every((e) => e.tickets_url === null || new URL(e.tickets_url).hostname === "iuhoosiers.evenue.net"));
  const soccer = games.find((e) => e.starts_at === "2026-10-22T23:00:00.000Z");
  assert.deepEqual(
    [soccer?.title, soccer?.sport, soccer?.location],
    ["IU vs Purdue", "Women's soccer", "Jerry Yeagley Field at Bill Armstrong Stadium"],
  );
  const football = games.find((e) => e.starts_at === "2026-10-31T19:30:00.000Z");
  assert.deepEqual([football?.title, football?.location], ["IU vs Minnesota", "Bloomington"]);
  // 76 and 341 share 80 events: merged, no evening shows twice.
  const now = Date.parse("2026-10-22T22:00:00Z");
  const merged = mergeSchoolEvents(
    [games, normalizeFeed(fixture("iub-student-life"), IUB_LIFE), normalizeFeed(fixture("iub-featured"), IUB_FEATURED)],
    now,
  );
  const events = merged.filter((e) => e.kind === "event");
  assert.equal(new Set(events.map((e) => `${e.title}|${e.starts_at}`)).size, events.length);
  assert.ok(merged.every((e) => !e.featured));
  assert.ok(merged.some((e) => e.location === "IU Cinema"));
});
