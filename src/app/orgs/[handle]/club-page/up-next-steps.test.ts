/**
 * Tests for `up-next-steps.ts` (the officers' Up next with its steps; Oct
 * 23, 2026, wave 3 B1): which event the card picks, the five steps' states,
 * the badge, the facts line, the buttons, the thank-you's starter text and
 * the shared event's words. Times are campus times around Blitz Night, Thu
 * Oct 29 2026, 7 to 9 PM (EDT, UTC-4).
 *
 * Run with:
 *   node --test "src/app/orgs/[handle]/club-page/up-next-steps.test.ts"
 *
 * WHY THE RESOLVE HOOK: as in campus-time.test.ts, Node's type stripping
 * doesn't resolve the "@/…" alias or add file extensions, and the file reads
 * the check-in window and campus time through them.
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
if (typeof registerHooks !== "function") {
  throw new Error("up-next-steps.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../../../", import.meta.url);
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

const steps = await import("./up-next-steps");
const {
  THANKS_WINDOW_MS,
  clubEventPath,
  eventShareText,
  eventShareWhen,
  pickUpNext,
  stepStates,
  thankYouStarter,
  upNextBadge,
  upNextLine,
  upNextView,
  upNextWhenLine,
} = steps;
type StepEvent = import("./up-next-steps").StepEvent;

const at = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;

function ev(over: Partial<StepEvent> & { id: string }): StepEvent {
  return {
    title: "Blitz Night",
    starts_at: "2026-10-29T23:00:00Z",
    ends_at: "2026-10-30T01:00:00Z",
    location: "The Lantern Room",
    going_count: 14,
    interested_count: 6,
    checkin_open: false,
    checked_in_count: 0,
    ...over,
  };
}

const blitz = ev({ id: "blitz" });
// Tue Nov 3, 7 PM EST (clocks fell back on Nov 1).
const rapid = ev({ id: "rapid", title: "Rapid Night", starts_at: "2026-11-04T00:00:00Z", ends_at: "2026-11-04T02:00:00Z" });
const MONDAY_NOON = at("2026-10-26T16:00:00Z");
const THURSDAY_SIX = at("2026-10-29T22:00:00Z");
const THURSDAY_NINE_THIRTY = at("2026-10-30T01:30:00Z");
const FRIDAY_NOON = at("2026-10-30T16:00:00Z");

test("before the night: the soonest event, on Going", () => {
  const pick = pickUpNext({ upcoming: [blitz, rapid], past: [], nowMs: MONDAY_NOON, latestPostAt: null });
  assert.equal(pick?.event.id, "blitz");
  assert.equal(pick?.step, "going");
  assert.equal(pick?.nextUp?.id, "rapid");
});

test("an hour before the start the window opens: Check-in", () => {
  const pick = pickUpNext({ upcoming: [blitz, rapid], past: [], nowMs: THURSDAY_SIX, latestPostAt: null });
  assert.equal(pick?.step, "checkin");
  assert.equal(pick?.event.id, "blitz");
  // A minute earlier it is still Going.
  const early = pickUpNext({ upcoming: [blitz], past: [], nowMs: THURSDAY_SIX - 60_000, latestPostAt: null });
  assert.equal(early?.step, "going");
});

test("the window stays open an hour after the end, from the past read too", () => {
  const nowMs = at("2026-10-30T01:59:00Z");
  const pick = pickUpNext({ upcoming: [rapid], past: [blitz], nowMs, latestPostAt: null });
  assert.equal(pick?.step, "checkin");
  assert.equal(pick?.event.id, "blitz");
});

test("two open windows: the one check-in is running for wins, then the one still to end", () => {
  const nowMs = at("2026-10-30T00:30:00Z");
  const late = ev({ id: "late", starts_at: "2026-10-30T01:00:00Z", ends_at: "2026-10-30T03:00:00Z" });
  const running = { ...blitz, checkin_open: true };
  assert.equal(pickUpNext({ upcoming: [late, running], past: [], nowMs, latestPostAt: null })?.event.id, "blitz");
  const done = ev({ id: "done", starts_at: "2026-10-29T21:00:00Z", ends_at: "2026-10-29T23:45:00Z" });
  assert.equal(pickUpNext({ upcoming: [late], past: [done], nowMs, latestPostAt: null })?.event.id, "late");
});

test("after the window: Thank-you until a club post lands after the end", () => {
  const nowMs = at("2026-10-30T02:30:00Z");
  const pick = pickUpNext({ upcoming: [rapid], past: [blitz], nowMs, latestPostAt: "2026-10-28T12:00:00Z" });
  assert.equal(pick?.step, "thanks");
  assert.equal(pick?.event.id, "blitz");
  assert.equal(pick?.nextUp?.id, "rapid");
  // No club post at all: still owed.
  assert.equal(pickUpNext({ upcoming: [rapid], past: [blitz], nowMs, latestPostAt: null })?.step, "thanks");
  // Posted after the end: the card moves on to the next event.
  const after = pickUpNext({ upcoming: [rapid], past: [blitz], nowMs, latestPostAt: "2026-10-30T02:10:00Z" });
  assert.equal(after?.step, "going");
  assert.equal(after?.event.id, "rapid");
});

test("the thank-you is asked for 72 hours, and never when the page didn't say", () => {
  const end = at(blitz.ends_at);
  const within = pickUpNext({ upcoming: [], past: [blitz], nowMs: end + THANKS_WINDOW_MS, latestPostAt: null });
  assert.equal(within?.step, "thanks");
  assert.equal(pickUpNext({ upcoming: [], past: [blitz], nowMs: end + THANKS_WINDOW_MS + 1, latestPostAt: null }), null);
  assert.equal(pickUpNext({ upcoming: [], past: [blitz], nowMs: end + 3 * HOUR, latestPostAt: undefined }), null);
});

test("the newest ended event is the one thanked", () => {
  const older = ev({ id: "older", starts_at: "2026-10-28T23:00:00Z", ends_at: "2026-10-29T01:00:00Z" });
  const pick = pickUpNext({ upcoming: [], past: [blitz, older], nowMs: FRIDAY_NOON, latestPostAt: null });
  assert.equal(pick?.event.id, "blitz");
});

test("nothing to show: no events, nothing owed, or the clock not read yet", () => {
  assert.equal(pickUpNext({ upcoming: [], past: [], nowMs: MONDAY_NOON, latestPostAt: null }), null);
  assert.equal(pickUpNext({ upcoming: [blitz], past: [], nowMs: 0, latestPostAt: null }), null);
  const bad = ev({ id: "bad", starts_at: "soon" });
  assert.equal(pickUpNext({ upcoming: [bad], past: [], nowMs: MONDAY_NOON, latestPostAt: null }), null);
});

test("an event in both lists is the past read's copy", () => {
  const stale = { ...blitz, checked_in_count: 0 };
  const fresh = { ...blitz, checked_in_count: 18 };
  const pick = pickUpNext({ upcoming: [stale], past: [fresh], nowMs: FRIDAY_NOON, latestPostAt: null });
  assert.equal(pick?.event.checked_in_count, 18);
});

test("the five steps: ticks behind, the coral ring on the step, numbers ahead", () => {
  assert.deepEqual(stepStates("going", null), ["done", "current", "later", "later", "later"]);
  assert.deepEqual(stepStates("checkin", true), ["done", "done", "current", "later", "later"]);
  assert.deepEqual(stepStates("thanks", true), ["done", "done", "done", "done", "current"]);
  // Nobody checked in: Check-in and Who came were skipped.
  assert.deepEqual(stepStates("thanks", false), ["done", "done", "skipped", "skipped", "current"]);
  // The count couldn't be read: neither ticked nor dashed.
  assert.deepEqual(stepStates("thanks", null), ["done", "done", "later", "later", "current"]);
});

test("the badge counts campus days and says Tonight from 5 PM", () => {
  assert.equal(upNextBadge("going", blitz, MONDAY_NOON), "In 3 days");
  assert.equal(upNextBadge("going", blitz, at("2026-10-28T16:00:00Z")), "Tomorrow");
  assert.equal(upNextBadge("going", blitz, at("2026-10-29T13:00:00Z")), "Tonight");
  // Late Wednesday night in Indiana is still "Tomorrow", though it's Thursday in UTC.
  assert.equal(upNextBadge("going", blitz, at("2026-10-29T03:30:00Z")), "Tomorrow");
  const lunch = ev({ id: "lunch", starts_at: "2026-10-29T16:00:00Z", ends_at: "2026-10-29T17:00:00Z" });
  assert.equal(upNextBadge("going", lunch, at("2026-10-29T12:00:00Z")), "Today");
  assert.equal(upNextBadge("checkin", blitz, THURSDAY_SIX), "Check-in open");
  assert.equal(upNextBadge("thanks", blitz, THURSDAY_NINE_THIRTY), "Done");
});

test("edge times: the window's last minute, the night the clocks change, a week out", () => {
  // Check-in until exactly an hour after the end; a minute later it's Thank-you.
  const close = at(blitz.ends_at) + HOUR;
  assert.equal(pickUpNext({ upcoming: [], past: [blitz], nowMs: close, latestPostAt: null })?.step, "checkin");
  assert.equal(pickUpNext({ upcoming: [], past: [blitz], nowMs: close + 60_000, latestPostAt: null })?.step, "thanks");
  // Sun Nov 1, 1:30 AM EDT (the hour that repeats): from Saturday noon it's one campus day away.
  const repeat = ev({ id: "repeat", starts_at: "2026-11-01T05:30:00Z", ends_at: "2026-11-01T07:30:00Z" });
  assert.equal(upNextBadge("going", repeat, at("2026-10-31T16:00:00Z")), "Tomorrow");
  // Sat Nov 7, 7 PM EST, from Sun Nov 1 noon EST: six days across the change, so no date yet.
  const sat = ev({ id: "sat", starts_at: "2026-11-08T00:00:00Z", ends_at: "2026-11-08T02:00:00Z" });
  assert.equal(upNextBadge("going", sat, at("2026-11-01T17:00:00Z")), "In 6 days");
  assert.equal(upNextWhenLine(sat, at("2026-11-01T17:00:00Z")), "Sat · 7 PM · The Lantern Room");
  assert.equal(upNextWhenLine(sat, at("2026-10-31T17:00:00Z")), "Sat, Nov 7 · 7 PM · The Lantern Room");
});

test("the time and place line, the board's way", () => {
  assert.equal(upNextWhenLine(blitz, MONDAY_NOON), "Thu · 7 PM · The Lantern Room");
  const half = ev({ id: "half", starts_at: "2026-10-29T23:30:00Z", location: "  " });
  assert.equal(upNextWhenLine(half, MONDAY_NOON), "Thu · 7:30 PM");
  // More than six days away, the date comes along.
  assert.equal(upNextWhenLine(rapid, at("2026-10-20T16:00:00Z")), "Tue, Nov 3 · 7 PM · The Lantern Room");
});

test("the facts line on each step", () => {
  assert.equal(upNextLine("going", blitz, MONDAY_NOON), "14 going · 6 interested.");
  assert.equal(
    upNextLine("checkin", { ...blitz, checkin_open: true, checked_in_count: 9 }, THURSDAY_SIX),
    "Check-in is open. 9 here so far.",
  );
  assert.equal(upNextLine("checkin", blitz, THURSDAY_SIX), "Doors open soon? Start check-in.");
  assert.equal(upNextLine("checkin", blitz, at("2026-10-29T23:30:00Z")), "It's started. Start check-in at the door.");
  assert.equal(upNextLine("checkin", blitz, at("2026-10-30T01:30:00Z")), "It has ended. Check-in stays open for an hour after.");
  assert.equal(upNextLine("thanks", { ...blitz, checked_in_count: 18 }, FRIDAY_NOON), "18 came.");
  assert.equal(upNextLine("thanks", blitz, FRIDAY_NOON), "Check-in wasn't run.");
  assert.equal(upNextLine("thanks", { ...blitz, checked_in_count: null }, FRIDAY_NOON), "Couldn't load who came.");
});

test("one coral primary that is the next thing to do, at most one quiet secondary", () => {
  const view = (step: "going" | "checkin" | "thanks", e: StepEvent) =>
    upNextView({ event: e, step, nextUp: null }, THURSDAY_NINE_THIRTY);
  assert.deepEqual([view("going", blitz).primary, view("going", blitz).secondary], ["share", "edit"]);
  assert.equal(view("checkin", blitz).primary, "start_checkin");
  assert.equal(view("checkin", { ...blitz, checkin_open: true }).primary, "show_checkin");
  assert.equal(view("checkin", blitz).secondary, "who_came");
  assert.deepEqual(
    [view("thanks", { ...blitz, checked_in_count: 18 }).primary, view("thanks", { ...blitz, checked_in_count: 18 }).secondary],
    ["post_thanks", "see_who_came"],
  );
  assert.equal(view("thanks", blitz).secondary, null);
  const v = view("thanks", { ...blitz, checked_in_count: 18 });
  assert.deepEqual(
    v.steps.map((s) => `${s.n} ${s.label} ${s.state}`),
    ["1 Posted done", "2 Going done", "3 Check-in done", "4 Who came done", "5 Thank-you current"],
  );
});

test("the thank-you's starter text, with the next event when there is one", () => {
  assert.equal(thankYouStarter(blitz, null, THURSDAY_NINE_THIRTY), "Thank you to everyone who came to Blitz Night!");
  assert.equal(
    thankYouStarter(blitz, rapid, THURSDAY_NINE_THIRTY),
    "Thank you to everyone who came to Blitz Night! Next up: Rapid Night, Tuesday.",
  );
  assert.equal(
    thankYouStarter({ title: "Game Night!" }, { title: "Bowling.", starts_at: "2026-10-30T23:00:00Z" }, THURSDAY_NINE_THIRTY),
    "Thank you to everyone who came to Game Night! Next up: Bowling, tomorrow.",
  );
  const far = { title: "Formal", starts_at: "2026-11-13T00:00:00Z" };
  assert.equal(
    thankYouStarter(blitz, far, THURSDAY_NINE_THIRTY),
    "Thank you to everyone who came to Blitz Night! Next up: Formal, Thursday, Nov 12.",
  );
});

test("the thank-you never names a Members only event: it's a post visitors read", () => {
  const secret = ev({ id: "secret", title: "Pledge Retreat", visibility: "members", starts_at: "2026-10-31T23:00:00Z", ends_at: "2026-11-01T01:00:00Z" });
  // The next event to name skips it for the soonest public one.
  const pick = pickUpNext({ upcoming: [secret, rapid], past: [blitz], nowMs: FRIDAY_NOON, latestPostAt: null });
  assert.equal(pick?.step, "thanks");
  assert.equal(pick?.nextUp?.id, "rapid");
  assert.equal(pickUpNext({ upcoming: [secret], past: [blitz], nowMs: FRIDAY_NOON, latestPostAt: null })?.nextUp, null);
  assert.equal(thankYouStarter(blitz, secret, FRIDAY_NOON), "Thank you to everyone who came to Blitz Night!");
  // A Members only event thanked: no title.
  assert.equal(thankYouStarter({ ...blitz, visibility: "members" }, rapid, FRIDAY_NOON), "Thank you to everyone who came! Next up: Rapid Night, Tuesday.");
});

test("the shared event: the club's link to it and one line of words", () => {
  assert.equal(clubEventPath("sixty four", "e/1"), "/orgs/sixty%20four?event=e%2F1");
  assert.equal(eventShareWhen(blitz.starts_at), "Thu, Oct 29, 7 PM");
  assert.equal(eventShareWhen("nope"), "");
  assert.equal(
    eventShareText({ title: "Blitz Night", when: "Thu, Oct 29, 7 PM", place: "The Lantern Room" }),
    "Blitz Night · Thu, Oct 29, 7 PM · The Lantern Room",
  );
  assert.equal(eventShareText({ title: "Blitz Night", when: "", place: " " }), "Blitz Night");
});
