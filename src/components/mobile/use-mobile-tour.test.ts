/**
 * Tests for the pure parts of `use-mobile-tour.ts` (wave plan B14t): the
 * start rule and the campus leg's copy. Stand-ins for the deferred live
 * checks (`/campus?welcome=1` bubbles, the fallback body on a failed
 * onboarding-state read).
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/mobile/use-mobile-tour.test.ts
 *
 * The module is a client hook: it imports "react" (resolved from
 * node_modules, nothing renders) and "@/lib/iu/campuses". WHY THE RESOLVE
 * HOOK: same as `src/lib/onboarding/finish.test.ts`.
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
  throw new Error("use-mobile-tour.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
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

const { campusTourSteps, tourStartDecision } = await import("./use-mobile-tour");

const base = { leg: "campus" as const, pending: null, seen: false, welcome: false };

test("start: the pending flag names this leg", () => {
  assert.equal(tourStartDecision({ ...base, pending: "campus" }), "start");
  assert.equal(tourStartDecision({ ...base, pending: "campus", seen: true }), "start");
  assert.equal(tourStartDecision({ ...base, leg: "profile", pending: "profile" }), "start");
  assert.equal(tourStartDecision({ ...base, leg: "network", pending: "network" }), "start");
});

test("start: campus leg on ?welcome=1, not seen (storage failure reads as not seen)", () => {
  assert.equal(tourStartDecision({ ...base, welcome: true }), "start");
  assert.equal(tourStartDecision({ ...base, welcome: true, pending: "profile" }), "start");
});

test("strip: campus leg on ?welcome=1, already seen, no pending flag for it", () => {
  assert.equal(tourStartDecision({ ...base, welcome: true, seen: true }), "strip");
  assert.equal(tourStartDecision({ ...base, welcome: true, seen: true, pending: "network" }), "strip");
});

test("none: no flag and no welcome, or welcome on another leg", () => {
  assert.equal(tourStartDecision(base), "none");
  assert.equal(tourStartDecision({ ...base, pending: "network" }), "none");
  assert.equal(tourStartDecision({ ...base, leg: "profile", welcome: true }), "none");
  assert.equal(tourStartDecision({ ...base, leg: "network", welcome: true }), "none");
});

// First run, Oct 24 2026 (PLAN.md beat 14): the Otto tab, the feed, then the
// tabs. No dead Chat tab, no post ask. The words are pinned in full by
// src/lib/tour/campus-tour-steps.test.ts.
test("campus bubbles: the Otto tab, the feed with the campus name, then the tabs", () => {
  const steps = campusTourSteps("Indianapolis");
  assert.deepEqual(steps, [
    {
      selector: "#otto-mobile-tour-network-otto",
      title: 'Hi again. I\'m <span class="accent">Otto</span>.',
      body: "That's me down here, the otto tab: what's coming up and what's new for you. Messages is right next door.",
    },
    {
      selector: "#otto-mobile-tour-feed",
      title: 'This is Indianapolis, <span class="accent">live</span>.',
      body: "What students and clubs here are posting. Clubs and people you follow come first.",
    },
    {
      selector: "#otto-mobile-tour-tabs",
      title: 'Clubs and events, <span class="accent">one swipe over</span>.',
      body: "Feed, Events, Orgs and Map. Orgs has every club on campus.",
      endLabel: "Got it",
    },
  ]);
  for (const s of steps) assert.doesNotMatch(`${s.title} ${s.body}`, /Chat|Tap \+|post text/);
});

test("campus bubbles: fallback when the name didn't load", () => {
  assert.equal(campusTourSteps(null)[1]?.title, 'This is your campus, <span class="accent">live</span>.');
});

test("the campus leg ends the tour: no handoff to /network, old copy gone", () => {
  const src = readFileSync(new URL("components/mobile/use-mobile-tour.ts", SRC_ROOT), "utf8");
  assert.match(src, /campus: \{ next: null, dest: null \}/);
  assert.doesNotMatch(src, /Next: network/);
  assert.doesNotMatch(src, /Posts from people you follow, ranked/);
  assert.match(src, /fetch\("\/api\/me\/onboarding-state"/);
});
