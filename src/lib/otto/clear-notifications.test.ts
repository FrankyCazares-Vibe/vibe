/**
 * Clear with Undo's core (Otto polish, Nov 11, 2026): rows hide at once,
 * nothing is sent until the Undo window runs out, Undo sends nothing, a
 * failed delete brings the rows back, leaving the page sends at once, and
 * `clearNotifications` speaks the route's two shapes.
 *
 * Run with:
 *   node --test src/lib/otto/clear-notifications.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClearArg } from "./clear-notifications";

// A URL import, so node loads the .ts file without a resolve hook.
const M = (await import(new URL("./clear-notifications.ts", import.meta.url).href)) as typeof import("./clear-notifications");
const { clearNotifications, createUndoClear, noticeIdOf } = M;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

/** A hand-wound clock and a recording sender. */
function rig(answer = true) {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const sent: { arg: ClearArg; keepalive?: boolean }[] = [];
  const committed: ClearArg[] = [];
  const q = createUndoClear({
    delayMs: 5000,
    send: async (arg, opts) => (sent.push({ arg, keepalive: opts.keepalive }), answer),
    setTimer: (fn, ms) => (timers.set(next, { fn, ms }), next++),
    clearTimer: (h) => void timers.delete(h as number),
    onCommitted: (arg) => committed.push(arg),
  });
  const runTimers = async () => {
    const all = [...timers.entries()];
    timers.clear();
    all.forEach(([, t]) => t.fn());
    await new Promise((r) => setImmediate(r));
  };
  return { q, timers, sent, committed, runTimers, hidden: () => [...q.getSnapshot().hidden].sort() };
}

test("noticeIdOf: only notification rows carry an id", () => {
  assert.equal(noticeIdOf(`notification:${A}`), A);
  assert.equal(noticeIdOf("notification:"), null);
  assert.equal(noticeIdOf(`event:${A}`), null);
});

test("a cleared row hides at once; nothing is sent until the 5 s run out", async () => {
  const r = rig();
  r.q.clear({ ids: [A] });
  assert.deepEqual(r.hidden(), [A]);
  assert.deepEqual(r.q.getSnapshot().toast?.kind, "cleared");
  assert.equal(r.sent.length, 0);
  assert.equal([...r.timers.values()][0].ms, 5000);
  await r.runTimers();
  assert.deepEqual(r.sent, [{ arg: { ids: [A] }, keepalive: false }]);
  assert.deepEqual(r.hidden(), [A], "still hidden after the delete");
  assert.equal(r.q.getSnapshot().toast, null);
  assert.deepEqual(r.committed, [{ ids: [A] }]);
});

test("Undo puts the rows back and sends nothing", async () => {
  const r = rig();
  r.q.clear({ ids: [A] });
  r.q.clear({ ids: [B] });
  assert.deepEqual(r.hidden(), [A, B]);
  r.q.undo();
  assert.deepEqual(r.hidden(), []);
  assert.equal(r.q.getSnapshot().toast, null);
  await r.runTimers();
  assert.equal(r.sent.length, 0);
});

test("two clears in the window go out as one delete, counted together", async () => {
  const r = rig();
  r.q.clear({ ids: [A] });
  r.q.clear({ ids: [B, A] });
  const toast = r.q.getSnapshot().toast;
  assert.ok(toast && toast.kind === "cleared");
  assert.equal(toast.count, 2);
  assert.equal(r.timers.size, 1, "the window restarts, one timer");
  await r.runTimers();
  assert.deepEqual(r.sent.map((s) => s.arg), [{ ids: [A, B] }]);
});

const T1 = "2026-11-11T15:00:00.000Z";
const T2 = "2026-11-11T16:00:00.000Z";

test("Clear all hides what is shown and sends { all, before } with the newest loaded time", async () => {
  const r = rig();
  r.q.clear({ all: true, before: T1 }, [A, B, C]);
  assert.deepEqual(r.hidden(), [A, B, C]);
  const toast = r.q.getSnapshot().toast;
  assert.ok(toast && toast.kind === "cleared" && toast.all === true);
  await r.runTimers();
  assert.deepEqual(r.sent.map((s) => s.arg), [{ all: true, before: T1 }]);
});

test("an × then Clear all in one window sends both: the cutoff and the row picked by hand", async () => {
  const r = rig();
  r.q.clear({ ids: [A] });
  r.q.clear({ all: true, before: T1 }, [B, C]);
  r.q.clear({ all: true, before: T2 }, []);
  await r.runTimers();
  assert.deepEqual(r.sent.map((s) => s.arg), [{ all: true, before: T2 }, { ids: [A] }]);
});

test("clearAllArg: the newest loaded time, or the ids when no row has one; newestISO skips junk", () => {
  assert.deepEqual(M.clearAllArg([{ whenISO: T1 }, { whenISO: T2 }, {}], [A]), { all: true, before: T2 });
  assert.deepEqual(M.clearAllArg([{}, { whenISO: "nope" }], [A, B]), { ids: [A, B] });
  assert.equal(M.newestISO([undefined, null, "x"]), null);
});

test("a delete that fails while a newer clear waits keeps that clear's Undo, then says it failed", async () => {
  const timers = new Map<number, () => void>();
  let next = 1;
  let fail = true;
  const q = createUndoClear({
    send: async () => !fail,
    setTimer: (fn) => (timers.set(next, fn), next++),
    clearTimer: (h) => void timers.delete(h as number),
  });
  const fire = async () => {
    const fns = [...timers.values()];
    timers.clear();
    fns.forEach((fn) => fn());
  };
  q.clear({ ids: [A] });
  await fire(); // batch 1 goes out (and will fail)
  q.clear({ ids: [B] }); // batch 2 waits with its Undo
  await new Promise((r) => setImmediate(r));
  assert.equal(q.getSnapshot().toast?.kind, "cleared", "batch 2's Undo is still up");
  assert.deepEqual([...q.getSnapshot().hidden], [B], "batch 1's row is back");
  fail = false;
  q.undo();
  assert.equal(q.getSnapshot().toast?.kind, "failed", "the failure line shows once batch 2 is done");
  assert.deepEqual([...q.getSnapshot().hidden], []);
});

test("a failed delete brings the rows back and says so", async () => {
  const r = rig(false);
  r.q.clear({ ids: [A, B] });
  await r.runTimers();
  assert.deepEqual(r.hidden(), []);
  assert.equal(r.q.getSnapshot().toast?.kind, "failed");
  assert.deepEqual(r.committed, []);
  await r.runTimers();
  assert.equal(r.q.getSnapshot().toast, null, "the failure line goes after a while");
});

test("leaving the page sends what is waiting at once, with keepalive; nothing waiting sends nothing", async () => {
  const r = rig();
  r.q.flush(true);
  assert.equal(r.sent.length, 0);
  r.q.clear({ ids: [C] });
  r.q.flush(true);
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(r.sent, [{ arg: { ids: [C] }, keepalive: true }]);
  assert.equal(r.timers.size, 0);
});

test("clearNotifications: DELETE with the route's two shapes; ok only on { ok: true }", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const real = globalThis.fetch;
  let reply: () => Response = () => new Response(JSON.stringify({ ok: true, deleted: 1 }), { status: 200 });
  globalThis.fetch = (async (url: string, init: RequestInit) => (calls.push({ url, init }), reply())) as typeof fetch;
  try {
    assert.equal(await clearNotifications({ ids: [A] }), true);
    assert.equal(await clearNotifications({ all: true, before: "2026-11-11T15:00:00.000Z" }, { keepalive: true }), true);
    assert.equal(calls[0].url, "/api/me/notifications");
    assert.equal(calls[0].init.method, "DELETE");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { ids: [A] });
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { all: true, before: "2026-11-11T15:00:00.000Z" });
    assert.equal(calls[1].init.keepalive, true);
    assert.equal(await clearNotifications({ ids: [] }), true, "nothing to clear sends nothing");
    assert.equal(calls.length, 2);
    reply = () => new Response(JSON.stringify({ ok: false }), { status: 400 });
    assert.equal(await clearNotifications({ ids: [A] }), false);
    reply = () => {
      throw new Error("offline");
    };
    assert.equal(await clearNotifications({ ids: [A] }), false);
  } finally {
    globalThis.fetch = real;
  }
});
