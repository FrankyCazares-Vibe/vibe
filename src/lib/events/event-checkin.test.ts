/**
 * Tests for event check-in's shared half (`event-checkin.ts`, Oct 19 2026;
 * contract handoffs/2026-10-19-checkin-build/CONTRACT.md section 6): the
 * window edges, the code box's cleaning, the shapes, the paths and the link,
 * the count line's from-5 rule, the door's clock, the officers' split, the
 * RPC row parser, and that no sentence uses a word the product never says
 * (the contract's list) or anything about where someone is. The database's
 * copy of the numbers is pinned by checkin-migration.test.ts.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/event-checkin.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

const spec = "./event-checkin.ts";
const m = (await import(spec)) as typeof import("./event-checkin");
type EventAttendee = import("./event-checkin").EventAttendee;

const HOUR = 60 * 60 * 1000;
const START = "2026-10-20T23:00:00.000Z";
const END = "2026-10-21T02:00:00.000Z";
const startMs = Date.parse(START);
const endMs = Date.parse(END);
const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const TOKEN = "UVxxReBJ3ewsgZRtrv3ISQ";

test("checkinPhase: an hour before the start to an hour after the end, both edges in", () => {
  assert.equal(m.checkinPhase(START, END, startMs - HOUR - 1), "before");
  assert.equal(m.checkinPhase(START, END, startMs - HOUR), "open");
  assert.equal(m.checkinPhase(START, END, startMs), "open");
  assert.equal(m.checkinPhase(START, END, endMs + HOUR), "open");
  assert.equal(m.checkinPhase(START, END, endMs + HOUR + 1), "after");
});

test("checkinPhase: an unreadable time or the not-yet-hydrated clock (0) draws nothing", () => {
  assert.equal(m.checkinPhase("not a date", END, startMs), null);
  assert.equal(m.checkinPhase(START, "", startMs), null);
  assert.equal(m.checkinPhase(START, END, 0), null);
  assert.equal(m.checkinPhase(START, END, Number.NaN), null);
});

test("markPhase: Mark as here runs to a day after the end", () => {
  assert.equal(m.markPhase(START, END, startMs - HOUR - 1), "before");
  assert.equal(m.markPhase(START, END, startMs - HOUR), "open");
  assert.equal(m.markPhase(START, END, endMs + HOUR + 1), "open");
  assert.equal(m.markPhase(START, END, endMs + 24 * HOUR), "open");
  assert.equal(m.markPhase(START, END, endMs + 24 * HOUR + 1), "after");
  assert.equal(m.markPhase(START, END, 0), null);
});

test("sanitizeDoorCode keeps digits only, at most 4 (a pasted ' 12-3 4' survives)", () => {
  assert.equal(m.sanitizeDoorCode(" 12-3 4"), "1234");
  assert.equal(m.sanitizeDoorCode("12345"), "1234");
  assert.equal(m.sanitizeDoorCode("ab"), "");
  assert.equal(m.sanitizeDoorCode("０１"), "", "full-width digits are not ASCII digits");
});

test("isDoorCode / isCheckinToken: the exact shapes", () => {
  assert.equal(m.isDoorCode("0042"), true);
  for (const bad of ["042", "12345", "12a4", " 1234", 1234, null, undefined]) {
    assert.equal(m.isDoorCode(bad), false, String(bad));
  }
  assert.equal(m.isCheckinToken(TOKEN), true);
  assert.equal(m.isCheckinToken("qlMyCJLtE-U9y9KYwGZWXQ"), true, "base64url's - and _ are allowed");
  for (const bad of [TOKEN.slice(1), `${TOKEN}A`, "UVxxReBJ3ewsgZRtrv3IS+", "UVxxReBJ3ewsgZRtrv3IS=", 22, null]) {
    assert.equal(m.isCheckinToken(bad), false, String(bad));
  }
});

test("the three paths and the QR's link", () => {
  assert.equal(m.checkinPagePath(EVENT), `/campus/checkin/${EVENT}`);
  assert.equal(m.doorPagePath(EVENT), `/campus/checkin/${EVENT}/door`);
  assert.equal(m.eventAnchorPath(EVENT), `/campus?tab=events&event=${EVENT}`);
  assert.equal(
    m.checkinLink("https://www.connectvibe.app", EVENT, TOKEN),
    `https://www.connectvibe.app/campus/checkin/${EVENT}?checkin=${TOKEN}`,
  );
  assert.equal(m.CHECKIN_LINK_PARAM, "checkin", "never `code`: supabase-js reads ?code= as a sign-in code");
  assert.equal(m.checkinPagePath("a/b"), "/campus/checkin/a%2Fb", "an id can't add a path segment");
});

test("checkinCountLine: nothing, then from 5 up for students, any number for officers", () => {
  assert.equal(m.checkinCountLine(null, false, false), null);
  assert.equal(m.checkinCountLine(undefined, false, true), null);
  assert.equal(m.checkinCountLine(Number.NaN, false, true), null);
  assert.equal(m.checkinCountLine(0, false, true), null);
  assert.equal(m.checkinCountLine(4, false, false), null, "a stale 4 never shows to a student");
  assert.equal(m.checkinCountLine(4, false, true), "4 checked in");
  assert.equal(m.checkinCountLine(1, true, true), "1 was there");
  assert.equal(m.checkinCountLine(5, false, false), "5 checked in");
  assert.equal(m.checkinCountLine(5, true, false), "5 were there");
  assert.equal(m.checkinCountLine(12.7, true, false), "12 were there");
});

test("secondsLeft follows the server's clock (skew = server - device)", () => {
  const ends = "2026-10-20T23:00:30.000Z";
  const device = Date.parse("2026-10-20T23:00:10.000Z");
  assert.equal(m.secondsLeft(ends, device, 0), 20);
  assert.equal(m.secondsLeft(ends, device, 5000), 15, "the server is 5 s ahead");
  assert.equal(m.secondsLeft(ends, device, -2500), 23, "rounded up");
  assert.equal(m.secondsLeft(ends, device + 60_000, 0), 0, "never negative");
  assert.equal(m.secondsLeft("bad", device, 0), 0);
});

test("doorStepNow: current, then next, then nothing (read the feed again)", () => {
  const current = { code: "1111", link: "a", starts_at: "2026-10-20T23:00:00.000Z", ends_at: "2026-10-20T23:00:30.000Z" };
  const next = { code: "2222", link: "b", starts_at: current.ends_at, ends_at: "2026-10-20T23:01:00.000Z" };
  const at = (iso: string) => Date.parse(iso);
  assert.equal(m.doorStepNow({ current, next }, at("2026-10-20T23:00:29.999Z"), 0), current);
  assert.equal(m.doorStepNow({ current, next }, at("2026-10-20T23:00:30.000Z"), 0), next);
  assert.equal(m.doorStepNow({ current, next }, at("2026-10-20T23:01:00.000Z"), 0), null);
  assert.equal(m.doorStepNow({ current, next }, at("2026-10-20T23:00:25.000Z"), 5000), next, "by the server's clock");
  assert.equal(m.doorStepNow({ current: null, next: null }, at("2026-10-20T23:00:00.000Z"), 0), null);
});

const person = (id: string, status: EventAttendee["status"], checkedIn: boolean): EventAttendee => ({
  status,
  created_at: status ? "2026-10-19T12:00:00.000Z" : null,
  checked_in: checkedIn,
  user: { id, name: id, handle: id, avatar_url: null, major: null, year: null },
});

test("splitAttendees: checked in first (Going, Interested, walk-ins), then Going not in, then Interested not in", () => {
  const g1 = person("g1", "going", true);
  const g2 = person("g2", "going", false);
  const g3 = person("g3", "going", true);
  const i1 = person("i1", "maybe", false);
  const i2 = person("i2", "maybe", true);
  const w1 = person("w1", null, true);
  const out = m.splitAttendees({ going: [g1, g2, g3], interested: [i1, i2], walk_ins: [w1] });
  assert.deepEqual(out.checkedIn.map((a) => a.user.id), ["g1", "g3", "i2", "w1"]);
  assert.deepEqual(out.goingNotIn.map((a) => a.user.id), ["g2"]);
  assert.deepEqual(out.interestedNotIn.map((a) => a.user.id), ["i1"]);
});

test("showCheckinSplit: once the window has opened, or as soon as anyone is in", () => {
  assert.equal(m.showCheckinSplit("before", 0), false);
  assert.equal(m.showCheckinSplit(null, 0), false);
  assert.equal(m.showCheckinSplit("before", 1), true);
  assert.equal(m.showCheckinSplit("open", 0), true);
  assert.equal(m.showCheckinSplit("after", 0), true);
});

test("parseCheckinStateRows skips anything malformed; checkinListFields defaults to nothing known", () => {
  const rows = m.parseCheckinStateRows([
    { event_id: "a", is_open: true, viewer_checked_in: true, checked_in_count: 7 },
    { event_id: "b", is_open: "true", viewer_checked_in: 1, checked_in_count: null },
    { event_id: "c", is_open: false, viewer_checked_in: false, checked_in_count: -1 },
    { event_id: "d", checked_in_count: 4.9 },
    { event_id: "e", checked_in_count: Number.POSITIVE_INFINITY },
    { event_id: 5, is_open: true },
    null,
    "x",
    [],
  ]);
  assert.deepEqual([...rows.keys()], ["a", "b", "c", "d", "e"]);
  assert.deepEqual(rows.get("a"), { open: true, viewerCheckedIn: true, count: 7 });
  assert.deepEqual(rows.get("b"), { open: false, viewerCheckedIn: false, count: null }, "only a real true counts");
  assert.equal(rows.get("c")?.count, null, "a negative count is no count");
  assert.equal(rows.get("d")?.count, 4);
  assert.equal(rows.get("e")?.count, null);
  for (const notRows of [null, undefined, {}, "rows", 3]) {
    assert.equal(m.parseCheckinStateRows(notRows).size, 0);
  }
  assert.deepEqual(m.checkinListFields(undefined), { checkin_open: false, checked_in_count: null, viewer_checked_in: false });
  assert.deepEqual(m.checkinListFields(rows.get("a")), { checkin_open: true, checked_in_count: 7, viewer_checked_in: true });
  assert.deepEqual(Object.keys(m.checkinListFields(undefined)), ["checkin_open", "checked_in_count", "viewer_checked_in"]);
});

test("the numbers the routes and the screens share", () => {
  assert.equal(m.CHECKIN_STEP_SEC, 30);
  assert.equal(m.CHECKIN_CODE_DIGITS, 4);
  assert.equal(m.CHECKIN_TOKEN_LENGTH, 22);
  assert.equal(m.CHECKIN_PUBLIC_FLOOR, 5);
  assert.equal(m.DOOR_POLL_MS < m.CHECKIN_STEP_SEC * 1000, true, "the door re-reads well inside one step");
});

test("no sentence uses the banned words or says anything about where someone is", () => {
  const sentences = [
    ...Object.values(m.CHECKIN_ERRORS),
    ...Object.values(m.CHECKIN_COPY),
    m.checkInToLine("Fall Formal"),
    m.opensAtLine("tomorrow at 6:00 PM"),
    m.newCodeInLine(12),
    m.clearConfirmLine("Fall Formal"),
  ];
  assert.ok(sentences.length > 60);
  for (const s of sentences) {
    const low = s.toLowerCase();
    for (const word of ["safety", "location", "where you are"]) {
      assert.equal(low.includes(word), false, `${JSON.stringify(s)} says ${word}`);
    }
  }
  // Every refusal code has a sentence a person can read.
  for (const [code, sentence] of Object.entries(m.CHECKIN_ERRORS)) {
    assert.ok(sentence.length > 10 && /[.?]$/.test(sentence), code);
  }
});

test("the small lines", () => {
  assert.equal(m.checkInToLine("Fall Formal"), "Check in to Fall Formal?");
  assert.equal(m.newCodeInLine(12.9), "New code in 12 s");
  assert.equal(m.newCodeInLine(-3), "New code in 0 s");
  assert.equal(m.spokenCode("4812"), "4 8 1 2");
});

// The card's order (final audit, Oct 19): "You'll appear in the event chat."
// is about an RSVP. Drawn right under "You're checked in" it told the student
// that checking in put them in the event chat, which it doesn't (contract
// D12). So the check-in slot comes after that line, read from the source.
test("EventCard draws the check-in slot after the event-chat line, not between it and the RSVP buttons", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../app/campus/campus-home.tsx", import.meta.url), "utf8");
  const chatLine = src.indexOf("{EVENT_CHAT_LINE}");
  const slot = src.indexOf("<CheckinSlot ev={ev} />");
  assert.ok(chatLine > 0 && slot > 0, "both are on the card");
  assert.ok(slot > chatLine, "the slot sits below the chat line");
  assert.equal(src.indexOf("<CheckinSlot ev={ev} />", slot + 1), -1, "one slot per card");
});
