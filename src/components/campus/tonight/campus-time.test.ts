/**
 * Tests for `campus-time.ts`: campus days on the two clock-change days, the
 * labels the boards print, midnight, and stepping days across a clock change.
 *
 * Run with:
 *   node --test src/components/campus/tonight/campus-time.test.ts
 *
 * WHY THE RESOLVE HOOK: as in `rolling-strip-view.test.ts`, Node's type
 * stripping doesn't resolve the "@/…" alias or add file extensions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("campus-time.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  addCampusDays,
  campusClock,
  campusDateTime,
  campusDay,
  campusHour,
  campusLongDay,
  campusShortDay,
  isCampusMidnight,
} = await import("./campus-time");

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

test("campusDay: an ordinary day runs campus midnight to campus midnight", () => {
  // Sat Nov 7 2026, 6 PM on campus (EST, UTC-5) = 23:00Z.
  const day = campusDay(at("2026-11-07T23:00:00Z"));
  assert.equal(day.key, "2026-11-07");
  assert.equal(day.label, "Sat, Nov 7");
  assert.equal(day.start, at("2026-11-07T05:00:00Z"));
  assert.equal(day.end, at("2026-11-08T05:00:00Z"));
});

test("campusDay: Nov 1 2026 is 25 hours long (clocks fall back)", () => {
  const day = campusDay(at("2026-11-01T17:00:00Z"));
  assert.equal(day.key, "2026-11-01");
  assert.equal(day.label, "Sun, Nov 1");
  assert.equal(day.start, at("2026-11-01T04:00:00Z"), "midnight EDT");
  assert.equal(day.end, at("2026-11-02T05:00:00Z"), "midnight EST");
  assert.equal(day.end - day.start, 25 * HOUR);
});

test("campusDay: Mar 14 2027 is 23 hours long (clocks spring forward)", () => {
  const day = campusDay(at("2027-03-14T18:00:00Z"));
  assert.equal(day.key, "2027-03-14");
  assert.equal(day.start, at("2027-03-14T05:00:00Z"), "midnight EST");
  assert.equal(day.end, at("2027-03-15T04:00:00Z"), "midnight EDT");
  assert.equal(day.end - day.start, 23 * HOUR);
});

test("campusDay: late evening on campus is still that campus day, whatever UTC says", () => {
  // 11:30 PM Oct 22 on campus (EDT) is already Oct 23 in UTC.
  const day = campusDay(at("2026-10-23T03:30:00Z"));
  assert.equal(day.key, "2026-10-22");
  assert.equal(day.label, "Thu, Oct 22");
  // The last ms of the day belongs to it; the next ms is tomorrow.
  assert.equal(campusDay(day.end - 1).key, "2026-10-22");
  assert.equal(campusDay(day.end).key, "2026-10-23");
  assert.equal(campusDay(day.start).key, "2026-10-22");
});

test("labels: clock, short day, long day and the school cards' date line", () => {
  // Thu Nov 5 2026, 5 PM EST.
  const five = at("2026-11-05T22:00:00Z");
  assert.equal(campusClock(five), "5:00 PM");
  assert.equal(campusShortDay(five), "Thu 5");
  assert.equal(campusLongDay(five), "Thursday, Nov 5");
  assert.equal(campusClock(at("2026-11-05T17:05:00Z")), "12:05 PM");
  assert.equal(campusClock(at("2026-11-06T05:00:00Z")), "12:00 AM");
  // Wed Nov 11 2026, 6:30 PM EST.
  assert.equal(campusDateTime(at("2026-11-11T23:30:00Z")), "Wed, Nov 11 · 6:30 PM");
  // Plain spaces only: no narrow no-break space before PM.
  assert.doesNotMatch(campusClock(five), /[  ]/);
});

test("isCampusMidnight and campusHour read campus time, not UTC", () => {
  assert.equal(isCampusMidnight(at("2026-11-08T05:00:00Z")), true, "midnight EST");
  assert.equal(isCampusMidnight(at("2026-10-23T04:00:00Z")), true, "midnight EDT");
  assert.equal(isCampusMidnight(at("2026-11-08T00:00:00Z")), false, "midnight UTC is 7 PM on campus");
  assert.equal(isCampusMidnight(at("2026-11-08T05:01:00Z")), false);
  assert.equal(campusHour(at("2026-11-08T00:00:00Z")), 19);
  assert.equal(campusHour(at("2026-11-08T05:00:00Z")), 0);
  assert.equal(campusHour(at("2026-11-07T21:59:00Z")), 16);
  assert.equal(campusHour(at("2026-11-07T22:00:00Z")), 17);
});

test("addCampusDays: by wall date across both clock changes", () => {
  const oct31 = campusDay(at("2026-10-31T16:00:00Z"));
  const nov1 = addCampusDays(oct31, 1);
  assert.equal(nov1.key, "2026-11-01");
  assert.equal(nov1.end - nov1.start, 25 * HOUR);
  const nov2 = addCampusDays(oct31, 2);
  assert.equal(nov2.key, "2026-11-02");
  assert.equal(nov2.start, at("2026-11-02T05:00:00Z"));
  assert.equal(nov2.start, nov1.end, "days touch: one's end is the next one's start");

  const mar13 = campusDay(at("2027-03-13T18:00:00Z"));
  const week = addCampusDays(mar13, 7);
  assert.equal(week.key, "2027-03-20");
  assert.equal(week.start, at("2027-03-20T04:00:00Z"));

  // Backwards, and across a month end.
  const nov7 = campusDay(at("2026-11-07T23:00:00Z"));
  assert.equal(addCampusDays(nov7, -2).key, "2026-11-05");
  assert.equal(addCampusDays(nov7, -7).key, "2026-10-31");
  assert.equal(addCampusDays(nov7, 0).key, "2026-11-07");
  assert.equal(addCampusDays(campusDay(at("2026-12-31T20:00:00Z")), 1).key, "2027-01-01");
});
