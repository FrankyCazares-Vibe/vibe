/**
 * The campus tour's bubbles (first run, Oct 24 2026; PLAN.md beats 9-12, 14):
 * the order, which "Your clubs" each window width points at, the dropped
 * steps, the escaping, and the start rule both devices share.
 *
 * Run with:
 *   node --test src/lib/tour/campus-tour-steps.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// The .ts path through a variable, so tsc (no .ts imports) and node (no
// extensionless ones) both take it; the cast keeps the types.
const spec = "./campus-tour-steps.ts";
const {
  CAMPUS_TOUR_TARGETS: T,
  SHOW_ME_CLUBS,
  campusTourSteps,
  endsOnClubs,
  escapeTourText,
  feedBubble,
  phoneCampusTourSteps,
  tourStartDecision,
} = (await import(spec)) as typeof import("./campus-tour-steps");

/** A page where exactly these targets have a size. */
const page = (...shown: string[]) => (selector: string) => shown.includes(selector);

test("1400px and up: Otto, the feed, Tonight, then the left column's Your clubs", () => {
  const steps = campusTourSteps("Indianapolis", page(T.otto, T.feed, T.tonight, T.clubsPanel, T.tabs));
  assert.deepEqual(
    steps.map((s) => s.selector),
    [T.otto, T.feed, T.tonight, T.clubsPanel],
  );
  assert.equal(steps[0]?.title, 'Hi again. I\'m <span class="accent">Otto</span>.');
  assert.equal(steps[0]?.body, "I live down here. Click me for what's new and your messages.");
  assert.equal(steps[1]?.title, 'This is Indianapolis, <span class="accent">live</span>.');
  assert.equal(steps[2]?.body, "School and club events at Indianapolis, tonight and this week.");
  assert.equal(steps[3]?.title, 'Your <span class="accent">clubs</span>.');
  assert.equal(steps[3]?.endLabel, SHOW_ME_CLUBS);
  assert.equal(endsOnClubs(steps), true);
  // Only the last bubble carries an end label.
  assert.deepEqual(steps.slice(0, -1).map((s) => s.endLabel), [undefined, undefined, undefined]);
});

test("1100-1399px with clubs: the folded strip above Tonight", () => {
  const steps = campusTourSteps("Bloomington", page(T.otto, T.feed, T.tonight, T.clubsFold, T.tabs));
  assert.deepEqual(steps.map((s) => s.selector), [T.otto, T.feed, T.tonight, T.clubsFold]);
  assert.equal(steps[3]?.body, "Every club you follow or join posts its newest Board update here.");
});

test("1100-1399px with no clubs yet: the tabs, and Orgs has every club", () => {
  const steps = campusTourSteps("Indianapolis", page(T.otto, T.feed, T.tonight, T.tabs));
  assert.deepEqual(steps.map((s) => s.selector), [T.otto, T.feed, T.tonight, T.tabs]);
  assert.equal(steps[3]?.title, 'Find your <span class="accent">clubs</span>.');
  assert.equal(steps[3]?.body, "Orgs has every club at Indianapolis. Follow one and its updates come to you.");
  assert.equal(endsOnClubs(steps), true);
});

test("900-1099px: no side columns, so no Tonight step; it still ends on clubs", () => {
  const steps = campusTourSteps(null, page(T.otto, T.feed, T.tabs));
  assert.deepEqual(steps.map((s) => s.selector), [T.otto, T.feed, T.tabs]);
  assert.equal(steps[1]?.title, 'This is your campus, <span class="accent">live</span>.');
  assert.equal(steps[2]?.body, "Orgs has every club on your campus. Follow one and its updates come to you.");
});

test("a step with nothing to point at is dropped, never floated mid-screen", () => {
  // Tonight drew nothing (both reads failed) and the orb isn't up.
  const steps = campusTourSteps("Indianapolis", page(T.feed, T.clubsPanel));
  assert.deepEqual(steps.map((s) => s.selector), [T.feed, T.clubsPanel]);
  // Nothing on the page at all: no tour, and nothing to open.
  assert.deepEqual(campusTourSteps("Indianapolis", page()), []);
  assert.equal(endsOnClubs([]), false);
});

test("the left column wins over the strip when both measure (only one ever shows)", () => {
  const steps = campusTourSteps("Indianapolis", page(T.otto, T.feed, T.tonight, T.clubsPanel, T.clubsFold, T.tabs));
  assert.equal(steps[3]?.selector, T.clubsPanel);
});

test("the feed bubble points at the feed's first screen, not the whole column", () => {
  assert.equal(T.feed, "#campus-feed-top");
  assert.notEqual(T.tonight, ".tonight-feed-right");
});

test("no ask in the tour: no photo, no post, no agent promise", () => {
  const all = [
    ...campusTourSteps("Indianapolis", page(...Object.values(T))),
    ...phoneCampusTourSteps("Indianapolis"),
  ];
  for (const s of all) {
    assert.doesNotMatch(`${s.title} ${s.body}`, /photo|picture|banner|Tap \+|post text|threads|matches|Chat/i, s.selector);
  }
});

test("the campus name is escaped before it reaches the bubble's HTML", () => {
  assert.equal(escapeTourText(`<b>"A&B's"</b>`), "&lt;b&gt;&quot;A&amp;B&#39;s&quot;&lt;/b&gt;");
  const steps = campusTourSteps("<img src=x onerror=alert(1)>", page(T.feed, T.tonight, T.tabs));
  for (const s of steps) assert.doesNotMatch(`${s.title} ${s.body}`, /<img/);
  assert.equal(feedBubble("  ").title, 'This is your campus, <span class="accent">live</span>.');
});

test("phone: the Otto tab, the feed, then the tabs, ending on Got it", () => {
  const steps = phoneCampusTourSteps("Indianapolis");
  assert.deepEqual(steps.map((s) => s.selector), [
    "#otto-mobile-tour-network-otto",
    "#otto-mobile-tour-feed",
    "#otto-mobile-tour-tabs",
  ]);
  assert.equal(steps[0]?.body, "This tab is me: what's coming up and what's new for you. Messages is right next door.");
  assert.deepEqual({ title: steps[1]?.title, body: steps[1]?.body }, feedBubble("Indianapolis"));
  assert.equal(steps[2]?.title, 'Clubs and events, <span class="accent">one swipe over</span>.');
  assert.equal(steps[2]?.body, "Feed, Events, Orgs and Map. Orgs has every club on campus.");
  assert.equal(steps[2]?.endLabel, "Got it");
});

test("start rule: the pending flag starts it even when this browser saw it (the shared laptop)", () => {
  const base = { leg: "campus" as const, pending: null, seen: false, welcome: false };
  assert.equal(tourStartDecision({ ...base, pending: "campus", seen: true }), "start");
  assert.equal(tourStartDecision({ ...base, pending: "campus", seen: true, welcome: true }), "start");
  assert.equal(tourStartDecision({ ...base, welcome: true }), "start");
  assert.equal(tourStartDecision({ ...base, welcome: true, seen: true }), "strip");
  assert.equal(tourStartDecision(base), "none");
  assert.equal(tourStartDecision({ ...base, seen: true }), "none");
});
