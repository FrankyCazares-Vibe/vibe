/**
 * Tests for `audience-split.ts`: the count never moves with the caller's own
 * mute/block list (security report 2026-09-27 #18), and paging follows the
 * visible list, never the count.
 *
 * Run with:
 *   node --test src/lib/metrics/audience-split.test.ts
 *
 * Loaded through a dynamic import of its ".ts" path (same pattern as
 * src/lib/posts/engagement-counts.test.ts); the specifier goes through a
 * variable because tsc refuses a literal ".ts" specifier.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./audience-split.ts";
const { splitAudience, pageAudience } = (await import(specifier)) as typeof import("./audience-split");

type Entry = { user_id: string; viewed_on: string };

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";

const audience: Entry[] = [
  { user_id: A, viewed_on: "2026-09-27" },
  { user_id: B, viewed_on: "2026-09-26" },
  { user_id: C, viewed_on: "2026-09-25" },
  { user_id: D, viewed_on: "2026-09-24" },
];

test("the mute-and-recount oracle is closed: total is identical whoever is hidden", () => {
  const none = splitAudience(audience, []);
  const one = splitAudience(audience, [B]);
  const everyone = splitAudience(audience, [A, B, C, D]);
  assert.equal(none.total, 4);
  assert.equal(one.total, none.total);
  assert.equal(everyone.total, none.total);
  // Hiding someone who is NOT in the audience changes nothing either.
  assert.equal(splitAudience(audience, ["not-in-audience"]).total, 4);
});

test("the list leaves hidden people out and keeps the order it was given", () => {
  const { listed } = splitAudience(audience, [B, D]);
  assert.deepEqual(
    listed.map((e) => e.user_id),
    [A, C],
  );
  assert.equal(splitAudience(audience, [A, B, C, D]).listed.length, 0);
  assert.equal(splitAudience(audience, []).listed.length, 4);
});

test("hidden ids can come as a Set or any iterable", () => {
  assert.deepEqual(
    splitAudience(audience, new Set([A])).listed.map((e) => e.user_id),
    [B, C, D],
  );
  assert.deepEqual(
    splitAudience(audience, new Set([A]).values()).listed.map((e) => e.user_id),
    [B, C, D],
  );
});

test("idOf names the person on rows that are not keyed on user_id", () => {
  const rows = [{ viewer_user_id: A }, { viewer_user_id: B }];
  const split = splitAudience(rows, [A], (r) => r.viewer_user_id);
  assert.equal(split.total, 2);
  assert.deepEqual(split.listed, [{ viewer_user_id: B }]);
});

test("an empty audience is a real zero, not an error", () => {
  const split = splitAudience([] as Entry[], [A]);
  assert.equal(split.total, 0);
  assert.deepEqual(split.listed, []);
});

test("the input array is not mutated", () => {
  const copy = audience.slice();
  splitAudience(audience, [A, B]);
  assert.deepEqual(audience, copy);
});

test("paging follows the LIST: Show more turns off when the visible list ends", () => {
  // Four people saw it, one is muted: the list has three and total stays four.
  const { total, listed } = splitAudience(audience, [D]);
  assert.equal(total, 4);
  const first = pageAudience(listed, 0, 2);
  assert.deepEqual(first.page.map((e) => e.user_id), [A, B]);
  assert.equal(first.has_more, true);
  assert.equal(first.next_offset, 2);
  const second = pageAudience(listed, first.next_offset, 2);
  assert.deepEqual(second.page.map((e) => e.user_id), [C]);
  // Paging on total (4) would say has_more here and Show more would append
  // nothing forever.
  assert.equal(second.has_more, false);
  assert.equal(second.next_offset, 3);
});

test("a page past the end is empty, has no more, and does not move backwards", () => {
  const p = pageAudience(audience, 10, 5);
  assert.deepEqual(p.page, []);
  assert.equal(p.has_more, false);
  assert.equal(p.next_offset, 10);
});

test("garbage offset/limit are clamped, never a negative slice", () => {
  const neg = pageAudience(audience, -3, 2);
  assert.deepEqual(neg.page.map((e) => e.user_id), [A, B]);
  assert.equal(neg.next_offset, 2);
  const nan = pageAudience(audience, Number.NaN, Number.NaN);
  assert.deepEqual(nan.page, []);
  assert.equal(nan.next_offset, 0);
  assert.equal(nan.has_more, true);
  const frac = pageAudience(audience, 1.7, 2.9);
  assert.deepEqual(frac.page.map((e) => e.user_id), [B, C]);
  assert.equal(frac.next_offset, 3);
});
