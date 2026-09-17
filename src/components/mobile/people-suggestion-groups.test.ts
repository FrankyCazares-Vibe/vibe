/**
 * Tests for `people-suggestion-groups.ts`, the phone People screen's
 * Discover groups (wave plan B14t). Pure stand-in for the deferred live
 * check "one row per `reason_v2` → groups in order".
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/mobile/people-suggestion-groups.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `src/lib/onboarding/finish.test.ts`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

import type { SuggestionSignalsRow } from "./people-suggestion-groups";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("people-suggestion-groups.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  atCampusLabel,
  bucketSuggestions,
  categorizeSuggestion,
  elsewhereLabel,
  suggestionGroupOrder,
} = await import("./people-suggestion-groups");

type Row = SuggestionSignalsRow & { id: string };

/** One row per `reason_v2`, as the W3 live check's override sends them. */
const ONE_PER_REASON: Row[] = [
  { id: "n", reason_v2: "new_on_vibe", reason: "new on Vibe" },
  { id: "s", reason_v2: "same_system", reason: "new on Vibe", campus_id: "indianapolis", school_system: "purdue" },
  { id: "m", reason_v2: "mutuals", reason: "2 mutuals", mutual_count: 2 },
  { id: "j", reason_v2: "same_major", reason: "same major", same_major: true },
  { id: "c", reason_v2: "same_campus", reason: "same school", campus_id: "indianapolis", school_system: "iu" },
  { id: "o", reason_v2: "from_your_clubs", reason: "in your org", shared_org_count: 1 },
];

function visibleGroups(rows: Row[]) {
  const buckets = bucketSuggestions(rows);
  return suggestionGroupOrder(buckets)
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({ label: g.label, ids: buckets[g.key].map((u) => u.id) }));
}

test("one row per reason_v2 → the six groups in order", () => {
  assert.deepEqual(
    visibleGroups(ONE_PER_REASON).map((g) => g.label),
    ["From your clubs", "At Indianapolis", "Same major", "Friends of friends", "Elsewhere at Purdue", "New on Vibe"],
  );
});

test("reason_v2 wins over the legacy signals", () => {
  // A friend-of-friend next door is a campus suggestion now.
  assert.equal(categorizeSuggestion({ reason_v2: "same_campus", mutual_count: 4, reason: "4 mutuals" }), "campus");
  assert.equal(categorizeSuggestion({ reason_v2: "same_system", same_major: true }), "system");
});

test("legacy rows (no reason_v2) keep the old rules; 'same school' → campus", () => {
  assert.equal(categorizeSuggestion({ reason: "same school" }), "campus");
  assert.equal(categorizeSuggestion({ mutual_count: 3, reason: "3 mutuals" }), "mutuals");
  assert.equal(categorizeSuggestion({ shared_org_count: 2 }), "org");
  assert.equal(categorizeSuggestion({ same_major: true }), "major");
  assert.equal(categorizeSuggestion({ reason: "new on Vibe" }), "new");
  assert.equal(categorizeSuggestion({}), "new");
});

test("an unknown reason_v2 falls back to the legacy rules", () => {
  const row = { reason_v2: "from_the_moon", reason: "same school" } as unknown as SuggestionSignalsRow;
  assert.equal(categorizeSuggestion(row), "campus");
});

test("a legacy 'same school' row lands in the campus group, beside v2 rows", () => {
  const groups = visibleGroups([
    { id: "legacy", reason: "same school" },
    { id: "c", reason_v2: "same_campus", campus_id: "indianapolis" },
  ]);
  assert.deepEqual(groups, [{ label: "At Indianapolis", ids: ["legacy", "c"] }]);
});

test("server order is kept inside a group; empty groups drop", () => {
  const groups = visibleGroups([
    { id: "b", reason_v2: "mutuals", mutual_count: 1 },
    { id: "a", reason_v2: "mutuals", mutual_count: 5 },
  ]);
  assert.deepEqual(groups, [{ label: "Friends of friends", ids: ["b", "a"] }]);
});

test("campus and system labels fall back when unknown", () => {
  assert.deepEqual(visibleGroups([{ id: "x", reason: "same school" }]), [
    { label: "On your campus", ids: ["x"] },
  ]);
  assert.deepEqual(visibleGroups([{ id: "y", reason_v2: "same_system", school_system: null }]), [
    { label: "Elsewhere at your university", ids: ["y"] },
  ]);
  assert.equal(atCampusLabel("iu-bloomington"), "At Bloomington");
  assert.equal(atCampusLabel("nowhere"), "On your campus");
  assert.equal(atCampusLabel(null), "On your campus");
  assert.equal(elsewhereLabel("iu"), "Elsewhere at IU");
  assert.equal(elsewhereLabel("purdue"), "Elsewhere at Purdue");
  assert.equal(elsewhereLabel(undefined), "Elsewhere at your university");
});

test("the campus label uses the bucket's first KNOWN campus id", () => {
  const groups = visibleGroups([
    { id: "legacy", reason: "same school", campus_id: null },
    { id: "c", reason_v2: "same_campus", campus_id: "fort-wayne" },
  ]);
  assert.equal(groups[0]?.label, "At Fort Wayne");
});
