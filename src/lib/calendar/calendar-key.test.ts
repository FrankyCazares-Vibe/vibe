/**
 * The calendar's colour key and links (Oct 19, 2026, critique D13). Run with:
 *   node --test src/lib/calendar/calendar-key.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// Node's type stripping needs the extension and tsc refuses it in a static
// import, so the module is loaded through a variable (metrics-count.test.ts).
const specifier = "./calendar-key.ts";
const {
  barColor,
  CAL_KIND_WORD,
  calChipStyle,
  calKind,
  clubEventHref,
  createLinkedEventBoard,
  dayMarkKind,
  entryHref,
  eventChatHref,
  isUpcoming,
  LEGACY_PERSONAL_COLORS,
  linkedEventOutcome,
  PERSONAL_COLOR_PRESETS,
  PERSONAL_DEFAULT_COLOR,
  readEventParam,
  upcomingCount,
} = (await import(specifier)) as typeof import("./calendar-key");

const going = { kind: "rsvp" as const, viewer_status: "going" as const };
const maybe = { kind: "rsvp" as const, viewer_status: "maybe" as const };
const mine = { kind: "personal" as const, color: "#5A9CFF" };

test("each entry has one kind, and the middle word is Interested", () => {
  assert.equal(calKind(going), "going");
  assert.equal(calKind(maybe), "interested");
  assert.equal(calKind(mine), "yours");
  assert.deepEqual(CAL_KIND_WORD, { going: "Going", interested: "Interested", yours: "Yours" });
});

test("chip paint: Going solid coral with dark words, Interested a coral outline, Yours plain with a bar", () => {
  assert.deepEqual(calChipStyle("going"), { background: "var(--coral)", color: "var(--on-coral)", boxShadow: "inset 0 0 0 1px var(--coral)" });
  const interested = calChipStyle("interested");
  assert.equal(interested.boxShadow, "inset 0 0 0 1.5px var(--coral)");
  assert.equal(interested.color, "var(--charcoal)");
  assert.notEqual(interested.background, "var(--coral)", "an outline, not a fill");
  const yours = calChipStyle("yours", "#5A9CFF");
  assert.equal(yours.background, "linear-gradient(90deg, #5A9CFF 0 3px, transparent 3px), rgba(var(--scrim-rgb),0.07)", "a straight 3px bar on a plain chip");
  assert.equal(yours.color, "var(--ink-body)");
  assert.equal(yours.boxShadow, "none", "no coral ring");
  // Oct 19, 2026 repair: every colour a person can pick today, and every
  // colour an older entry was saved with, not only the default.
  for (const c of [...PERSONAL_COLOR_PRESETS, ...LEGACY_PERSONAL_COLORS, "#ff5c35", "#F53"]) {
    const paint = calChipStyle("yours", c);
    assert.doesNotMatch(String(paint.background), /coral|#ff5c35|#f53\b|255,\s*92,\s*53/i, `a personal chip never looks like an RSVP (${c})`);
    assert.equal(paint.boxShadow, "none", c);
  }
  assert.match(String(calChipStyle("yours", "javascript:alert(1)").background), /^linear-gradient\(90deg, var\(--ink-muted\) 0 3px/, "an odd colour falls back to grey");
});

test("no RSVP chip carries green, amber or a fixed hex", () => {
  for (const kind of ["going", "interested"] as const) {
    const s = JSON.stringify(calChipStyle(kind, "#5BD18C"));
    assert.doesNotMatch(s, /#5BD18C|#FFB85A|#fff\b/i, kind);
  }
});

test("coral is not a personal colour: not offered, and old coral entries turn blue", () => {
  assert.equal(PERSONAL_COLOR_PRESETS[0], PERSONAL_DEFAULT_COLOR, "the default is the first swatch");
  assert.equal(PERSONAL_DEFAULT_COLOR, "#5A9CFF");
  for (const c of PERSONAL_COLOR_PRESETS) {
    assert.doesNotMatch(c, /^#(ff5c35|5bd18c|ffb85a)$/i, `no RSVP colour, old or new, in the swatches (${c})`);
  }
  assert.equal(barColor("#FF5C35"), PERSONAL_DEFAULT_COLOR, "the old default");
  assert.equal(barColor("#ff5c35"), PERSONAL_DEFAULT_COLOR);
  assert.equal(barColor("#F53"), PERSONAL_DEFAULT_COLOR, "the short form");
});

test("a personal colour is used only when it is a plain hex", () => {
  assert.equal(barColor("#abc"), "#abc");
  assert.equal(barColor("#1C1C1E"), "var(--charcoal)", "the old near-black preset follows the ink, so Night shows it");
  assert.equal(barColor("#5A9CFF"), "#5A9CFF");
  assert.equal(barColor("red; background: url(x)"), "var(--ink-muted)");
  assert.equal(barColor(""), "var(--ink-muted)");
  assert.equal(barColor(null), "var(--ink-muted)");
});

test("the mini calendar's mark: Going wins, then Interested, then Yours", () => {
  assert.equal(dayMarkKind([]), null);
  assert.equal(dayMarkKind([mine]), "yours");
  assert.equal(dayMarkKind([mine, maybe]), "interested");
  assert.equal(dayMarkKind([maybe, mine, going]), "going");
});

test("the badge counts what is still ahead or under way", () => {
  const now = new Date("2026-10-19T18:00:00Z");
  const past = { starts_at: "2026-10-01T18:00:00Z", ends_at: "2026-10-01T20:00:00Z" };
  const live = { starts_at: "2026-10-19T17:00:00Z", ends_at: "2026-10-19T19:00:00Z" };
  const later = { starts_at: "2026-10-25T18:00:00Z", ends_at: null };
  const startedNoEnd = { starts_at: "2026-10-19T17:00:00Z", ends_at: null };
  assert.equal(isUpcoming(live, now), true);
  assert.equal(isUpcoming(startedNoEnd, now), false, "no end: it ends when it starts");
  assert.equal(upcomingCount([past, live, later, startedNoEnd], now), 2);
  assert.equal(isUpcoming({ starts_at: "not a date" }, now), false);
});

test("an event opens its club's page at that event; a personal entry opens nothing", () => {
  assert.equal(clubEventHref("salsa-club", "1b2c"), "/orgs/salsa-club?event=1b2c");
  assert.equal(clubEventHref("a b", "x&y"), "/orgs/a%20b?event=x%26y");
  assert.equal(eventChatHref("room 1"), "/messages?channel=room%201");
  assert.equal(entryHref({ kind: "rsvp", id: "e1", org: { handle: "salsa" } }), "/orgs/salsa?event=e1");
  assert.equal(entryHref({ kind: "rsvp", id: "e1", org: null }), null, "no club: nowhere to open");
  assert.equal(entryHref({ kind: "personal", id: "p1" }), null);
});

test("?event= takes an event id and nothing else", () => {
  const id = "cbde0202-311a-4dad-9af1-08c08f99d009";
  assert.equal(readEventParam(id), id);
  assert.equal(readEventParam(id.toUpperCase()), id);
  assert.equal(readEventParam(` ${id} `), id);
  assert.equal(readEventParam("1"), null);
  assert.equal(readEventParam("<script>"), null);
  assert.equal(readEventParam(null), null);
});

test("the club page's two lists decide together", () => {
  assert.equal(linkedEventOutcome(undefined, undefined), "wait");
  assert.equal(linkedEventOutcome("missing", undefined), "wait", "the past list may still have it");
  assert.equal(linkedEventOutcome(undefined, "found"), "found");
  assert.equal(linkedEventOutcome("found", "missing"), "found");
  assert.equal(linkedEventOutcome("missing", "missing"), "missing");
  assert.equal(linkedEventOutcome("unknown", "missing"), "quiet", "a list that couldn't load can't say it's gone");
});

// Oct 19, 2026 (critique B8 repair): the hook's own sequence, driven through
// the board it wraps. Reproduced in the browser: an officer opened the club
// page from a link, cancelled that event, and "That event isn't listed
// anymore." replaced "Event cancelled, but the notices didn't send".
test("the linked event: only the first settled answer may toast", () => {
  const E = "eeeeeeee-0000-4000-8000-000000000001";
  const open = () => {
    const b = createLinkedEventBoard();
    b.join(E, "upcoming");
    b.join(E, "past");
    return b;
  };

  // Found, then the card leaves the list (Cancel, Delete, a 404): quiet.
  let b = open();
  assert.equal(b.report(E, "upcoming", "found"), false);
  assert.equal(b.report(E, "past", "missing"), false);
  assert.equal(b.report(E, "upcoming", "missing"), false, "an officer's own Cancel never toasts over their result");

  // Found before the past list answered: settled already.
  b = open();
  assert.equal(b.report(E, "upcoming", "found"), false);
  assert.equal(b.report(E, "upcoming", "missing"), false);
  assert.equal(b.report(E, "past", "missing"), false);

  // Both missing on the first answers: one toast, then never again in this visit.
  b = open();
  assert.equal(b.report(E, "upcoming", "missing"), false, "the past list may still have it");
  assert.equal(b.report(E, "past", "missing"), true);
  assert.equal(b.report(E, "past", "missing"), false, "a re-render says nothing new");
  assert.equal(b.report(E, "upcoming", "missing"), false);

  // A list that couldn't load: quiet, and a later answer doesn't reopen it.
  b = open();
  assert.equal(b.report(E, "upcoming", "unknown"), false);
  assert.equal(b.report(E, "past", "missing"), false);
  assert.equal(b.report(E, "upcoming", "missing"), false);

  // Leaving the page (both lists) forgets it: the same link later speaks again.
  b.leave(E, "upcoming");
  b.leave(E, "past");
  b.join(E, "upcoming");
  b.join(E, "past");
  assert.equal(b.report(E, "upcoming", "missing"), false);
  assert.equal(b.report(E, "past", "missing"), true);

  // One list re-mounting (a refresh, a tab) while the other stays: still settled.
  b.leave(E, "upcoming");
  b.join(E, "upcoming");
  assert.equal(b.report(E, "upcoming", "missing"), false);

  // Another event on the same board has its own answer.
  const F = "eeeeeeee-0000-4000-8000-000000000002";
  b.join(F, "upcoming");
  b.join(F, "past");
  assert.equal(b.report(F, "past", "missing"), false);
  assert.equal(b.report(F, "upcoming", "missing"), true);
});
