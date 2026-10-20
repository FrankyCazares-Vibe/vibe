/**
 * Tests for `door-screen.ts` (Oct 19, 2026, critique batch B10): the door's
 * one way out per screen, which screen shows, the day-aware "opens" line in
 * campus time, and the after-the-end count. Plus a few checks on
 * DoorView.tsx's source, so the second Done can't quietly come back.
 *
 * Run with:
 *   node --test src/components/events/checkin/door-screen.test.ts
 *
 * WHY THE RESOLVE HOOK: as in `campus-time.test.ts`, Node's type stripping
 * doesn't resolve the "@/…" alias or add file extensions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("door-screen.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  DOOR_MARK_WHO_CAME,
  DOOR_NOBODY_CAME,
  DOOR_START_LEAD,
  checkinOpensWhen,
  doorAfterLine,
  doorExits,
  doorOpensLine,
  doorScreen,
  doorWhoCameLabel,
} = await import("./door-screen");
type Screen = ReturnType<typeof doorScreen>;

const ALL: Screen[] = ["loadFailed", "notOfficer", "loading", "failed", "before", "start", "open", "after"];
const at = (iso: string) => Date.parse(iso);

test("doorExits: every screen has exactly one way back to the event's card", () => {
  for (const screen of ALL) {
    for (const hasClub of [true, false]) {
      const e = doorExits(screen, hasClub);
      const toEvent = (e.headerDone ? 1 : 0) + (e.bodyLink === "event" ? 1 : 0);
      assert.equal(toEvent, 1, `${screen} (club: ${hasClub}) has ${toEvent} ways to the event`);
    }
  }
});

test("doorExits: officers keep Done in the header on every screen, before and after Start", () => {
  for (const screen of ALL.filter((s) => s !== "notOfficer")) {
    assert.equal(doorExits(screen, true).headerDone, true, screen);
  }
  // Start -> open must not move the way out.
  assert.deepEqual(doorExits("start", true), doorExits("open", true));
});

test("doorExits: a non-officer gets 'Go to the event' and no Done", () => {
  assert.deepEqual(doorExits("notOfficer", true), { headerDone: false, bodyLink: "event" });
  assert.deepEqual(doorExits("notOfficer", false), { headerDone: false, bodyLink: "event" });
});

test("doorExits: 'See who came' only after the end, and only with a club page to go to", () => {
  assert.equal(doorExits("after", true).bodyLink, "whoCame");
  assert.equal(doorExits("after", false).bodyLink, null);
  for (const screen of ALL.filter((s) => s !== "after")) {
    assert.notEqual(doorExits(screen, true).bodyLink, "whoCame", screen);
  }
});

test("doorScreen: the order DoorView checks", () => {
  const base = { loadFailed: false, canManage: true, hasFeed: true, failed: false, phase: "window" as const, open: true };
  assert.equal(doorScreen({ ...base, loadFailed: true }), "loadFailed");
  assert.equal(doorScreen({ ...base, canManage: false }), "notOfficer");
  assert.equal(doorScreen({ ...base, hasFeed: false }), "loading");
  assert.equal(doorScreen({ ...base, hasFeed: false, failed: true }), "failed");
  assert.equal(doorScreen({ ...base, phase: "before", open: false }), "before");
  assert.equal(doorScreen({ ...base, phase: "after" }), "after");
  assert.equal(doorScreen(base), "open");
  assert.equal(doorScreen({ ...base, open: false }), "start");
  // Feed in hand but no clock yet: the Start screen, as before B10.
  assert.equal(doorScreen({ ...base, phase: null, open: false }), "start");
  // A failed read with codes still on screen stays open ("Reconnecting…").
  assert.equal(doorScreen({ ...base, failed: true }), "open");
});

test("doorScreen: the feed's org_role_required is the not-officer screen, with its one way out", () => {
  // The page let the door try (its own check errored, or the role went
  // mid-event); the feed refused, so no feed is left on screen.
  const refused = { loadFailed: false, canManage: true, hasFeed: false, failed: true, failCode: "org_role_required", phase: null, open: false };
  assert.equal(doorScreen(refused), "notOfficer");
  assert.deepEqual(doorExits(doorScreen(refused), true), { headerDone: false, bodyLink: "event" });
  assert.deepEqual(doorExits(doorScreen(refused), false), { headerDone: false, bodyLink: "event" });
  // Any other refusal keeps "Couldn't load check-in." with Try again.
  assert.equal(doorScreen({ ...refused, failCode: "org_hidden" }), "failed");
  assert.equal(doorScreen({ ...refused, failCode: null }), "failed");
  // Codes still on screen (a 429 or a 500 keeps the feed): the door stays open.
  assert.equal(doorScreen({ ...refused, hasFeed: true, phase: "window", open: true }), "open");
});

test("doorOpensLine: today, tomorrow or the day, in campus time", () => {
  // Mon Oct 19 2026, 3 PM on campus (EDT, UTC-4).
  const now = at("2026-10-19T19:00:00Z");
  assert.equal(doorOpensLine(at("2026-10-19T22:00:00Z"), now), "Check-in opens at 6:00 PM.");
  // 9:30 PM on campus is still Oct 19 there, though Oct 20 in UTC.
  assert.equal(doorOpensLine(at("2026-10-20T01:30:00Z"), now), "Check-in opens at 9:30 PM.");
  assert.equal(doorOpensLine(at("2026-10-20T22:00:00Z"), now), "Check-in opens tomorrow at 6:00 PM.");
  assert.equal(doorOpensLine(at("2026-10-22T22:00:00Z"), now), "Check-in opens Thu, Oct 22 at 6:00 PM.");
});

test("doorOpensLine: 'tomorrow' across the clock change (Nov 1 2026 is 25 hours on campus)", () => {
  const now = at("2026-10-31T23:00:00Z"); // Sat Oct 31, 7 PM EDT
  assert.equal(doorOpensLine(at("2026-11-01T23:00:00Z"), now), "Check-in opens tomorrow at 6:00 PM.");
});

test("doorOpensLine: no line for a time that doesn't parse", () => {
  assert.equal(doorOpensLine(Number.NaN, Date.now()), null);
  assert.equal(doorOpensLine(Date.now(), Number.NaN), null);
});

test("checkinOpensWhen: the phrase the student's page can share", () => {
  const now = at("2026-10-19T19:00:00Z");
  assert.equal(checkinOpensWhen(at("2026-10-19T22:00:00Z"), now), "at 6:00 PM");
  assert.equal(checkinOpensWhen(at("2026-10-20T22:00:00Z"), now), "tomorrow at 6:00 PM");
  assert.equal(checkinOpensWhen(at("2026-10-22T22:00:00Z"), now), "Thu, Oct 22 at 6:00 PM");
  assert.equal(checkinOpensWhen(Number.NaN, now), null);
});

test("doorAfterLine: no 'yet' once check-in has ended", () => {
  assert.equal(doorAfterLine(0), DOOR_NOBODY_CAME);
  // No full stop, like "7 were there": the same big count line.
  assert.equal(DOOR_NOBODY_CAME, "Nobody checked in");
  assert.equal(doorAfterLine(1), "1 was there");
  assert.equal(doorAfterLine(7), "7 were there");
  // Officers see the exact number below 5 too (the door is officers only).
  assert.equal(doorAfterLine(3), "3 were there");
  assert.doesNotMatch(doorAfterLine(0), /yet/);
});

test("doorWhoCameLabel: never 'See who came' under 'Nobody checked in'", () => {
  assert.equal(doorWhoCameLabel(0), DOOR_MARK_WHO_CAME);
  assert.equal(DOOR_MARK_WHO_CAME, "Mark who came");
  assert.equal(doorWhoCameLabel(1), "See who came");
  assert.equal(doorWhoCameLabel(7), "See who came");
});

test("DOOR_START_LEAD: names the QR and the 4 numbers, and no word that depends on the layout", () => {
  assert.match(DOOR_START_LEAD, /QR\u00a0code/);
  assert.match(DOOR_START_LEAD, /the 4\u00a0numbers next to it/);
  assert.doesNotMatch(DOOR_START_LEAD, /\b(under|below|above|beside)\b/);
});

test("the door's own lines use no word the product never says", () => {
  for (const line of [DOOR_START_LEAD, DOOR_NOBODY_CAME, DOOR_MARK_WHO_CAME]) {
    const low = line.toLowerCase();
    for (const word of ["safety", "location", "where you are"]) {
      assert.equal(low.includes(word), false, `${JSON.stringify(line)} says ${word}`);
    }
  }
});

// ── DoorView.tsx source checks ──────────────────────────────────────────────

const VIEW = readFileSync(new URL("./DoorView.tsx", import.meta.url), "utf8");
const count = (needle: string) => VIEW.split(needle).length - 1;

test("DoorView: one Done, drawn only where doorExits says", () => {
  assert.equal(count("CHECKIN_COPY.done"), 1, "Done is written once");
  assert.match(VIEW, /exits\.headerDone \? \(\s*<Link ref=\{doneRef\}/);
  assert.equal(count("doneHref"), 0, "OpenDoor no longer draws its own Done");
  assert.equal(count("CHECKIN_COPY.goToEvent"), 1, "one 'Go to the event'");
  assert.match(VIEW, /doorExits\(screen, event\.org !== null\)/);
});

test("DoorView: no emoji, and no colour typed in except the QR tile's white", () => {
  assert.doesNotMatch(VIEW, /\p{Extended_Pictographic}/u);
  const hexes = VIEW.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hexes, ["#fff"], "only the QR tile's fixed white");
  assert.match(VIEW, /\.vibe-door-qr \{[^}]*background: #fff;/);
});

test("DoorView: motion comes from the shared springs", () => {
  assert.match(VIEW, /from "@\/lib\/motion\/springs"/);
  assert.doesNotMatch(VIEW, /transition=\{\{\s*duration/);
});

test("DoorView: no bare white tile and no stray 'Reconnecting…' when the codes run out", () => {
  // With no step, the tile keeps its size as the themed placeholder.
  assert.match(VIEW, /className="vibe-door-qr is-empty"/);
  assert.match(VIEW, /\.vibe-door-qr\.is-empty \{[^}]*background: rgba\(var\(--scrim-rgb\), 0\.05\)/);
  // The scan line shows only with a code to scan.
  assert.match(VIEW, /\{step \? \(\s*<p[^>]*>\{CHECKIN_COPY\.doorLead\}/);
  // The page-level line skips the open door, which says it beside its code.
  assert.match(VIEW, /door\.failed && screen !== "open"/);
  assert.match(VIEW, /step && door\.failed \?/);
  assert.equal(count("CHECKIN_COPY.doorStartLead"), 0, "the Start lead is the door's own");
});

test("DoorView: the portrait QR takes the height that's left, not a flat 46dvh", () => {
  assert.match(VIEW, /\.vibe-door\.is-open \{ height: 100dvh; \}/);
  assert.match(VIEW, /\.vibe-door-qr-box \{[^}]*container-type: size;/);
  assert.match(VIEW, /\.vibe-door-qr \{ --vibe-door-qr: min\(100cqw, 100cqh\); \}/);
});
