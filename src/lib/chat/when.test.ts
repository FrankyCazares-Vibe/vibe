/**
 * Tests for `when.ts` (handoffs/chat-redesign/wave-2-contracts.md 1.4).
 *
 * Run with:
 *   node --test src/lib/chat/when.test.ts
 *
 * ZONES. The relative labels format in the device's zone, so every date here
 * is built with the local `Date` constructor (`new Date(2026, 9, 8, 19, 30)`
 * is Oct 8, 7:30 PM wherever the test runs) and the answers do not depend on
 * TZ. `eventWhen` / `eventWhenSpoken` take a zone: those tests use UTC
 * strings and name the zone (campus time is UTC-4 in October, UTC-5 in
 * January).
 *
 * WHY THE RESOLVE HOOK: `when.ts` re-exports `CAMPUS_TIME_ZONE` through the
 * "@/…" alias, which Node's type stripping does not resolve (the
 * `orgs/following.test.ts` pattern).
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("when.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./when.ts";
const { CAMPUS_TIME_ZONE, eventTime, eventTimeShort, eventWhen, eventWhenSpoken, isSoon, moreDays, rowTime, rowTimeSpoken } =
  (await import(specifier)) as typeof import("./when");

// Thursday Oct 8, 2026, 9:00 PM on the device.
const NOW = new Date(2026, 9, 8, 21, 0, 0);
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0);

test("the campus zone is the one constant, re-exported", () => {
  assert.equal(CAMPUS_TIME_ZONE, "America/Indiana/Indianapolis");
});

test("rowTime: same day is the time, with minutes", () => {
  assert.equal(rowTime(local(2026, 9, 8, 20, 44), NOW), "8:44 PM");
  assert.equal(rowTime(local(2026, 9, 8, 0, 5), NOW), "12:05 AM");
  assert.equal(rowTime(local(2026, 9, 8, 12, 0), NOW), "12:00 PM");
  assert.equal(rowTime(local(2026, 9, 8, 21, 30), NOW), "9:30 PM", "later today (clock skew) is still today");
});

test("rowTime: yesterday, the weekday within 6 days, then the date, with the year when it differs", () => {
  assert.equal(rowTime(local(2026, 9, 7, 23, 59), NOW), "Yesterday");
  assert.equal(rowTime(local(2026, 9, 7, 0, 0), NOW), "Yesterday", "a calendar day, not 24 hours");
  assert.equal(rowTime(local(2026, 9, 6, 9, 0), NOW), "Tue");
  assert.equal(rowTime(local(2026, 9, 2, 9, 0), NOW), "Fri", "6 days ago");
  assert.equal(rowTime(local(2026, 9, 1, 9, 0), NOW), "Oct 1", "7 days ago");
  assert.equal(rowTime(local(2026, 0, 5, 9, 0), NOW), "Jan 5");
  assert.equal(rowTime(local(2025, 9, 5, 9, 0), NOW), "Oct 5, 2025");
  assert.equal(rowTime(local(2026, 9, 9, 9, 0), NOW), "Oct 9", "a future day is a date");
});

test("rowTimeSpoken spells the weekday and the month out", () => {
  assert.equal(rowTimeSpoken(local(2026, 9, 8, 20, 44), NOW), "8:44 PM");
  assert.equal(rowTimeSpoken(local(2026, 9, 7, 9, 0), NOW), "Yesterday");
  assert.equal(rowTimeSpoken(local(2026, 9, 6, 9, 0), NOW), "Tuesday");
  assert.equal(rowTimeSpoken(local(2026, 9, 1, 9, 0), NOW), "October 1");
  assert.equal(rowTimeSpoken(local(2025, 9, 5, 9, 0), NOW), "October 5, 2025");
});

test("rowTime accepts the database's string and answers nothing for a bad date", () => {
  assert.equal(rowTime(NOW.toISOString(), NOW), "9:00 PM");
  assert.equal(rowTime("", NOW), "");
  assert.equal(rowTime("Fall Formal", NOW), "");
  assert.equal(rowTime(null, NOW), "");
  assert.equal(rowTime(undefined, NOW), "");
});

test("eventTime: Tonight from 17:00, Today before, Tomorrow, the weekday, the date; minutes only when not :00", () => {
  const morning = local(2026, 9, 8, 9, 0);
  assert.equal(eventTime(local(2026, 9, 8, 19, 30), morning), "Tonight · 7:30 PM");
  assert.equal(eventTime(local(2026, 9, 8, 17, 0), morning), "Tonight · 5 PM", "17:00 is tonight");
  assert.equal(eventTime(local(2026, 9, 8, 16, 59), morning), "Today · 4:59 PM");
  assert.equal(eventTime(local(2026, 9, 8, 8, 0), morning), "Today · 8 AM", "earlier today is still Today");
  assert.equal(eventTime(local(2026, 9, 9, 19, 0), morning), "Tomorrow · 7 PM");
  assert.equal(eventTime(local(2026, 9, 10, 19, 0), morning), "Sat · 7 PM");
  assert.equal(eventTime(local(2026, 9, 14, 19, 0), morning), "Wed · 7 PM", "6 days out");
  assert.equal(eventTime(local(2026, 9, 15, 19, 30), morning), "Oct 15 · 7:30 PM", "7 days out");
  assert.equal(eventTime(local(2026, 11, 1, 0, 0), morning), "Dec 1 · 12 AM");
  assert.equal(eventTime(local(2026, 9, 1, 19, 30), morning), "Oct 1 · 7:30 PM", "a past day is a date");
  assert.equal(eventTime("nope", morning), "");
});

test("eventTimeShort: the same with a space and no Today / Tonight / Tomorrow", () => {
  const morning = local(2026, 9, 8, 9, 0);
  assert.equal(eventTimeShort(local(2026, 9, 8, 19, 30), morning), "7:30 PM");
  assert.equal(eventTimeShort(local(2026, 9, 8, 8, 0), morning), "8 AM");
  assert.equal(eventTimeShort(local(2026, 9, 9, 19, 0), morning), "7 PM");
  assert.equal(eventTimeShort(local(2026, 9, 10, 19, 0), morning), "Sat 7 PM");
  assert.equal(eventTimeShort(local(2026, 9, 15, 19, 30), morning), "Oct 15 7:30 PM");
});

test("isSoon: soon AND within 24 hours; a 1 AM event tapped at 10 PM counts", () => {
  const starts = "2026-10-09T05:00:00Z"; // 1 AM Eastern on Oct 9
  const ends = "2026-10-09T07:00:00Z";
  assert.equal(isSoon(starts, ends, new Date("2026-10-09T02:00:00Z")), true, "3 hours before");
  assert.equal(isSoon(starts, ends, new Date("2026-10-08T05:00:00Z")), true, "exactly 24 hours before");
  assert.equal(isSoon(starts, ends, new Date("2026-10-08T04:59:59Z")), false, "a second past 24 hours");
  assert.equal(isSoon(starts, ends, new Date("2026-10-09T05:00:00Z")), false, "live, not soon");
  assert.equal(isSoon(starts, ends, new Date("2026-10-09T08:00:00Z")), false, "after");
  assert.equal(isSoon("2026-10-09 01:00:00", ends, new Date("2026-10-09T02:00:00Z")), false, "a zone-less start fails closed");
  assert.equal(isSoon(null, ends, new Date("2026-10-09T02:00:00Z")), false);
});

test("eventWhen: the campus zone by default, no comma after the weekday, no :00", () => {
  assert.equal(eventWhen("2026-10-08T23:30:00Z"), "Thu Oct 8, 7:30 PM");
  assert.equal(eventWhen("2026-10-08T23:30:00Z", CAMPUS_TIME_ZONE), "Thu Oct 8, 7:30 PM");
  assert.equal(eventWhen("2026-10-08T23:00:00+00:00"), "Thu Oct 8, 7 PM");
  assert.equal(eventWhen("2026-10-09T03:59:00Z"), "Thu Oct 8, 11:59 PM", "still Oct 8 in Indiana");
  assert.equal(eventWhen("2026-10-09T04:00:00Z"), "Fri Oct 9, 12 AM", "midnight in Indiana");
  assert.equal(eventWhen("2026-01-15T17:00:00Z"), "Thu Jan 15, 12 PM", "UTC-5 in January");
  assert.equal(eventWhen("2026-10-08T23:30:00Z", "UTC"), "Thu Oct 8, 11:30 PM");
  assert.equal(eventWhen("2026-10-08T23:30:00Z", "Asia/Tokyo"), "Fri Oct 9, 8:30 AM");
});

test("eventWhen answers nothing for a bad date or an unknown zone", () => {
  assert.equal(eventWhen("", CAMPUS_TIME_ZONE), "");
  assert.equal(eventWhen("Fall Formal", CAMPUS_TIME_ZONE), "");
  assert.equal(eventWhen(null), "");
  assert.equal(eventWhen("2026-10-08T23:30:00Z", "Mars/Olympus"), "");
});

test("eventWhenSpoken spells the weekday and the month out", () => {
  assert.equal(eventWhenSpoken("2026-10-08T23:30:00Z"), "Thursday October 8, 7:30 PM");
  assert.equal(eventWhenSpoken("2026-10-08T23:00:00Z", "UTC"), "Thursday October 8, 11 PM");
  assert.equal(eventWhenSpoken("nope"), "");
});

test("moreDays: ceil((ends_at + 7 d − now) / 1 d), at least 1", () => {
  const ends = "2026-10-01T00:00:00Z";
  assert.equal(moreDays(ends, new Date("2026-10-01T00:00:00Z")), 7);
  assert.equal(moreDays(ends, new Date("2026-10-01T00:00:01Z")), 7, "a second in: still 7 (ceil)");
  assert.equal(moreDays(ends, new Date("2026-10-02T00:00:00Z")), 6);
  assert.equal(moreDays(ends, new Date("2026-10-07T12:00:00Z")), 1, "half a day left");
  assert.equal(moreDays(ends, new Date("2026-10-08T00:00:00Z")), 1, "the last moment: never 0");
  assert.equal(moreDays(ends, new Date("2026-10-20T00:00:00Z")), 1, "closed: never negative");
  assert.equal(moreDays("nope", new Date("2026-10-20T00:00:00Z")), 1);
});
