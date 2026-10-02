/**
 * Tests for `page-merge.ts` (handoffs/chat-redesign/wave-2-contracts.md 9.3;
 * S71 amendment 3, C and D: the gap replace and the mark-read decision).
 *
 * Run with:
 *   node --test src/lib/chat/page-merge.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./page-merge.ts";
const {
  mergeFullPage,
  TEMP_ID_PREFIX,
  pageLeavesGap,
  applyFullPage,
  applyAfterRows,
  afterAnswerJoins,
  newestCreatedAt,
  arrivedFromOthers,
  markReadDecision,
} = (await import(specifier)) as typeof import("./page-merge");

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

// ---------------------------------------------------------------------------
// S71 amendment 3, D (audit F08): a full read that cannot join what the reads
// brought replaces the list; one that can is merged as before. The test reads
// the READ FRONTIER (the newest `created_at` a read delivered), never the
// list: my own sent message on screen is not something a read brought
// (repair of the reviewers' findings).
// ---------------------------------------------------------------------------

const LIMIT = 50;
/** One row per second from a base, so 400 rows stay in order as strings. */
const ts = (i: number) =>
  `2026-10-10T20:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000000+00:00`;
const m = (i: number, content = `m${i}`): Row => ({ id: `m${i}`, created_at: ts(i), content });
const span = (from: number, to: number): Row[] => Array.from({ length: to - from + 1 }, (_, k) => m(from + k));
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);
/** The frontier of a list every row of which a read brought. */
const readTo = (rows: readonly Row[]) => newestCreatedAt(rows);
/** `m<a>->m<b>` wherever two neighbours of the list are not consecutive. */
const holes = (rows: readonly Row[]) => {
  const n = rows.filter((r) => /^m\d+$/.test(r.id)).map((r) => Number(r.id.slice(1)));
  const out: string[] = [];
  for (let i = 1; i < n.length; i += 1) if (n[i] - n[i - 1] !== 1) out.push(`m${n[i - 1]}->m${n[i]}`);
  return out;
};

test("newestCreatedAt: the newest of the rows, null for none", () => {
  assert.equal(newestCreatedAt([]), null);
  assert.equal(newestCreatedAt([m(3), m(9), m(4)]), ts(9));
});

test("GAP: a full page newer than everything read replaces the list (the audit's case)", () => {
  const state = span(0, 9);
  const page = span(80, 129);
  assert.equal(page.length, LIMIT);
  assert.equal(pageLeavesGap(readTo(state), page, LIMIT), true);
  const out = applyFullPage(state, page, LIMIT, readTo(state));
  assert.equal(out.gap, true, "the hook sets hasEarlier from this");
  assert.deepEqual(ids(out.messages), ids(page), "the page alone: no m0..m9 glued to m80");
  assert.equal(out.messages.some((r) => r.id === "m9"), false);
  assert.equal(out.frontier, ts(129), "the next ?after= asks from the page's newest");
  // What today's merge alone would have shown: the silent skip.
  const merged = ids(mergeFullPage(state, page));
  assert.deepEqual(merged.slice(8, 12), ["m8", "m9", "m80", "m81"]);
});

test("GAP: the next row after the frontier as the page's oldest is still a gap (rows MAY lie between)", () => {
  const out = applyFullPage(span(0, 9), span(10, 59), LIMIT, ts(9));
  assert.equal(out.gap, true);
  assert.deepEqual(ids(out.messages), ids(span(10, 59)));
});

test("GAP: unsent temp_ rows are kept, at the end, in their order", () => {
  const t1: Row = { id: `${TEMP_ID_PREFIX}1`, created_at: ts(11), content: "sending 1" };
  const t2: Row = { id: `${TEMP_ID_PREFIX}2`, created_at: ts(12), content: "sending 2" };
  const state = [...span(0, 9), t1, t2];
  const page = span(80, 129);
  const out = applyFullPage(state, page, LIMIT, ts(9));
  assert.equal(out.gap, true);
  assert.equal(out.messages.length, LIMIT + 2);
  assert.deepEqual(ids(out.messages.slice(0, LIMIT)), ids(page));
  assert.deepEqual(ids(out.messages.slice(LIMIT)), ["temp_1", "temp_2"]);
  assert.equal(out.messages[LIMIT], t1, "the same objects, untouched");
});

test("GAP: no frontier and a full page: the rows before it were never read", () => {
  assert.equal(pageLeavesGap(null, span(80, 129), LIMIT), true);
  const only: Row = { id: `${TEMP_ID_PREFIX}1`, created_at: ts(3), content: "sending" };
  const out = applyFullPage([only], span(80, 129), LIMIT, null);
  assert.equal(out.gap, true);
  assert.deepEqual(ids(out.messages), [...ids(span(80, 129)), "temp_1"]);
});

test("GAP (repair): my own sent message on screen does not hide the gap (back from lock, I send, then the full read)", () => {
  // On screen m51..m100, all read. 60 messages were missed; the return's full
  // read failed; I sent m161 and its POST answered (the composer swapped the
  // temp_ row for the real one). The frontier is still m100.
  const frontier = ts(100);
  const mine = m(161, "mine");
  const state = [...span(51, 100), mine];
  const page = [...span(112, 160), mine];
  assert.equal(page.length, LIMIT);
  assert.equal(pageLeavesGap(frontier, page, LIMIT), true, "the page's oldest (m112) is past what the reads brought");
  const out = applyFullPage(state, page, LIMIT, frontier);
  assert.equal(out.gap, true);
  assert.deepEqual(ids(out.messages), ids(page));
  assert.deepEqual(holes(out.messages), [], "no m100 glued to m112");
  assert.equal(out.frontier, ts(161));
  // The old test (the newest non-temp row ON SCREEN) read my m161 as "the
  // page overlaps" and merged: m51..m100 then m112..m161, a hole for good.
  assert.deepEqual(holes(mergeFullPage(state, page)), ["m100->m112"]);
});

test("GAP (repair): my send's answer lands before the full read's answer: gap, and my sent row is kept", () => {
  // The page was taken before my row existed (m111..m160); my m161 is on
  // screen already when it answers.
  const frontier = ts(100);
  const mine = m(161, "mine");
  const state = [...span(51, 100), mine];
  const page = span(111, 160);
  const out = applyFullPage(state, page, LIMIT, frontier);
  assert.equal(out.gap, true);
  assert.deepEqual(ids(out.messages), [...ids(page), "m161"], "the page, then my send (newer than the page)");
  assert.equal(out.messages[LIMIT], mine);
  assert.equal(out.frontier, ts(160), "the page's newest, NOT my row: the next ?after= starts there");
  // A message that landed between the page and my send arrives by that
  // ?after= and sorts above my row.
  const between: Row = { id: "x", created_at: `${ts(160).slice(0, 19)}.500000+00:00`, content: "x" };
  const next = applyAfterRows(out.messages, [m(160), between, mine], out.frontier);
  assert.deepEqual(ids(next.fresh), ["x"]);
  assert.deepEqual(ids(next.messages.slice(-3)), ["m160", "x", "m161"]);
  assert.equal(next.frontier, ts(161));
});

test("GAP: a kept row is never one the page already holds, and rows inside the gap go with the old list", () => {
  const frontier = ts(100);
  const inGap = m(105, "mine, sent before the page's oldest");
  const out = applyFullPage([...span(51, 100), inGap, m(161)], [...span(112, 160), m(161)], LIMIT, frontier);
  assert.equal(out.gap, true);
  assert.equal(out.messages.filter((r) => r.id === "m161").length, 1);
  assert.equal(out.messages.some((r) => r.id === "m105"), false, "Earlier messages reaches it");
});

test("NO GAP: the page overlaps what was read: today's merge, earlier history kept", () => {
  const state = span(0, 60);
  const page = span(15, 64).map((r) => (r.id === "m20" ? { ...r, content: "new votes" } : r));
  assert.equal(page.length, LIMIT);
  assert.equal(pageLeavesGap(readTo(state), page, LIMIT), false);
  const out = applyFullPage(state, page, LIMIT, readTo(state));
  assert.equal(out.gap, false);
  assert.deepEqual(ids(out.messages), ids(span(0, 64)));
  assert.deepEqual(out.messages, mergeFullPage(state, page), "exactly mergeFullPage");
  assert.equal(out.messages[20].content, "new votes");
  assert.equal(out.frontier, ts(64));
});

test("NO GAP: the page touches what was read (its oldest IS the frontier row)", () => {
  const state = span(0, 9);
  const page = span(9, 58);
  assert.equal(page.length, LIMIT);
  assert.equal(pageLeavesGap(ts(9), page, LIMIT), false);
  const out = applyFullPage(state, page, LIMIT, ts(9));
  assert.equal(out.gap, false);
  assert.deepEqual(ids(out.messages), ids(span(0, 58)));
});

test("NO GAP: the page's oldest shares the frontier's created_at (>, not >=)", () => {
  const page = [{ id: "twin", created_at: ts(2), content: "twin" }, ...span(3, 51)];
  assert.equal(page.length, LIMIT);
  assert.equal(pageLeavesGap(ts(2), page, LIMIT), false);
});

test("NO GAP: a page that is not full holds all the room has, however new it is", () => {
  const state = span(0, 9);
  const page = span(80, 128);
  assert.equal(page.length, LIMIT - 1);
  assert.equal(pageLeavesGap(ts(9), page, LIMIT), false);
  const out = applyFullPage(state, page, LIMIT, ts(9));
  assert.equal(out.gap, false);
  assert.deepEqual(out.messages, mergeFullPage(state, page));
  assert.deepEqual(ids(out.messages), [...ids(span(0, 9)), ...ids(span(80, 128))]);
});

test("NO GAP: an empty page leaves the list and the frontier; an empty state takes a short page", () => {
  assert.equal(pageLeavesGap(ts(9), [], LIMIT), false);
  assert.deepEqual(applyFullPage(span(0, 9), [], LIMIT, ts(9)), { messages: span(0, 9), gap: false, frontier: ts(9) });
  assert.equal(pageLeavesGap(null, span(0, 9), LIMIT), false);
  const out = applyFullPage([], span(0, 9), LIMIT, null);
  assert.deepEqual(ids(out.messages), ids(span(0, 9)));
  assert.equal(out.frontier, ts(9), "the first page sets the frontier");
});

test("FRONTIER: a full page that answered late moves the frontier BACK to its own newest row", () => {
  // Read to m400; a page taken earlier (m301..m350) answers after. The merge
  // drops m351..m400 (9.3: at or after the page's oldest and not in it), so
  // the next ?after= must ask from m350 to bring them back, not from m400.
  const state = span(351, 400);
  const out = applyFullPage(state, span(301, 350), LIMIT, ts(400));
  assert.equal(out.gap, false);
  assert.deepEqual(ids(out.messages), ids(span(301, 350)));
  assert.equal(out.frontier, ts(350));
  const healed = applyAfterRows(out.messages, span(350, 400), out.frontier);
  assert.deepEqual(holes(healed.messages), []);
  assert.deepEqual(ids(healed.messages), ids(span(301, 400)));
});

test("applyFullPage does not mutate its inputs, gap or not", () => {
  for (const [state, page] of [
    [span(0, 9), span(80, 129)],
    [span(0, 60), span(15, 64)],
  ] as const) {
    const stateCopy = state.map((r) => ({ ...r }));
    const pageCopy = page.map((r) => ({ ...r }));
    const out = applyFullPage(state, page, LIMIT, readTo(state));
    assert.deepEqual(state, stateCopy);
    assert.deepEqual(page, pageCopy);
    assert.notEqual(out.messages, page);
    assert.notEqual(out.messages, state);
  }
});

// ---------------------------------------------------------------------------
// The 4-s `?after=<frontier>` read (repair): the cursor is what the reads
// brought, so a message that landed just before my own send is not skipped.
// ---------------------------------------------------------------------------

/** The route's `?after=`: `gte`, ascending, the first `limit` rows. */
const serveAfter = (all: readonly Row[], cursor: string, limit = 200) => all.filter((r) => r.created_at >= cursor).slice(0, limit);

test("AFTER: rows the list lacks are added in order, the known ones dropped by id, the frontier moves", () => {
  const out = applyAfterRows(span(0, 5), span(5, 8), ts(5));
  assert.deepEqual(ids(out.fresh), ["m6", "m7", "m8"]);
  assert.deepEqual(ids(out.messages), ids(span(0, 8)));
  assert.equal(out.frontier, ts(8));
});

test("AFTER: a read that brought nothing new keeps the list and the frontier", () => {
  const state = span(0, 5);
  const out = applyAfterRows(state, [m(5)], ts(5));
  assert.deepEqual(out.fresh, []);
  assert.deepEqual(out.messages, state);
  assert.equal(out.frontier, ts(5));
  assert.equal(applyAfterRows(state, [], ts(5)).frontier, ts(5));
});

test("AFTER (repair): someone's message that landed just before my send arrives on the next quick check", () => {
  // Read to m100. m101 (someone else) lands, then I send m102 and the POST
  // answers: m102 is on screen, the frontier is still m100.
  const all = span(1, 102);
  const state = [...span(51, 100), m(102, "mine")];
  const frontier = ts(100);
  const out = applyAfterRows(state, serveAfter(all, frontier), frontier);
  assert.deepEqual(ids(out.fresh), ["m101"], "the cursor the old code used (my m102) would have asked past it");
  assert.deepEqual(ids(out.messages.slice(-3)), ["m100", "m101", "m102"], "above my message, where it belongs");
  assert.equal(out.frontier, ts(102), "my own row counts once a READ delivered it");
  assert.deepEqual(serveAfter(all, ts(102)).map((r) => r.id), ["m102"], "what ?after=<my row> answers: m101 skipped");
});

test("AFTER (repair): back from lock, the full read failed, I send: the quick checks catch up with no hole", () => {
  const all = [...span(1, 160), m(161, "mine")];
  let list: Row[] = [...span(51, 100), m(161, "mine")];
  let frontier: string | null = ts(100);
  const tick = applyAfterRows(list, serveAfter(all, frontier), frontier);
  list = tick.messages;
  frontier = tick.frontier;
  assert.deepEqual(holes(list), []);
  assert.deepEqual(ids(list), ids(span(51, 161)));
  // The 5th tick's full read then overlaps: a plain merge.
  const full = applyFullPage(list, all.slice(-LIMIT), LIMIT, frontier);
  assert.equal(full.gap, false);
  assert.deepEqual(holes(full.messages), []);
});

test("afterAnswerJoins: only an answer whose cursor is at or before the frontier may be added", () => {
  assert.equal(afterAnswerJoins(ts(100), ts(100)), true, "the usual tick");
  assert.equal(afterAnswerJoins(ts(90), ts(100)), true, "the frontier moved on meanwhile: the rows overlap");
  assert.equal(afterAnswerJoins(ts(400), ts(350)), false, "a late full read moved the frontier back: rows would be skipped");
  assert.equal(afterAnswerJoins(ts(100), null), false);
});

// ---------------------------------------------------------------------------
// S71 amendment 3, C (audit F05): what I watched arrive is read. The hook
// (`use-room-poll.ts`) asks these two once per read and once on its cleanup.
// ---------------------------------------------------------------------------

const ME = "me-1";
const from = (id: string, user_id: string) => ({ id, user_id });

test("arrivedFromOthers: only a row by someone else counts", () => {
  assert.equal(arrivedFromOthers([], ME), false, "a tick that brought nothing");
  assert.equal(arrivedFromOthers([from("a", ME), from("b", ME)], ME), false, "my own send coming back");
  assert.equal(arrivedFromOthers([from("a", ME), from("b", "them")], ME), true);
  assert.equal(arrivedFromOthers([from("a", "")], ME), true, "a stub (user_id \"\") is someone else's");
  assert.equal(arrivedFromOthers([from(`${TEMP_ID_PREFIX}1`, "them")], ME), false, "a temp_ row is never the server's");
  assert.equal(arrivedFromOthers([from("a", "them")], null), true, "no viewer id yet: nobody's row is mine");
});

test("markReadDecision: visible and something arrived -> one mark, nothing owed", () => {
  assert.deepEqual(markReadDecision({ arrived: true, owed: false, visible: true }), { mark: true, owed: false });
  assert.deepEqual(markReadDecision({ arrived: true, owed: true, visible: true }), { mark: true, owed: false });
});

test("markReadDecision: NEVER a mark while the page is hidden; it is owed", () => {
  assert.deepEqual(markReadDecision({ arrived: true, owed: false, visible: false }), { mark: false, owed: true });
  assert.deepEqual(markReadDecision({ arrived: false, owed: true, visible: false }), { mark: false, owed: true });
  assert.deepEqual(markReadDecision({ arrived: true, owed: true, visible: false }), { mark: false, owed: true });
});

test("markReadDecision: an owed mark goes out with the next read that answers while visible", () => {
  assert.deepEqual(markReadDecision({ arrived: false, owed: true, visible: true }), { mark: true, owed: false });
});

test("markReadDecision: nothing arrived and nothing owed -> no mark, visible or not", () => {
  assert.deepEqual(markReadDecision({ arrived: false, owed: false, visible: true }), { mark: false, owed: false });
  assert.deepEqual(markReadDecision({ arrived: false, owed: false, visible: false }), { mark: false, owed: false });
});

/**
 * The hook's own sequence, replayed without React: `settle` is `settleMark`
 * (one call per read that answered), `leave` is the effect's cleanup.
 */
function replay() {
  let owed = false;
  let marks = 0;
  return {
    settle(rows: { id: string; user_id: string }[], visible: boolean) {
      const d = markReadDecision({ arrived: arrivedFromOthers(rows, ME), owed, visible });
      owed = d.owed;
      if (d.mark) marks += 1;
    },
    leave(visible: boolean) {
      const d = markReadDecision({ arrived: false, owed, visible });
      owed = false;
      if (d.mark) marks += 1;
    },
    get marks() {
      return marks;
    },
  };
}

test("F05: six messages watched arriving over the 4-s checks are marked, one mark per tick, none on the way out", () => {
  const r = replay();
  r.settle([from("a", "them"), from("b", "them")], true);
  r.settle([], true);
  r.settle([from("c", "them")], true);
  r.settle([from("mine", ME)], true);
  r.settle([from("d", "them"), from("e", "them"), from("f", "them")], true);
  assert.equal(r.marks, 3, "three ticks brought rows by others: three marks, not six");
  r.leave(true);
  assert.equal(r.marks, 3, "nothing arrived since the last mark: Back sends none");
});

test("F05: a row that lands after the page was hidden is not marked until the page is seen again", () => {
  const r = replay();
  r.settle([from("a", "them")], false);
  assert.equal(r.marks, 0);
  r.settle([], true);
  assert.equal(r.marks, 1, "the first read that answers while visible sends the owed mark");
  r.settle([], true);
  assert.equal(r.marks, 1, "once");
});

test("F05: leaving the room sends an owed mark when visible, and never when hidden", () => {
  const seen = replay();
  seen.settle([from("a", "them")], false);
  seen.leave(true);
  assert.equal(seen.marks, 1);

  const unseen = replay();
  unseen.settle([from("a", "them")], false);
  unseen.leave(false);
  assert.equal(unseen.marks, 0);
});
