/**
 * Tests for the pure half of `use-checkin-state.ts` (event check-in, Batch 3,
 * handoffs/2026-10-19-checkin-build/CONTRACT.md 4.1): the card's state from
 * the list fields, when a new list answer starts the card over, the 30 s
 * re-read throttle, the route-state parser and merge, and how the code form
 * words each refusal.
 *
 * Run with:
 *   node --test src/components/events/checkin/use-checkin-state.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't resolve the "@/…"
 * alias or add file extensions. The hook's two browser imports (the request
 * wrapper and the campus clock) are stubbed so only the pure exports run;
 * the shared check-in file loads for real.
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
  throw new Error("use-checkin-state.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/feedback/request": stub("export async function vibeRequest() { throw new Error('not in this test'); }"),
  "@/components/campus/tonight/use-campus-now": stub("export function useCampusNow() { return 0; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
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
  CHECKIN_RESYNC_MS,
  cardStateKey,
  checkinApiPath,
  codeFormRefusal,
  dueForReread,
  mergeViewerState,
  mountPlan,
  parseViewerState,
  stateFromCard,
} = await import("./use-checkin-state");
const { CHECKIN_ERRORS } = await import("../../../lib/events/event-checkin");

const ID = "11111111-2222-4333-8444-555555555555";
const EV = {
  id: ID,
  title: "Fall Formal",
  starts_at: "2026-10-24T23:00:00.000Z",
  ends_at: "2026-10-25T02:00:00.000Z",
};

test("stateFromCard: the list's three fields, and the window an hour each side", () => {
  const s = stateFromCard({ ...EV, checkin_open: true, viewer_checked_in: false, checked_in_count: 7 });
  assert.deepEqual(s, {
    event_id: ID,
    open: true,
    checked_in: false,
    count: 7,
    opens_at: "2026-10-24T22:00:00.000Z",
    closes_at: "2026-10-25T03:00:00.000Z",
  });
});

test("stateFromCard: missing fields read 'nothing known', a bad time gives empty strings", () => {
  const s = stateFromCard({ ...EV, starts_at: "not a time" });
  assert.equal(s.open, false);
  assert.equal(s.checked_in, false);
  assert.equal(s.count, null);
  assert.equal(s.opens_at, "");
  assert.equal(s.closes_at, "2026-10-25T03:00:00.000Z");
  assert.equal(stateFromCard({ ...EV, checked_in_count: -1 }).count, null);
  assert.equal(stateFromCard({ ...EV, checked_in_count: Number.NaN }).count, null);
  assert.equal(stateFromCard({ ...EV, checked_in_count: 5.9 }).count, 5);
});

test("cardStateKey: changes with each list fact, not with the title", () => {
  const base = cardStateKey({ ...EV, checkin_open: false });
  assert.equal(cardStateKey({ ...EV, title: "Renamed" }), base);
  assert.notEqual(cardStateKey({ ...EV, checkin_open: true }), base);
  assert.notEqual(cardStateKey({ ...EV, viewer_checked_in: true }), base);
  assert.notEqual(cardStateKey({ ...EV, checked_in_count: 0 }), base);
  assert.notEqual(cardStateKey({ ...EV, id: "other" }), base);
  assert.notEqual(cardStateKey({ ...EV, ends_at: "2026-10-25T03:00:00.000Z" }), base);
});

test("dueForReread: never read, or 30 s since the last read", () => {
  assert.equal(CHECKIN_RESYNC_MS, 30_000);
  assert.equal(dueForReread(0, 1_000), true);
  assert.equal(dueForReread(1_000, 1_000 + 29_999), false);
  assert.equal(dueForReread(1_000, 1_000 + 30_000), true);
});

test("parseViewerState: field by field; another event's state is refused", () => {
  assert.equal(parseViewerState(null, ID), null);
  assert.equal(parseViewerState([], ID), null);
  assert.equal(parseViewerState("x", ID), null);
  assert.equal(parseViewerState({ event_id: "other" }, ID), null);
  assert.deepEqual(
    parseViewerState({ event_id: ID, open: true, checked_in: "yes", count: 4, opens_at: "a", closes_at: 3 }, ID),
    { event_id: ID, open: true, checked_in: false, count: 4, opens_at: "a", closes_at: "" },
  );
  assert.equal(parseViewerState({ event_id: ID, count: -2 }, ID)?.count, null);
});

test("mergeViewerState: empty window times keep the card's own (the POST fallback state)", () => {
  const prev = stateFromCard({ ...EV, checked_in_count: 9 });
  const merged = mergeViewerState(prev, {
    event_id: ID,
    open: true,
    checked_in: true,
    count: null,
    opens_at: "",
    closes_at: "",
  });
  assert.equal(merged.opens_at, prev.opens_at);
  assert.equal(merged.closes_at, prev.closes_at);
  assert.equal(merged.checked_in, true);
  assert.equal(merged.count, null, "an unknown count stays unknown, never a stale number");
});

test("codeFormRefusal: words by code, the field's three reactions", () => {
  const wrong = codeFormRefusal("checkin_code_wrong", "fallback");
  assert.deepEqual(wrong, { message: CHECKIN_ERRORS.checkin_code_wrong, clear: true, lock: false, toCode: false });
  const expired = codeFormRefusal("checkin_link_expired", "fallback");
  assert.equal(expired.toCode, true);
  assert.equal(expired.message, CHECKIN_ERRORS.checkin_link_expired);
  for (const code of ["checkin_too_many_tries", "checkin_unavailable"] as const) {
    const r = codeFormRefusal(code, "fallback");
    assert.equal(r.lock, true, code);
    assert.equal(r.message, CHECKIN_ERRORS[code]);
  }
  assert.equal(codeFormRefusal("checkin_closed", "x").message, CHECKIN_ERRORS.checkin_closed);
  assert.equal(codeFormRefusal("unauthorized", "x").message, CHECKIN_ERRORS.unauthorized);
});

test("codeFormRefusal: an unknown or missing code keeps the request's own line", () => {
  const net = "Couldn't reach Vibe. Check your connection and try again.";
  assert.deepEqual(codeFormRefusal(null, net), { message: net, clear: false, lock: false, toCode: false });
  assert.equal(codeFormRefusal("toString", net).message, net, "no prototype keys");
  assert.equal(codeFormRefusal("some_new_code", net).message, net);
});

test("checkinApiPath: the student's route, id encoded", () => {
  assert.equal(checkinApiPath(ID), `/api/events/${ID}/checkin`);
  assert.equal(checkinApiPath("a/b"), "/api/events/a%2Fb/checkin");
});

test("mountPlan: a remount inside 30 s of a read sends none, and reuses the answer while the list is unchanged", () => {
  const key = cardStateKey(EV);
  const answer = { ...stateFromCard(EV), open: true, checked_in: true };
  assert.deepEqual(mountPlan(undefined, key, 50_000), { read: true, cached: null }, "never read: read");
  const memo = { at: 10_000, state: answer, listKey: key };
  assert.deepEqual(mountPlan(memo, key, 10_000 + 29_999), { read: false, cached: answer });
  assert.deepEqual(mountPlan(memo, key, 10_000 + 30_000), { read: true, cached: null }, "30 s on: read again");
  assert.deepEqual(
    mountPlan(memo, cardStateKey({ ...EV, checkin_open: true }), 12_000),
    { read: false, cached: null },
    "the list changed since: its facts are newer, still no second read",
  );
  assert.deepEqual(
    mountPlan({ at: 10_000, state: null, listKey: key }, key, 12_000),
    { read: false, cached: null },
    "a read still out (or failed) holds the 30 s too",
  );
});
