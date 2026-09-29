/**
 * Tests for `room-state.ts`: soon / live / after / closed and their exact
 * boundaries (handoffs/chat-redesign/wave-1-contracts.md section 6.0).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/chat/room-state.test.ts
 *
 * room-state.ts imports a type only, which Node erases, so it loads through a
 * dynamic import of its ".ts" path (the push/config.test.ts pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./room-state.ts";
const { ROOM_OPEN_AFTER_END_MS, roomState } = (await import(specifier)) as typeof import("./room-state");

// Fall Formal: Thu Oct 8 2026, 7:30 PM to 11:00 PM Indianapolis (UTC-4).
const STARTS = "2026-10-08T23:30:00+00:00";
const ENDS = "2026-10-09T03:00:00+00:00";
const START_MS = Date.parse(STARTS);
const END_MS = Date.parse(ENDS);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const at = (ms: number) => new Date(ms);

test("the window after the end is seven days", () => {
  assert.equal(ROOM_OPEN_AFTER_END_MS, WEEK_MS);
});

test("before the start it is soon, however far away", () => {
  assert.equal(roomState(STARTS, ENDS, at(START_MS - 1)), "soon");
  assert.equal(roomState(STARTS, ENDS, at(START_MS - 90 * 24 * 60 * 60 * 1000)), "soon");
  assert.equal(roomState(STARTS, ENDS, "2026-09-29T12:00:00Z"), "soon");
});

test("the start itself is live", () => {
  assert.equal(roomState(STARTS, ENDS, at(START_MS)), "live");
  assert.equal(roomState(STARTS, ENDS, STARTS), "live");
});

test("during the event it is live", () => {
  assert.equal(roomState(STARTS, ENDS, at(START_MS + 1)), "live");
  assert.equal(roomState(STARTS, ENDS, at((START_MS + END_MS) / 2)), "live");
  assert.equal(roomState(STARTS, ENDS, at(END_MS - 1)), "live");
});

test("the end itself is still live", () => {
  assert.equal(roomState(STARTS, ENDS, at(END_MS)), "live");
  assert.equal(roomState(STARTS, ENDS, ENDS), "live");
});

test("after the end it is after, up to the last millisecond of the week", () => {
  assert.equal(roomState(STARTS, ENDS, at(END_MS + 1)), "after");
  assert.equal(roomState(STARTS, ENDS, at(END_MS + 3 * 24 * 60 * 60 * 1000)), "after");
  assert.equal(roomState(STARTS, ENDS, at(END_MS + WEEK_MS - 1)), "after");
});

test("the end plus seven days, to the millisecond, is closed", () => {
  assert.equal(roomState(STARTS, ENDS, at(END_MS + WEEK_MS)), "closed");
  assert.equal(roomState(STARTS, ENDS, "2026-10-16T03:00:00+00:00"), "closed");
  assert.equal(roomState(STARTS, ENDS, at(END_MS + WEEK_MS + 1)), "closed");
  assert.equal(roomState(STARTS, ENDS, at(END_MS + 10 * 24 * 60 * 60 * 1000)), "closed");
});

test("an event with no length is live for its one instant, then after", () => {
  assert.equal(roomState(STARTS, STARTS, at(START_MS - 1)), "soon");
  assert.equal(roomState(STARTS, STARTS, at(START_MS)), "live");
  assert.equal(roomState(STARTS, STARTS, at(START_MS + 1)), "after");
  assert.equal(roomState(STARTS, STARTS, at(START_MS + WEEK_MS)), "closed");
});

test("the same instant written in another time zone gives the same answer", () => {
  assert.equal(roomState("2026-10-08T19:30:00-04:00", "2026-10-08T23:00:00-04:00", at(START_MS)), "live");
  assert.equal(roomState("2026-10-08T19:30:00-04:00", "2026-10-08T23:00:00-04:00", at(START_MS - 1)), "soon");
  assert.equal(roomState("2026-10-08T23:30:00Z", "2026-10-09T03:00:00Z", at(END_MS)), "live");
});

test("the database's microsecond timestamps are read", () => {
  const starts = "2026-10-08T23:30:00.123456+00:00";
  const ends = "2026-10-09T03:00:00.654321+00:00";
  assert.equal(roomState(starts, ends, "2026-10-08T23:30:00.122+00:00"), "soon");
  assert.equal(roomState(starts, ends, "2026-10-08T23:30:00.124+00:00"), "live");
  assert.equal(roomState(starts, ends, "2026-10-09T03:00:00.655+00:00"), "after");
});

test("Date objects and epoch milliseconds are accepted", () => {
  assert.equal(roomState(new Date(STARTS), new Date(ENDS), END_MS), "live");
  assert.equal(roomState(new Date(STARTS), ENDS, START_MS - 1), "soon");
});

test("a date that cannot be read answers closed", () => {
  const now = at(START_MS + 1);
  for (const bad of ["", "   ", "not a date", "2026-13-45T00:00:00Z", null, undefined]) {
    assert.equal(roomState(bad, ENDS, now), "closed", `starts_at=${String(bad)}`);
    assert.equal(roomState(STARTS, bad, now), "closed", `ends_at=${String(bad)}`);
  }
  // Text the engine's own parser would guess a date from.
  for (const bad of ["12", "1", "0", "2026", "Fall Formal 2026", "Oct 8 2026", "2026-10-08", "1791502200000"]) {
    assert.equal(roomState(bad, ENDS, now), "closed", `starts_at=${bad}`);
    assert.equal(roomState(STARTS, bad, now), "closed", `ends_at=${bad}`);
  }
  assert.equal(roomState(new Date(Number.NaN), ENDS, now), "closed");
  assert.equal(roomState(12 as unknown as string, ENDS, now), "closed", "a number is not a stored date");
  assert.equal(roomState({} as unknown as string, ENDS, now), "closed");
});

test("a date written without its time zone answers closed, on every machine", () => {
  const now = at(START_MS + 1);
  for (const bad of ["2026-10-08T23:30:00", "2026-10-08 23:30:00", "2026-10-08T23:30:00.123456", "2026-10-08T23:30"]) {
    assert.equal(roomState(bad, ENDS, now), "closed", `starts_at=${bad}`);
    assert.equal(roomState(STARTS, bad, now), "closed", `ends_at=${bad}`);
    assert.equal(roomState(STARTS, ENDS, bad), "closed", `now=${bad}`);
  }
});

test("a day or an hour that does not exist answers closed, it does not roll over", () => {
  const now = at(START_MS + 1);
  const bads = [
    "2026-02-30T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2027-02-29T00:00:00Z",
    "2026-00-10T00:00:00Z",
    "2026-10-00T00:00:00Z",
    "2026-10-08T24:00:00Z",
    "2026-10-08T23:60:00Z",
    "2026-10-08T23:30:60Z",
    "2026-10-08T23:30:00+16:00",
    "2026-10-08T23:30:00+00:60",
    "0026-10-08T23:30:00Z",
  ];
  for (const bad of bads) {
    assert.equal(roomState(bad, ENDS, now), "closed", `starts_at=${bad}`);
  }
  // Feb 29 exists in a leap year.
  assert.equal(roomState("2028-02-29T00:00:00Z", "2028-02-29T03:00:00Z", "2028-02-29T01:00:00Z"), "live");
});

test("every way the database writes a zone is read as the same instant", () => {
  const now = at(START_MS);
  const before = at(START_MS - 1);
  const same = [
    "2026-10-08T23:30:00+00:00",
    "2026-10-08T23:30:00Z",
    "2026-10-08t23:30:00z",
    "2026-10-08 23:30:00+00",
    "2026-10-08T23:30:00+00",
    "2026-10-08T23:30:00+0000",
    "2026-10-08T23:30:00-00:00",
    "2026-10-08T23:30Z",
    "2026-10-08T23:30:00.000000+00:00",
    "2026-10-08 19:30:00-04",
    "2026-10-09T05:00:00+05:30",
    "  2026-10-08T23:30:00+00:00  ",
  ];
  for (const starts of same) {
    assert.equal(roomState(starts, ENDS, now), "live", `starts_at=${starts}`);
    assert.equal(roomState(starts, ENDS, before), "soon", `starts_at=${starts}`);
  }
});

test("a zoned timestamp reads to the same millisecond as the engine reads it", () => {
  const samples = [
    "2026-10-08T23:30:00+00:00",
    "2026-10-08T19:30:00-04:00",
    "2026-10-08T23:30:00.123456+00:00",
    "2026-12-31T23:59:59.999Z",
    "2026-01-01T00:00:00.001+14:00",
    "2026-03-08T02:30:00-05:00",
    "1999-12-31T23:59:59Z",
  ];
  for (const text of samples) {
    const ms = Date.parse(text);
    assert.ok(Number.isFinite(ms), text);
    assert.equal(roomState(text, text, at(ms)), "live", text);
    assert.equal(roomState(text, text, at(ms - 1)), "soon", text);
    assert.equal(roomState(text, text, at(ms + 1)), "after", text);
  }
});

test("a clock that cannot be read answers closed", () => {
  assert.equal(roomState(STARTS, ENDS, "whenever"), "closed");
  assert.equal(roomState(STARTS, ENDS, "2026"), "closed");
  assert.equal(roomState(STARTS, ENDS, Number.NaN), "closed");
  assert.equal(roomState(STARTS, ENDS, new Date(Number.NaN)), "closed");
  assert.equal(roomState(STARTS, ENDS, null as unknown as Date), "closed");
});

test("an event that ends before it starts answers closed at every moment", () => {
  for (const ms of [END_MS - WEEK_MS, START_MS, END_MS, END_MS + 1, END_MS + WEEK_MS]) {
    assert.equal(roomState(ENDS, STARTS, at(ms)), "closed");
  }
});

test("without a clock it uses the present", () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const hour = 60 * 60 * 1000;
  assert.equal(roomState(iso(now + hour), iso(now + 2 * hour)), "soon");
  assert.equal(roomState(iso(now - hour), iso(now + hour)), "live");
  assert.equal(roomState(iso(now - 2 * hour), iso(now - hour)), "after");
  assert.equal(roomState(iso(now - 9 * 24 * hour), iso(now - 8 * 24 * hour)), "closed");
});
