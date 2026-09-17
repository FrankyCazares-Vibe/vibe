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

const { campusFeedBody, campusTourSteps, tourStartDecision } = await import("./use-mobile-tour");

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

test("campus bubbles: three, with the campus name in the feed bubble", () => {
  const steps = campusTourSteps("Indianapolis");
  assert.deepEqual(steps, [
    {
      selector: "#otto-mobile-tour-tabs",
      title: "Everything's one swipe away.",
      body: "Feed, Events, Orgs, Chat, and the Map. Swipe or tap to switch.",
    },
    {
      selector: "#otto-mobile-tour-feed",
      title: "The campus feed.",
      body: "What students at Indianapolis are posting. People and clubs you follow rise to the top.",
    },
    {
      selector: "#otto-mobile-tour-compose",
      title: "Your turn.",
      body: "Tap + to post text, photos, or video.",
      endLabel: "Got it",
    },
  ]);
});

test("campus bubbles: fallback body when the name didn't load", () => {
  assert.equal(
    campusFeedBody(null),
    "What students on your campus are posting. People and clubs you follow rise to the top.",
  );
  assert.equal(campusTourSteps(null)[1]?.body, campusFeedBody(null));
});

test("the campus leg ends the tour: no handoff to /network, old copy gone", () => {
  const src = readFileSync(new URL("components/mobile/use-mobile-tour.ts", SRC_ROOT), "utf8");
  assert.match(src, /campus: \{ next: null, dest: null \}/);
  assert.doesNotMatch(src, /Next: network/);
  assert.doesNotMatch(src, /Posts from people you follow, ranked/);
  assert.match(src, /fetch\("\/api\/me\/onboarding-state"/);
});
