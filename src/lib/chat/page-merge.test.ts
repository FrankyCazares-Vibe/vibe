/**
 * Tests for `page-merge.ts` (handoffs/chat-redesign/wave-2-contracts.md 9.3).
 *
 * Run with:
 *   node --test src/lib/chat/page-merge.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./page-merge.ts";
const { mergeFullPage, TEMP_ID_PREFIX } = (await import(specifier)) as typeof import("./page-merge");

type Row = { id: string; created_at: string; content: string };

const at = (n: number) => `2026-10-05T19:00:${String(n).padStart(2, "0")}.000000+00:00`;
const row = (id: string, n: number, content = id): Row => ({ id, created_at: at(n), content });

test("a page row replaces the state row of the same id, in place", () => {
  const state = [row("a", 1), row("b", 2, "old"), row("c", 3)];
  const page = [row("a", 1), row("b", 2, "new votes"), row("c", 3)];
  const out = mergeFullPage(state, page);
  assert.deepEqual(
    out.map((r) => [r.id, r.content]),
    [
      ["a", "a"],
      ["b", "new votes"],
      ["c", "c"],
    ],
  );
  assert.equal(out[1], page[1], "the page's object, not a copy of the old one");
});

test("a state row at or after the page's oldest whose id the page lacks is dropped", () => {
  const state = [row("a", 1), row("gone", 2), row("c", 3), row("removed", 4)];
  const page = [row("a", 1), row("c", 3)];
  assert.deepEqual(
    mergeFullPage(state, page).map((r) => r.id),
    ["a", "c"],
  );
});

test("a state row with exactly the oldest's created_at is inside the window (>=)", () => {
  const state = [row("x", 5), row("a", 5), row("b", 6)];
  const page = [row("a", 5), row("b", 6)];
  assert.deepEqual(
    mergeFullPage(state, page).map((r) => r.id),
    ["a", "b"],
  );
});

test("rows older than the page's oldest stay (earlier history)", () => {
  const state = [row("h1", 1), row("h2", 2), row("a", 10), row("b", 11)];
  const page = [row("a", 10), row("b", 11)];
  assert.deepEqual(
    mergeFullPage(state, page).map((r) => r.id),
    ["h1", "h2", "a", "b"],
  );
});

test("a temp_ row in flight is never dropped (N18)", () => {
  const state = [row("a", 10), row(`${TEMP_ID_PREFIX}1`, 12, "sending")];
  const page = [row("a", 10), row("b", 11)];
  assert.deepEqual(
    mergeFullPage(state, page).map((r) => r.id),
    ["a", "b", "temp_1"],
  );
});

test("a page row state did not have is added, and the result is oldest first", () => {
  const state = [row("a", 10), row("c", 12)];
  const page = [row("a", 10), row("b", 11), row("c", 12), row("d", 13)];
  assert.deepEqual(
    mergeFullPage(state, page).map((r) => r.id),
    ["a", "b", "c", "d"],
  );
});

test("an empty page drops nothing and answers a copy", () => {
  const state = [row("a", 1), row("b", 2)];
  const out = mergeFullPage(state, []);
  assert.deepEqual(out, state);
  assert.notEqual(out, state);
});

test("an empty state takes the page as it is", () => {
  const page = [row("a", 1), row("b", 2)];
  assert.deepEqual(
    mergeFullPage([], page).map((r) => r.id),
    ["a", "b"],
  );
});

test("the inputs are not mutated", () => {
  const state = [row("a", 1), row("gone", 2)];
  const page = [row("a", 1, "new")];
  const stateCopy = state.map((r) => ({ ...r }));
  const pageCopy = page.map((r) => ({ ...r }));
  mergeFullPage(state, page);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(page, pageCopy);
});

test("stubs and removals arrive as replacements like any other row", () => {
  type Stubby = Row & { hidden: boolean };
  const state: Stubby[] = [{ ...row("a", 1), hidden: false }];
  const page: Stubby[] = [{ ...row("a", 1, ""), hidden: true }];
  const out = mergeFullPage(state, page);
  assert.equal(out.length, 1);
  assert.equal(out[0].hidden, true);
});
