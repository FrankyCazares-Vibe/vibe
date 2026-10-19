/**
 * Tests for `ics.ts`, the hand-written iCal reader behind the school
 * calendars on Campus (CONTRACT.md §3.5, §8): unfolding, escapes, entities,
 * every date form (UTC, all day, a zone, the Nov 1 2026 fall-back hour, an
 * unknown zone), nested blocks, first-copy-wins, quoted parameters, the size
 * and event caps, junk, and the two real feeds kept as fixtures.
 *
 * Run with:
 *   node --test src/lib/school-events/ics.test.ts
 *
 * WHY THE RESOLVE HOOK: the same as `rolling-strip-view.test.ts`. Node's type
 * stripping adds no file extensions; ics.ts imports nothing, but the hook
 * keeps every school-events test loading modules the same way.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("ics.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { ICS_MAX_CHARS, ICS_MAX_EVENTS, clipText, decodeEntities, parseIcs, unescapeText, zonedWallTimeToUtc } = await import("./ics");

/** A calendar around the given VEVENT bodies (each a list of lines), CRLF like the real feeds. */
function cal(...events: string[][]): string {
  const body = events.map((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n")).join("\r\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
}
const one = (...lines: string[]) => {
  const out = parseIcs(cal(lines));
  assert.equal(out.length, 1);
  return out[0];
};
const utc = (ms: number) => new Date(ms).toISOString();

test("unfolding: CRLF + space and LF + tab join the next line on", () => {
  const text = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261107T220000Z\r\nSUMMARY:Bob Lov\r\n ell Day\nLOCATION:James T.\n\t Morris Arena\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const [ev] = parseIcs(text);
  assert.equal(ev.summary, "Bob Lovell Day");
  assert.equal(ev.location, "James T. Morris Arena");
});

test("unescapeText: \\, \\; \\n \\N \\\\, and nothing else", () => {
  assert.equal(unescapeText("Indianapolis\\, Ind., Arena"), "Indianapolis, Ind., Arena");
  assert.equal(unescapeText("a\\;b\\nc\\Nd\\\\e"), "a;b\nc\nd\\e");
  assert.equal(unescapeText("keep \\: as is"), "keep \\: as is");
  // A cleaned line turns the newline into a space.
  assert.equal(one("DTSTART:20261107T220000Z", "SUMMARY:Line one\\nline two").summary, "Line one line two");
  // The description keeps its newlines: sources.ts reads its lines.
  assert.equal(one("DTSTART:20261107T220000Z", "DESCRIPTION:a\\nTV: ESPN+\\n").description, "a\nTV: ESPN+\n");
});

test("decodeEntities: the named five, nbsp and numbers; one pass; bad numbers dropped", () => {
  assert.equal(decodeEntities("Mac &amp; Cheese &lt;3 &quot;hi&quot; &apos;s"), `Mac & Cheese <3 "hi" 's`);
  assert.equal(decodeEntities("a&nbsp;b&#160;c&#xA0;d"), "a b c d");
  assert.equal(decodeEntities("&#233;t&#xE9;"), "été");
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeEntities("x&#0;y&#xD800;z&#x110000;"), "xyz");
  assert.equal(decodeEntities("&bogus; & alone"), "&bogus; & alone");
  // LiveWhale's rich-text titles: curly quotes, dashes and the ellipsis by name. Still one pass.
  assert.equal(
    decodeEntities("Women&rsquo;s Night &ndash; &ldquo;Free&rdquo; Food &mdash; &lsquo;Go&rsquo;&hellip;"),
    "Women\u2019s Night \u2013 \u201CFree\u201D Food \u2014 \u2018Go\u2019\u2026",
  );
  assert.equal(decodeEntities("&amp;rsquo;"), "&rsquo;");
  // `&#160\;` in a feed: unescaped first, then decoded, so it's a plain space.
  assert.equal(one("DTSTART:20261107T220000Z", "SUMMARY:Grad&#160\\;Fair").summary, "Grad Fair");
  // URLs: unescaped and decoded, never host-checked here.
  const ev = one("DTSTART:20261107T220000Z", "URL:https://iuindyjags.com/calendar.aspx?game_id=1&amp;sport_id=8");
  assert.equal(ev.url, "https://iuindyjags.com/calendar.aspx?game_id=1&sport_id=8");
  assert.equal(one("DTSTART:20261107T220000Z", "URL:javascript:alert(1)").url, "javascript:alert(1)");
});

test("cleaning: tags out, bidi and control characters out, spaces squeezed, lengths capped", () => {
  const ev = one(
    "DTSTART:20261107T220000Z",
    "SUMMARY:<b>Night</b><br>Market ‮gnp.exe‬ ​ok\u0007",
    `LOCATION:${"L".repeat(400)}`,
    `DESCRIPTION:${"d".repeat(5000)}`,
  );
  assert.equal(ev.summary, "Night Market gnp.exe ok");
  assert.equal(ev.location.length, 200);
  assert.ok(ev.location.endsWith("…"));
  assert.equal(ev.description.length, 4000);
  assert.equal(one("DTSTART:20261107T220000Z", `SUMMARY:${"s".repeat(301)}`).summary.length, 300);
  // Emoji built with the zero-width joiner survive.
  assert.equal(one("DTSTART:20261107T220000Z", "SUMMARY:Family 👨‍👩‍👧").summary, "Family 👨‍👩‍👧");
});

test("dates: Z is UTC; 8 digits or VALUE=DATE is all day at midnight in campus time", () => {
  const ev = one("DTSTART:20261107T220000Z", "DTEND:20261108T000000Z");
  assert.equal(utc(ev.start), "2026-11-07T22:00:00.000Z");
  assert.equal(utc(ev.end ?? 0), "2026-11-08T00:00:00.000Z");
  assert.equal(ev.allDay, false);
  const day = one("DTSTART;VALUE=DATE:20261119", "DTEND;VALUE=DATE:20261120");
  assert.equal(day.allDay, true);
  // Nov 19 is after the fall-back, so campus midnight is 05:00 UTC.
  assert.equal(utc(day.start), "2026-11-19T05:00:00.000Z");
  assert.equal(utc(day.end ?? 0), "2026-11-20T05:00:00.000Z");
  const bare = one("DTSTART:20261019");
  assert.equal(bare.allDay, true);
  assert.equal(utc(bare.start), "2026-10-19T04:00:00.000Z");
  // No end, or an unreadable one, is null.
  assert.equal(one("DTSTART:20261107T220000Z").end, null);
  assert.equal(one("DTSTART:20261107T220000Z", "DTEND:soon").end, null);
});

test("dates: TZID at the Nov 1 2026 fall-back hour takes the first 1:30 (05:30Z)", () => {
  const ev = one("DTSTART;TZID=America/New_York:20261101T013000");
  assert.equal(utc(ev.start), "2026-11-01T05:30:00.000Z");
  assert.equal(utc(zonedWallTimeToUtc(2026, 11, 1, 1, 30, 0, "America/New_York")), "2026-11-01T05:30:00.000Z");
  // The hour after the fall-back is unambiguous standard time.
  assert.equal(utc(zonedWallTimeToUtc(2026, 11, 1, 2, 30, 0, "America/New_York")), "2026-11-01T07:30:00.000Z");
  // The spring-forward gap (2:30 never happens on Mar 14 2027) uses the offset from before it.
  assert.equal(utc(zonedWallTimeToUtc(2027, 3, 14, 2, 30, 0, "America/New_York")), "2027-03-14T07:30:00.000Z");
  assert.ok(Number.isNaN(zonedWallTimeToUtc(2026, 11, 1, 1, 30, 0, "Mars/Olympus_Mons")));
});

test("dates: quoted TZID, unknown TZID, floating, and the defaultZone argument", () => {
  assert.equal(utc(one('DTSTART;TZID="America/Chicago":20261107T170000').start), "2026-11-07T23:00:00.000Z");
  // Unknown zone (a Windows name) → campus time.
  assert.equal(utc(one("DTSTART;TZID=Eastern Standard Time:20261107T170000").start), "2026-11-07T22:00:00.000Z");
  // Floating → campus time.
  assert.equal(utc(one("DTSTART:20261021T100000").start), "2026-10-21T14:00:00.000Z");
  const chicago = parseIcs(cal(["DTSTART:20261021T100000"]), "America/Chicago");
  assert.equal(utc(chicago[0].start), "2026-10-21T15:00:00.000Z");
  // A bad defaultZone falls back to campus time instead of failing.
  assert.equal(utc(parseIcs(cal(["DTSTART:20261021T100000"]), "Nowhere/Zone")[0].start), "2026-10-21T14:00:00.000Z");
});

test("a row without a valid start is skipped", () => {
  const out = parseIcs(
    cal(
      ["UID:none", "SUMMARY:No start"],
      ["UID:bad-month", "DTSTART:20261340T100000Z"],
      ["UID:bad-day", "DTSTART:20260231T100000Z"],
      ["UID:bad-hour", "DTSTART:20261021T250000Z"],
      ["UID:ok", "DTSTART:20261021T100000Z"],
    ),
  );
  assert.deepEqual(
    out.map((e) => e.uid),
    ["ok"],
  );
});

test("a VALARM inside a VEVENT is ignored; the first copy of a property wins", () => {
  const ev = one(
    "UID:x",
    "DTSTART:20261107T220000Z",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Reminder",
    "SUMMARY:Alarm title",
    "END:VALARM",
    "SUMMARY:First",
    "SUMMARY:Second",
    "DESCRIPTION:The event",
  );
  assert.equal(ev.summary, "First");
  assert.equal(ev.description, "The event");
});

test("a VALARM left unclosed, or a missing END:VEVENT, never swallows the events after it", () => {
  const lines = (...rows: string[]) => ["BEGIN:VCALENDAR", ...rows, "END:VCALENDAR"].join("\r\n");
  const ev = (uid: string) => ["BEGIN:VEVENT", `UID:${uid}`, "DTSTART:20261107T220000Z", "END:VEVENT"];
  // The reviewer's probe: event a opens a VALARM and never closes it.
  const unclosed = parseIcs(lines("BEGIN:VEVENT", "UID:a", "DTSTART:20261107T220000Z", "BEGIN:VALARM", "TRIGGER:-PT15M", "END:VEVENT", ...ev("b"), ...ev("c")));
  assert.deepEqual(unclosed.map((e) => e.uid), ["a", "b", "c"]);
  // Event a has no END:VEVENT: it ends where b begins, and keeps what it had.
  const noEnd = parseIcs(lines("BEGIN:VEVENT", "UID:a", "DTSTART:20261107T220000Z", "SUMMARY:First", ...ev("b"), ...ev("c")));
  assert.deepEqual(noEnd.map((e) => [e.uid, e.summary]), [["a", "First"], ["b", ""], ["c", ""]]);
  // An END for a block never opened doesn't end the event early.
  const stray = parseIcs(lines("BEGIN:VEVENT", "UID:a", "END:VALARM", "DTSTART:20261107T220000Z", "SUMMARY:Kept", "END:VEVENT"));
  assert.deepEqual(stray.map((e) => [e.uid, e.summary]), [["a", "Kept"]]);
  // A broken event before the cap still counts toward it.
  const many = lines(...Array.from({ length: ICS_MAX_EVENTS + 3 }, (_, i) => ["BEGIN:VEVENT", `UID:${i}`, "DTSTART:20261107T220000Z"]).flat());
  assert.equal(parseIcs(many).length, ICS_MAX_EVENTS);
});

test("clipText: an ellipsis at the cut, never half an emoji", () => {
  assert.equal(clipText("short", 10), "short");
  assert.equal(clipText("abcdefghij", 5), "abcd…");
  // The cut would land between the two halves of the emoji: the whole emoji goes.
  const cut = clipText("abc😀defgh", 5);
  assert.equal(cut, "abc…");
  assert.ok(![...cut].some((ch) => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff));
});

test("a quoted ':' or ';' in a parameter doesn't split the line", () => {
  const ev = one('DTSTART;X-NOTE="a:b;c":20261107T220000Z', 'LOCATION;ALTREP="https://x.example/a:b":Campus Center');
  assert.equal(utc(ev.start), "2026-11-07T22:00:00.000Z");
  assert.equal(ev.location, "Campus Center");
});

test("status is upper case; only the four LiveWhale X- properties are kept", () => {
  const ev = one(
    "DTSTART:20261107T220000Z",
    "STATUS:cancelled",
    "X-LIVEWHALE-ID:2427999",
    "X-LIVEWHALE-ID:999",
    "X-LIVEWHALE-TAGS:Conference|Travel Required",
    "X-LIVEWHALE-CANCELED:1",
    "X-LIVEWHALE-ALL-DAY:0",
    "X-LIVEWHALE-TIMEZONE:America/New_York",
    "X-OTHER:nope",
  );
  assert.equal(ev.status, "CANCELLED");
  assert.deepEqual(ev.x, {
    "X-LIVEWHALE-ID": "2427999",
    "X-LIVEWHALE-TAGS": "Conference|Travel Required",
    "X-LIVEWHALE-CANCELED": "1",
    "X-LIVEWHALE-ALL-DAY": "0",
  });
  assert.equal(one("DTSTART:20261107T220000Z").status, null);
});

test("size cap, event cap, junk", () => {
  const big = cal(["DTSTART:20261107T220000Z", `DESCRIPTION:${"x".repeat(ICS_MAX_CHARS)}`]);
  assert.deepEqual(parseIcs(big), []);
  const many = cal(...Array.from({ length: ICS_MAX_EVENTS + 5 }, (_, i) => [`UID:${i}`, "DTSTART:20261107T220000Z"]));
  const out = parseIcs(many);
  assert.equal(out.length, ICS_MAX_EVENTS);
  assert.equal(out[ICS_MAX_EVENTS - 1].uid, String(ICS_MAX_EVENTS - 1));
  assert.deepEqual(parseIcs("<!doctype html><html>Down for maintenance</html>"), []);
  assert.deepEqual(parseIcs(""), []);
  assert.deepEqual(parseIcs("BEGIN:VEVENT\nDTSTART"), []);
  assert.deepEqual(parseIcs(null as unknown as string), []);
});

test("fixtures: athletics has 221 events, Student Affairs 125", () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.ics`, import.meta.url), "utf8");
  const athletics = parseIcs(fixture("athletics"));
  const affairs = parseIcs(fixture("iu-student-affairs"));
  assert.equal(athletics.length, 221);
  assert.equal(affairs.length, 125);
  // The escaped first comma of a home venue comes out plain.
  assert.ok(athletics.some((e) => e.location === "Indianapolis, Ind., James T. Morris Arena"));
  // A folded tag line comes out whole.
  assert.ok(affairs.some((e) => (e.x["X-LIVEWHALE-TAGS"] ?? "").includes("Group Fitness Classes")));
});
