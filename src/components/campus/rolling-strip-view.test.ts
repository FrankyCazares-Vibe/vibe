/**
 * Tests for `rolling-strip-view.ts`, the pure logic behind `RollingStrip`
 * (S67 wave 1, contracts C1): chip order and the 14-day window, the hidden
 * rule the parent shares, the desktop roll decision, the tag toggle, the
 * lead-in word and the chip copy.
 *
 * Run with:
 *   node --test src/components/campus/rolling-strip-view.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `campus-confirm-banner-view.test.ts` — Node's
 * type stripping doesn't resolve the "@/…" alias or add file extensions. The
 * module under test only `import type`s from strip-data.ts, so React is never
 * loaded here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("rolling-strip-view.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  ROLL_SLACK_PX,
  eventChipLabel,
  eventChipTitle,
  formatUpcomingChip,
  leadIn,
  nextTagFilter,
  orderChips,
  rollDurationSec,
  shouldRoll,
  stripEntries,
  stripIsEmpty,
  tagChipTitle,
} = await import("./rolling-strip-view");

/** A fixed "now": a Wednesday at noon, so weekday and month words are stable. */
const NOW = new Date(2026, 8, 30, 12, 0, 0); // 2026-09-30
const DAY = 24 * 60 * 60 * 1000;
const at = (daysFromNow: number, hour = 18) => {
  const d = new Date(NOW.getTime() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const ev = (id: string, daysFromNow: number, status: "going" | "maybe" = "going") => ({
  id,
  title: `Event ${id}`,
  starts_at: at(daysFromNow),
  ends_at: null,
  location: null,
  org: null,
  viewer_status: status,
});

test("formatUpcomingChip: today, tomorrow, weekday inside a week, month/day beyond", () => {
  assert.equal(formatUpcomingChip(at(0, 23), NOW), "Today");
  assert.equal(formatUpcomingChip(at(1, 1), NOW), "Tmrw");
  const fri = new Date(NOW.getTime() + 2 * DAY);
  assert.equal(formatUpcomingChip(at(2), NOW), fri.toLocaleDateString([], { weekday: "short" }));
  const later = new Date(NOW.getTime() + 20 * DAY);
  assert.equal(
    formatUpcomingChip(at(20), NOW),
    later.toLocaleDateString([], { month: "short", day: "numeric" }),
  );
  assert.equal(formatUpcomingChip("not a date", NOW), "");
});

test("orderChips: soonest three events inside 14 days, then up to eight tags", () => {
  const upcoming = [ev("d", 10), ev("a", 0), ev("far", 15), ev("c", 5, "maybe"), ev("b", 1)];
  const trending = Array.from({ length: 10 }, (_, i) => ({ tag: `t${i}`, count: 10 - i }));
  const chips = orderChips(upcoming, trending, NOW);
  assert.deepEqual(
    chips.filter((c) => c.kind === "event").map((c) => (c.kind === "event" ? c.id : "")),
    ["a", "b", "c"],
  );
  assert.equal(chips.filter((c) => c.kind === "tag").length, 8);
  assert.equal(chips[0].kind, "event");
  assert.equal(chips[3].kind, "tag");
  const first = chips[0];
  if (first.kind === "event") {
    assert.equal(first.when, "Today");
    assert.equal(first.status, "going");
  }
  const third = chips[2];
  if (third.kind === "event") assert.equal(third.status, "maybe");
});

test("orderChips: null sources, junk dates and empty tags are tolerated", () => {
  assert.deepEqual(orderChips(null, null, NOW), []);
  const chips = orderChips(
    [{ ...ev("x", 1), starts_at: "garbage" }],
    [{ tag: "", count: 3 }, { tag: "ok", count: 1 }],
    NOW,
  );
  assert.deepEqual(chips, [{ kind: "tag", tag: "ok", count: 1 }]);
});

test("stripEntries: a failed source adds one Retry chip after its section, never silently", () => {
  const entries = stripEntries(
    {
      upcoming: null,
      trending: [{ tag: "rush", count: 4 }],
      upcomingErr: { message: "Couldn't load your upcoming events." },
      trendingErr: null,
    },
    NOW,
  );
  assert.deepEqual(entries.map((e) => e.kind), ["failed", "tag"]);
  assert.equal(entries[0].kind === "failed" ? entries[0].source : "", "upcoming");
  const both = stripEntries(
    { upcoming: [ev("a", 0)], trending: null, upcomingErr: null, trendingErr: { message: "x" } },
    NOW,
  );
  assert.deepEqual(both.map((e) => e.kind), ["event", "failed"]);
});

test("stripIsEmpty: hidden while both load or both answer empty; any chip or error shows it", () => {
  assert.equal(stripIsEmpty({ upcoming: null, trending: null, upcomingErr: null, trendingErr: null }), true);
  assert.equal(stripIsEmpty({ upcoming: [], trending: [], upcomingErr: null, trendingErr: null }), true);
  assert.equal(stripIsEmpty({ upcoming: [], trending: null, upcomingErr: null, trendingErr: null }), true);
  assert.equal(
    stripIsEmpty({ upcoming: null, trending: [{ tag: "a", count: 1 }], upcomingErr: null, trendingErr: null }),
    false,
  );
  assert.equal(
    stripIsEmpty({ upcoming: null, trending: null, upcomingErr: { message: "no" }, trendingErr: null }),
    false,
  );
  assert.equal(
    stripIsEmpty({ upcoming: [], trending: [], upcomingErr: null, trendingErr: { message: "no" } }),
    false,
  );
});

test("shouldRoll: only when the copy overflows by more than the slack, never under reduced motion", () => {
  assert.equal(shouldRoll(700, 700, false), false);
  assert.equal(shouldRoll(700 + ROLL_SLACK_PX, 700, false), false);
  assert.equal(shouldRoll(700 + ROLL_SLACK_PX + 1, 700, false), true);
  assert.equal(shouldRoll(2000, 700, true), false);
  assert.equal(shouldRoll(0, 700, false), false);
  assert.equal(shouldRoll(900, 0, false), false);
});

test("rollDurationSec: 20s floor, then a slow constant speed", () => {
  assert.equal(rollDurationSec(300), 20);
  assert.equal(rollDurationSec(600), 20);
  assert.equal(rollDurationSec(900), 30);
});

test("nextTagFilter: tapping the active tag clears, another switches", () => {
  assert.equal(nextTagFilter(null, "rush"), "rush");
  assert.equal(nextTagFilter(undefined, "rush"), "rush");
  assert.equal(nextTagFilter("rush", "rush"), null);
  assert.equal(nextTagFilter("rush", "sae"), "sae");
});

test("leadIn: today at home, there while visiting", () => {
  assert.equal(leadIn(false), "today.");
  assert.equal(leadIn(undefined), "today.");
  assert.equal(leadIn(true), "there.");
});

test("chip copy: tooltips and the aria-label", () => {
  assert.equal(eventChipTitle("going"), "You're going");
  assert.equal(eventChipTitle("maybe"), "You're interested");
  assert.equal(eventChipLabel("Rush night", "Tmrw", "going"), "Rush night, Tmrw, you're going");
  assert.equal(eventChipLabel("Rush night", "", "maybe"), "Rush night, you're interested");
  assert.equal(tagChipTitle(4), "4 people this week");
  assert.equal(tagChipTitle(1), "1 person this week");
  assert.equal(tagChipTitle(2.7), "2 people this week");
  assert.equal(tagChipTitle(-3), "0 people this week");
});
