/**
 * The desk's lists (Otto polish, Nov 11, 2026): the time picker's ranges,
 * "Show all", and folds remembered on the device.
 *
 * Run with:
 *   node --test src/lib/otto/desk-lists.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// A URL import, so node loads the .ts file without a resolve hook.
const L = (await import(new URL("./desk-lists.ts", import.meta.url).href)) as typeof import("./desk-lists");
const { DESK_RANGES, FOLDS_KEY, fewOf, inDeskRange, readFolds, writeFold } = L;

const NOW = Date.parse("2026-11-11T18:00:00Z");
const daysAgo = (d: number) => ({ whenISO: new Date(NOW - d * 86_400_000).toISOString() });

test("the picker's three steps, in Franky's words", () => {
  assert.deepEqual(
    DESK_RANGES.map((r) => r.label),
    ["This week", "30 days", "All"],
  );
});

test("ranges: this week is 7 days, 30 days is 30, All is everything; undated rows always show", () => {
  assert.equal(inDeskRange(daysAgo(6.9), "week", NOW), true);
  assert.equal(inDeskRange(daysAgo(7.1), "week", NOW), false);
  assert.equal(inDeskRange(daysAgo(29), "30d", NOW), true);
  assert.equal(inDeskRange(daysAgo(31), "30d", NOW), false);
  assert.equal(inDeskRange(daysAgo(400), "all", NOW), true);
  assert.equal(inDeskRange({}, "week", NOW), true);
  assert.equal(inDeskRange({ whenISO: "soon" }, "week", NOW), true);
});

test("fewOf: a few rows, the rest behind Show all; never a button for one more row", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(fewOf(ten, 4, false), { shown: [0, 1, 2, 3], more: 6 });
  assert.deepEqual(fewOf(ten, 4, true), { shown: ten, more: 0 });
  assert.deepEqual(fewOf([1, 2, 3], 4, false), { shown: [1, 2, 3], more: 0 });
  assert.deepEqual(fewOf([1, 2, 3, 4, 5], 4, false), { shown: [1, 2, 3, 4, 5], more: 0 });
});

function memory(throwing = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => {
      if (throwing) throw new Error("blocked");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throwing) throw new Error("blocked");
      data.set(k, v);
    },
  };
}

test("folds: remembered on the device, opened again, junk and blocked storage read as all open", () => {
  const s = memory();
  assert.deepEqual(readFolds(s), {});
  assert.deepEqual(writeFold(s, "saw", true), { saw: true });
  assert.deepEqual(writeFold(s, "done", true), { saw: true, done: true });
  assert.deepEqual(writeFold(s, "saw", false), { done: true });
  assert.deepEqual(readFolds(s), { done: true });
  s.data.set(FOLDS_KEY, "{nope");
  assert.deepEqual(readFolds(s), {});
  s.data.set(FOLDS_KEY, JSON.stringify({ saw: "yes", ready: true }));
  assert.deepEqual(readFolds(s), { ready: true });
  assert.deepEqual(readFolds(memory(true)), {});
  assert.deepEqual(writeFold(memory(true), "saw", true), { saw: true });
  assert.deepEqual(readFolds(null), {});
});
