/**
 * Tests for `tonight-view.ts`, the rules behind every Tonight surface: what
 * counts as tonight, who is #1 (and that popularity never decides it), the
 * 5+ count floor, the filter, the words, the week tiles and "Coming up".
 *
 * Run with:
 *   node --test src/components/campus/tonight/tonight-view.test.ts
 *
 * WHY THE RESOLVE HOOK: as in `rolling-strip-view.test.ts`, Node's type
 * stripping doesn't resolve the "@/…" alias or add file extensions. The
 * module only `import type`s campus-home, so React is never loaded here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

import type { CampusEvent } from "@/app/campus/campus-home";
import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("tonight-view.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const V = await import("./tonight-view");
const { campusDay } = await import("./campus-time");

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
// Sat Nov 7 2026 on campus (EST, UTC-5). NOW is 4:00 PM there.
const NOW = Date.parse("2026-11-07T21:00:00Z");
/** Campus wall time on Nov 7 2026 (EST): `campus(17)` is 5:00 PM. */
const campus = (h: number, m = 0, dayOffset = 0) => Date.parse("2026-11-07T05:00:00Z") + dayOffset * 24 * HOUR + h * HOUR + m * 60_000;

const SOURCES: SchoolSource[] = [
  { key: "athletics", host: "Athletics", credit: "From the IU Indy athletics calendar", calendar_url: "https://iuindyjags.com/calendar.aspx" },
  { key: "iu-student-affairs", host: "Student Affairs", credit: "From the IU Indianapolis Student Affairs calendar", calendar_url: "https://events.iu.edu/studentaffairs-indianapolis/" },
  { key: "iu-featured", host: "IU Indianapolis", credit: "From the IU Indianapolis events calendar", calendar_url: "https://events.iu.edu/indianapolis/" },
];

function game(id: string, start: number, over: Partial<SchoolEvent> = {}): SchoolEvent {
  return {
    id: `athletics:${id}`,
    source: "athletics",
    kind: "game",
    title: "IU Indy vs UT Martin",
    matchup: { home: "IU Indy", away: "UT Martin" },
    sport: "Men's basketball",
    promo: null,
    starts_at: iso(start),
    ends_at: iso(start + 2 * HOUR),
    location: "James T. Morris Arena",
    host: "Athletics",
    url: `https://iuindyjags.com/calendar.aspx?id=${id}`,
    tickets_url: null,
    watch_url: null,
    featured: false,
    ...over,
  };
}

function schoolEvent(id: string, start: number, end: number, over: Partial<SchoolEvent> = {}): SchoolEvent {
  return {
    id: `iu:${id}`,
    source: "iu-student-affairs",
    kind: "event",
    title: `Event ${id}`,
    matchup: null,
    sport: null,
    promo: null,
    starts_at: iso(start),
    ends_at: iso(end),
    location: "Campus Center",
    host: "Student Affairs",
    url: `https://events.iu.edu/event/${id}`,
    tickets_url: null,
    watch_url: null,
    featured: false,
    ...over,
  };
}

function club(id: string, start: number, end: number, over: Partial<CampusEvent> = {}): CampusEvent {
  return {
    id,
    org_id: "org-climb",
    creator_id: "u-1",
    title: `Club ${id}`,
    description: "",
    starts_at: iso(start),
    ends_at: iso(end),
    location: "Rec Center",
    going_count: 0,
    interested_count: 0,
    viewer_status: null,
    is_creator: false,
    viewer_can_manage: false,
    org: { id: "org-climb", handle: "climbing", name: "Climbing Club", logo_url: null, verified: true },
    creator: null,
    ...over,
  };
}

const build = (school: SchoolEvent[], clubs: CampusEvent[], filter?: "all" | "school" | "clubs", now = NOW) =>
  V.buildTonight({ school, clubs, sources: SOURCES, filter, now });

test("isTonight: live, later today, ended, tomorrow, and the multi-day exclusion", () => {
  const day = campusDay(NOW);
  assert.equal(V.isTonight(campus(15), campus(17), NOW, day), true, "on now");
  assert.equal(V.isTonight(campus(20), campus(22), NOW, day), true, "later today");
  assert.equal(V.isTonight(campus(23, 30), campus(25), NOW, day), true, "starts before midnight, ends after");
  assert.equal(V.isTonight(campus(12), campus(14), NOW, day), false, "ended");
  assert.equal(V.isTonight(campus(12), campus(16), NOW, day), false, "ends exactly now: ended");
  assert.equal(V.isTonight(campus(0, 0, 1), campus(2, 0, 1), NOW, day), false, "tomorrow at midnight");
  assert.equal(V.isTonight(campus(9, 0, -2), campus(18, 0, 3), NOW, day), false, "a week-long drive that began days ago");
  // 1 AM: a 10 PM-to-2 AM party from last night is still tonight's.
  const oneAm = campus(1);
  assert.equal(V.isTonight(campus(22, 0, -1), campus(2), oneAm, campusDay(oneAm)), true, "began last night, under 12 h, still on");
  assert.equal(V.isLive(campus(16), campus(17), NOW), true, "starts exactly now: live");
  assert.equal(V.isLive(campus(15), campus(16), NOW), false, "ends exactly now: not live");
});

test("publicGoing: a count shows only from 5 people up", () => {
  assert.equal(V.TONIGHT_COUNT_FLOOR, 5);
  assert.equal(V.publicGoing(4), null);
  assert.equal(V.publicGoing(5), 5);
  assert.equal(V.publicGoing(300), 300);
  assert.equal(V.publicGoing(0), null);
  assert.equal(V.publicGoing(null), null);
  assert.equal(V.publicGoing(undefined), null);
  assert.equal(V.publicGoing(Number.NaN), null);
});

test("lead: featured beats live beats next, school beats clubs", () => {
  const liveClub = club("c-live", campus(15), campus(18));
  const nextClub = club("c-next", campus(19), campus(21));
  const nextSchool = schoolEvent("s-next", campus(18), campus(20));
  const liveSchool = schoolEvent("s-live", campus(15, 30), campus(17));
  const featured = schoolEvent("f-1", campus(21), campus(23), { source: "iu-featured", host: "IU Indianapolis", featured: true });

  let v = build([nextSchool, liveSchool, featured], [liveClub, nextClub]);
  assert.equal(v.lead?.key, "school:iu:f-1");
  assert.equal(v.lead?.reason, "featured");

  v = build([nextSchool, liveSchool], [liveClub, nextClub]);
  assert.equal(v.lead?.key, "school:iu:s-live");
  assert.equal(v.lead?.reason, "live");

  v = build([nextSchool], [liveClub, nextClub]);
  assert.equal(v.lead?.key, "school:iu:s-next", "a school event leads even while a club event is on");
  assert.equal(v.lead?.reason, "next");

  v = build([], [nextClub, liveClub]);
  assert.equal(v.lead?.key, "club:c-live");
  assert.equal(v.lead?.reason, "live");

  v = build([], [nextClub]);
  assert.equal(v.lead?.key, "club:c-next");
  assert.equal(v.lead?.reason, "next");

  v = build([], []);
  assert.equal(v.lead, null);
});

test("popularity never orders: counts don't move a row", () => {
  const school = schoolEvent("quiet", campus(19), campus(20));
  const packed = club("packed", campus(17), campus(19), { going_count: 300, interested_count: 900 });
  let v = build([school], [packed]);
  assert.equal(v.lead?.kind, "school", "a 300-going club event never outranks a school event with no count");
  assert.deepEqual(v.clubs.map((i) => i.key), ["club:packed"]);

  const early = club("early", campus(18), campus(19), { going_count: 5, title: "Zumba" });
  const late = club("late", campus(20), campus(21), { going_count: 300, title: "Afterparty" });
  v = build([school], [late, early]);
  assert.deepEqual(v.clubs.map((i) => i.key), ["club:early", "club:late"], "by start, not count");

  // Same start: by title, never by count.
  const a = club("a", campus(18), campus(19), { title: "Alpha", going_count: 6 });
  const b = club("b", campus(18), campus(19), { title: "Beta", going_count: 600 });
  v = build([school], [b, a]);
  assert.deepEqual(v.clubs.map((i) => i.key), ["club:a", "club:b"]);
});

test("popularity never orders among clubs alone: lead, rows, next up and Coming up", () => {
  // No school event tonight, so a club leads: the earlier one, never the fuller one.
  const early0 = club("early0", campus(18), campus(19), { title: "Quiet one", going_count: 0 });
  const late300 = club("late300", campus(20), campus(21), { title: "Packed one", going_count: 300, interested_count: 900 });
  let v = build([], [late300, early0]);
  assert.equal(v.lead?.key, "club:early0");
  assert.equal(v.lead?.reason, "next");
  assert.deepEqual(v.clubs.map((i) => i.key), ["club:late300"]);

  // Both on now: the first one on (soonest start) leads, whatever the counts.
  const liveFew = club("live-few", campus(15), campus(18), { going_count: 5 });
  const liveMany = club("live-many", campus(15, 30), campus(18), { going_count: 500 });
  v = build([], [liveMany, liveFew]);
  assert.equal(v.lead?.key, "club:live-few");
  assert.equal(v.lead?.reason, "live");

  // Next up (a quiet night): by start, not count.
  const sunPacked = club("sun-packed", campus(20, 0, 1), campus(21, 0, 1), { going_count: 300 });
  const sunQuiet = club("sun-quiet", campus(12, 0, 1), campus(13, 0, 1), { going_count: 0 });
  v = build([], [sunPacked, sunQuiet]);
  assert.equal(v.lead, null);
  assert.deepEqual(v.nextUp.map((i) => i.key), ["club:sun-quiet", "club:sun-packed"]);

  // Coming up: by start, not count.
  const merged = V.mergeComingUp({ clubs: [late300, early0], school: [], sources: SOURCES, filter: "all" });
  assert.deepEqual(merged.map((e) => e.key), ["club:early0", "club:late300"]);
});

test("two featured items tonight: the one on now wins, else the first", () => {
  const featuredLater = schoolEvent("f-later", campus(18), campus(19), { source: "iu-featured", featured: true });
  const featuredLive = schoolEvent("f-live", campus(15, 30), campus(19), { source: "iu-featured", featured: true });
  const featuredEarly = schoolEvent("f-early", campus(17), campus(18), { source: "iu-featured", featured: true });
  let v = build([featuredLater, featuredLive], []);
  assert.equal(v.lead?.key, "school:iu:f-live", "the featured item on now leads");
  assert.equal(v.lead?.reason, "featured", "featured is the reason shown, even while it's on");
  assert.deepEqual(v.school.map((i) => i.key), ["school:iu:f-later"]);
  v = build([featuredLater, featuredEarly], []);
  assert.equal(v.lead?.key, "school:iu:f-early");
  assert.equal(v.lead?.reason, "featured");
  assert.deepEqual(v.school.map((i) => i.key), ["school:iu:f-later"], "the other featured item is an ordinary row");
});

test("school rows come before club rows; more counts both", () => {
  const lead = game("g1", campus(17));
  const s2 = schoolEvent("s2", campus(18), campus(19));
  const c1 = club("c1", campus(16, 30), campus(18));
  const c2 = club("c2", campus(21), campus(22));
  const v = build([s2, lead], [c2, c1]);
  assert.equal(v.lead?.key, "school:athletics:g1");
  assert.deepEqual(v.school.map((i) => i.key), ["school:iu:s2"]);
  assert.deepEqual(v.clubs.map((i) => i.key), ["club:c1", "club:c2"]);
  assert.equal(v.more, 3);
  assert.equal(v.dayKey, "2026-11-07");
  assert.equal(v.dayLabel, "Sat, Nov 7");
  assert.deepEqual(v.nextUp, [], "nextUp only when nothing is on");
});

test("filter: school drops clubs, clubs drops school, before anything else", () => {
  const g = game("g1", campus(17));
  const c = club("c1", campus(16, 30), campus(18), { going_count: 12 });
  let v = build([g], [c], "school");
  assert.equal(v.lead?.key, "school:athletics:g1");
  assert.equal(v.clubs.length, 0);
  assert.equal(v.more, 0);
  v = build([g], [c], "clubs");
  assert.equal(v.lead?.key, "club:c1");
  assert.equal(v.school.length, 0);
  assert.deepEqual(v.credits, [], "no school item, no credit");
  v = build([g], [c], "all");
  assert.equal(v.lead?.kind, "school");
  assert.equal(v.more, 1);
});

test("item text: time, tails, byline, subline, count and the spoken row", () => {
  const g = game("g1", campus(17));
  const vb = game("v1", campus(19), { sport: "Volleyball", title: "IU Indy vs Oakland", matchup: { home: "IU Indy", away: "Oakland" } });
  const s = schoolEvent("s1", campus(18), campus(20), { title: "Stress Busters" });
  const late = schoolEvent("s2", campus(21), campus(24), { title: "Late Night" });
  const c = club("c1", campus(20), campus(22), { title: "Bouldering night", going_count: 12 });
  const few = club("c2", campus(20, 30), campus(21), { title: "Board games", going_count: 4, org: null });
  const v = build([g, vb, s, late], [c, few]);

  const lead = v.lead!;
  assert.equal(lead.text.time, "5:00 PM");
  assert.equal(lead.text.timeTail, " tip-off", "a game never prints its end");
  assert.equal(lead.text.byline, "Athletics · Men's basketball");
  assert.equal(lead.text.subline, "Men's basketball · Home");
  assert.equal(lead.text.place, "James T. Morris Arena");
  assert.equal(lead.text.count, "", "no counts on school events");
  assert.equal(lead.text.day, "Sat 7");

  const [rowS, rowVb, rowLate] = v.school;
  assert.equal(rowS.text.timeTail, " to 8:00 PM");
  assert.equal(rowS.text.byline, "Student Affairs");
  assert.equal(rowS.text.subline, "");
  assert.equal(rowVb.text.timeTail, " first serve");
  assert.equal(rowLate.text.timeTail, " to midnight");

  const [rowC, rowFew] = v.clubs;
  assert.equal(rowC.text.byline, "Climbing Club");
  assert.equal(rowC.text.count, "12 going");
  assert.equal(rowC.kind === "club" ? rowC.going : "x", 12);
  assert.equal(rowC.text.spoken, "8:00 PM, Bouldering night, Climbing Club, Rec Center, 12 going");
  assert.equal(rowFew.text.count, "", "4 going prints nothing");
  assert.equal(rowFew.kind === "club" ? rowFew.going : "x", null);
  assert.equal(rowFew.text.byline, "", "no club, no byline");

  const long = schoolEvent("long", campus(15), campus(15) + 13 * HOUR);
  const lv = build([long], []);
  assert.equal(lv.lead?.text.timeTail, "", "over 12 h: no end printed");
  assert.equal(lv.lead?.reason, "live");
  assert.match(lv.lead!.text.spoken, /^Happening now, 3:00 PM, /);
});

test("sportTail", () => {
  assert.equal(V.sportTail("Men's basketball"), " tip-off");
  assert.equal(V.sportTail("Women's soccer"), " kickoff");
  assert.equal(V.sportTail("Volleyball"), " first serve");
  assert.equal(V.sportTail("Women's swimming"), "");
  assert.equal(V.sportTail(null), "");
});

test("headings follow what sits above the club rows", () => {
  const g = game("g1", campus(17));
  const s = schoolEvent("s1", campus(18), campus(20));
  const c = club("c1", campus(20), campus(22));
  let v = build([g, s], [c]);
  assert.deepEqual(V.sectionHeadings(v, true), { school: "Also tonight", clubs: "Also tonight from clubs" });
  v = build([g], [c]);
  assert.deepEqual(V.sectionHeadings(v, true), { school: null, clubs: "Also tonight from clubs" }, "under a school hero");
  // The Events tab draws a club #1 as the first club row, not as a hero.
  v = build([], [c]);
  assert.deepEqual(V.sectionHeadings(v, false), { school: null, clubs: "Tonight from clubs" });
  v = build([], []);
  assert.deepEqual(V.sectionHeadings(v, false), { school: null, clubs: null });
  v = build([g], []);
  assert.deepEqual(V.sectionHeadings(v, true), { school: null, clubs: null });

  // A club #1 drawn as the hero (the desktop panel and the phone sheet): the
  // other club rows sit under it, so they are "also" tonight. (§5.2 names a
  // school hero; a club hero reads the same way, and only happens when no
  // school event is on tonight, so there are never school rows with it.)
  const c2 = club("c2", campus(21), campus(23));
  v = build([], [c, c2]);
  assert.deepEqual(V.sectionHeadings(v, true), { school: null, clubs: "Also tonight from clubs" });
  v = build([], [c]);
  assert.deepEqual(V.sectionHeadings(v, true), { school: null, clubs: null }, "the hero is the only club event");
  // Where a club #1 is drawn as the first club row instead (the Events tab),
  // that row alone still gets its heading: the list it heads isn't empty.
  assert.deepEqual(V.sectionHeadings(v, false), { school: null, clubs: "Tonight from clubs" });
  v = build([], [c, c2]);
  assert.deepEqual(V.sectionHeadings(v, false), { school: null, clubs: "Tonight from clubs" });
});

test("nextUp: only when nothing is on, both kinds, the next 7 campus days, at most 3", () => {
  const tomorrow = game("g-sun", campus(14, 0, 1));
  const mon = club("c-mon", campus(19, 0, 2), campus(21, 0, 2));
  const tue = schoolEvent("s-tue", campus(12, 0, 3), campus(13, 0, 3));
  const wed = club("c-wed", campus(19, 0, 4), campus(20, 0, 4));
  const tooFar = schoolEvent("s-far", campus(12, 0, 8), campus(13, 0, 8));
  const ended = club("c-ended", campus(9), campus(10));
  let v = build([tooFar, tue, tomorrow], [wed, mon, ended]);
  assert.equal(v.lead, null);
  assert.deepEqual(v.nextUp.map((i) => i.key), ["school:athletics:g-sun", "club:c-mon", "school:iu:s-tue"]);
  assert.equal(v.nextUp[0].text.day, "Sun 8");
  assert.equal(v.more, 0);
  assert.deepEqual(v.credits.map((s) => s.key), ["athletics", "iu-student-affairs"], "nextUp's calendars are credited");

  const tonight = club("c-tonight", campus(19), campus(20));
  v = build([tue, tomorrow], [tonight]);
  assert.equal(v.lead?.key, "club:c-tonight");
  assert.deepEqual(v.nextUp, []);
  assert.deepEqual(v.credits, [], "nothing from school on screen");
});

test("credits: once each, in the fixed source order", () => {
  const featured = schoolEvent("f1", campus(20), campus(21), { source: "iu-featured", featured: true, host: "IU Indianapolis" });
  const sa = schoolEvent("s1", campus(18), campus(19));
  const sa2 = schoolEvent("s2", campus(19), campus(20));
  const g = game("g1", campus(17));
  const v = build([featured, sa, sa2, g], []);
  assert.deepEqual(v.credits.map((s) => s.key), ["athletics", "iu-student-affairs", "iu-featured"]);
  const only = build([sa, sa2], []);
  assert.deepEqual(only.credits.map((s) => s.key), ["iu-student-affairs"]);
});

test("rule lines and reason labels", () => {
  const g = game("g1", campus(17));
  const live = game("g2", campus(15, 30));
  const featured = schoolEvent("f1", campus(20), campus(21), { source: "iu-featured", featured: true });
  const c = club("c1", campus(20), campus(22));
  assert.equal(V.leadRuleLine(build([g], []).lead!), "First because it starts soonest. Your school can feature one event a day instead.");
  assert.equal(V.leadRuleLine(build([live], []).lead!), "First because it's on right now. Your school can feature one event a day instead.");
  assert.equal(V.leadRuleLine(build([featured, g], []).lead!), "Your school featured this today. Never paid, never ranked by popularity.");
  assert.equal(V.leadRuleLine(build([], [c]).lead!), "Nothing from your school tonight, so the soonest club event leads.");
  assert.equal(V.reasonLabel("next"), "Up next");
  assert.equal(V.reasonLabel("live"), "Happening now");
  assert.equal(V.reasonLabel("featured"), "Featured by your school");
});

test("cardSpoken reads the card as one sentence", () => {
  const g = game("g1", campus(17));
  const others = [schoolEvent("s1", campus(18), campus(19)), schoolEvent("s2", campus(19), campus(20))];
  const c = club("c1", campus(20), campus(22), { going_count: 12 });
  const v = build([g, ...others], [c]);
  assert.equal(
    V.cardSpoken(v),
    "What's the vibe tonight, Sat, Nov 7. Up next: IU Indy vs UT Martin, school event, Athletics, 5:00 PM, James T. Morris Arena. Plus 3 more tonight. Opens the list.",
  );
  const clubOnly = build([], [c]);
  assert.equal(
    V.cardSpoken(clubOnly),
    "What's the vibe tonight, Sat, Nov 7. Up next: Club c1, Climbing Club, 8:00 PM, Rec Center, 12 going. Nothing else tonight. Opens the list.",
  );
  assert.equal(V.TONIGHT_COPY.more(3), "+3 more tonight");
  assert.equal(V.TONIGHT_COPY.more(0), "Nothing else tonight");
});

test("tonightSectionVisible", () => {
  const empty = build([], []);
  const busy = build([], [club("c1", campus(20), campus(22))]);
  assert.equal(V.tonightSectionVisible(null, true), false);
  assert.equal(V.tonightSectionVisible(empty, true), true, "school on: the empty state shows");
  assert.equal(V.tonightSectionVisible(empty, false), false, "no school calendar and a quiet night: nothing new");
  assert.equal(V.tonightSectionVisible(busy, false), true);
});

test("buildHomeWeek: states, labels, the window and the cap", () => {
  const thu = game("thu", campus(19, 0, -2), { title: "IU Indy vs SIUE", matchup: { home: "IU Indy", away: "SIUE" } });
  const tooEarly = game("wed", campus(19, 0, -3));
  const live = game("live", campus(15, 30), { sport: "Volleyball" });
  const tonight = game("tonight", campus(17));
  const noon = game("noon", campus(12, 0, 1));
  const later = game("later", campus(18, 30, 3), { matchup: null, title: "IU Indy at the Classic", sport: null });
  const tooLate = game("late", campus(18, 0, 5));
  const notAGame = schoolEvent("fair", campus(12), campus(18));
  const tiles = V.buildHomeWeek([later, tooLate, noon, tonight, live, thu, tooEarly, notAGame], NOW);
  assert.deepEqual(tiles.map((t) => t.key), [
    "school:athletics:thu",
    "school:athletics:live",
    "school:athletics:tonight",
    "school:athletics:noon",
    "school:athletics:later",
  ]);
  const [t0, t1, t2, t3, t4] = tiles;
  assert.deepEqual([t0.state, t0.label, t0.day, t0.versus], ["final", "Final", "Thu 5", "vs SIUE"]);
  assert.equal(t0.sport, "Men's basketball");
  assert.equal(t0.spoken, "Thursday, Nov 5: Men's basketball, IU Indy vs SIUE, final");
  assert.deepEqual([t1.state, t1.label], ["live", "Now"]);
  assert.deepEqual([t2.state, t2.label], ["today", "Tonight 5:00 PM"]);
  assert.deepEqual([t3.state, t3.label, t3.day], ["later", "12:00 PM", "Sun 8"]);
  assert.deepEqual([t4.state, t4.label, t4.versus, t4.sport], ["later", "6:30 PM", "IU Indy at the Classic", ""]);

  // Before 5 PM on the day itself it reads "Today".
  const morning = V.buildHomeWeek([game("am", campus(12))], campus(9));
  assert.deepEqual([morning[0].state, morning[0].label], ["today", "Today 12:00 PM"]);

  const many = Array.from({ length: 12 }, (_, i) => game(`m${i}`, campus(18, i)));
  assert.equal(V.buildHomeWeek(many, NOW).length, 8);
});

test("upcomingSchool: after tonight, within 7 campus days, soonest first", () => {
  const tonight = game("tonight", campus(19));
  const tomorrow = schoolEvent("sun", campus(13, 0, 1), campus(14, 0, 1));
  const sixDays = game("six", campus(19, 0, 6));
  const sevenDays = game("seven", campus(0, 0, 7));
  const out = V.upcomingSchool([sevenDays, sixDays, tomorrow, tonight], NOW);
  assert.deepEqual(out.map((e) => e.id), ["iu:sun", "athletics:six"]);
});

test("mergeComingUp: clubs and school by start then title, the filter, sources attached", () => {
  const c1 = club("c1", campus(19), campus(20), { title: "Bouldering" });
  const c2 = club("c2", campus(19, 0, 2), campus(20, 0, 2));
  const s1 = game("g1", campus(12, 0, 1));
  const s2 = schoolEvent("s2", campus(19), campus(21), { title: "Art show" });
  const orphan = schoolEvent("o1", campus(9, 0, 3), campus(10, 0, 3), { source: "iu-featured" });
  const sources = SOURCES.filter((s) => s.key !== "iu-featured");
  const all = V.mergeComingUp({ clubs: [c2, c1], school: [orphan, s2, s1], sources, filter: "all" });
  assert.deepEqual(all.map((e) => e.key), ["school:iu:s2", "club:c1", "school:athletics:g1", "club:c2", "school:iu:o1"]);
  const first = all[0];
  assert.equal(first.kind === "school" ? first.source?.key : "x", "iu-student-affairs");
  const last = all[4];
  assert.equal(last.kind === "school" ? last.source : "x", null, "a calendar not in sources: null");

  const school = V.mergeComingUp({ clubs: [c1, c2], school: [s1, s2], sources, filter: "school" });
  assert.deepEqual(school.map((e) => e.kind), ["school", "school"]);
  const clubs = V.mergeComingUp({ clubs: [c1, c2], school: [s1, s2], sources, filter: "clubs" });
  assert.deepEqual(clubs.map((e) => e.key), ["club:c1", "club:c2"]);
});
