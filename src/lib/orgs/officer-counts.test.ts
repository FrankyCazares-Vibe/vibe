/**
 * Tests for `officer-counts.ts` (the club's view, wave 2, C7): the header's
 * counts for officers and the "needs you" line, plus the two head-count reads
 * against a recording fake of the service client.
 *
 * Run with:
 *   node --test src/lib/orgs/officer-counts.test.ts
 *
 * The resolve hook maps "@/x" to "src/x.ts" (the `following.test.ts`
 * pattern); the module loads through dynamic `import()` after it.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("officer-counts.test.ts needs Node >= 22.15");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./officer-counts.ts";
const { NEW_FOLLOWER_WINDOW_MS, headerCount, loadOfficerCounts, needsYouText } = (await import(
  specifier
)) as typeof import("./officer-counts");

// ── The pure parts ───────────────────────────────────────────────────────────

test("headerCount: exact for officers, from 5 up for everyone else, null stays null", () => {
  for (const n of [0, 1, 4, 5, 120]) assert.equal(headerCount(n, true), n);
  for (const n of [0, 1, 4]) assert.equal(headerCount(n, false), null);
  for (const n of [5, 6, 120]) assert.equal(headerCount(n, false), n);
  for (const exact of [true, false]) {
    assert.equal(headerCount(null, exact), null);
    for (const bad of [Number.NaN, Infinity, -1, 2.5]) assert.equal(headerCount(bad, exact), null);
  }
});

test("needsYouText: the line, its plurals, and nothing when there is nothing", () => {
  const t = (pendingRequests: number | null, newFollowersThisWeek: number | null) =>
    needsYouText({ pendingRequests, newFollowersThisWeek });
  assert.equal(t(1, 0), "1 wants to join");
  assert.equal(t(2, 6), "2 want to join · +6 followers this week");
  assert.equal(t(0, 1), "+1 follower this week");
  assert.equal(t(null, 3), "+3 followers this week");
  assert.equal(t(1, null), "1 wants to join");
  assert.equal(t(1, 1), "1 wants to join · +1 follower this week");
  assert.equal(t(1200, 0), "1,200 want to join");
  for (const [p, f] of [[0, 0], [null, null], [0, null], [null, 0]] as const) assert.equal(t(p, f), null);
});

// ── The reads ────────────────────────────────────────────────────────────────

type Call = [string, ...unknown[]];
type Answer = { count?: number | null; error?: unknown; throws?: boolean };

function fakeService(answers: Record<string, Answer>) {
  const queries: { table: string; calls: Call[] }[] = [];
  const client = {
    from(table: string) {
      const q = { table, calls: [] as Call[] };
      queries.push(q);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "not"]) {
        chain[m] = (...args: unknown[]) => (q.calls.push([m, ...args]), chain);
      }
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
        const a = answers[table] ?? {};
        if (a.throws) return Promise.reject(new Error("network")).then(ok, bad);
        return Promise.resolve({ count: a.count ?? null, error: a.error ?? null }).then(ok, bad);
      };
      return chain;
    },
  };
  return { client: client as unknown as Parameters<typeof loadOfficerCounts>[0], queries };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const quietly = async <T,>(fn: () => Promise<T>) => {
  const err = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = err;
  }
};

test("loadOfficerCounts: pending requests and first follows of the last 7 days, head counts only", async () => {
  const { client, queries } = fakeService({ org_join_requests: { count: 2 }, org_followers: { count: 6 } });
  assert.deepEqual(await loadOfficerCounts(client, ORG, NOW), { pendingRequests: 2, newFollowersThisWeek: 6 });
  const req = queries.find((q) => q.table === "org_join_requests")!;
  assert.deepEqual(req.calls, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "org_id", ORG],
    ["eq", "status", "pending"],
  ]);
  const fol = queries.find((q) => q.table === "org_followers")!;
  assert.deepEqual(fol.calls, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "org_id", ORG],
    ["gte", "first_followed_at", new Date(NOW - NEW_FOLLOWER_WINDOW_MS).toISOString()],
  ]);
  assert.equal(new Date(NOW - NEW_FOLLOWER_WINDOW_MS).toISOString(), "2026-10-16T12:00:00.000Z");
});

test("loadOfficerCounts: a failed read is null, never zero, and the other still answers", async () => {
  const errored = fakeService({ org_join_requests: { error: { message: "boom" } }, org_followers: { count: 0 } });
  assert.deepEqual(await quietly(() => loadOfficerCounts(errored.client, ORG, NOW)), {
    pendingRequests: null,
    newFollowersThisWeek: 0,
  });
  const thrown = fakeService({ org_join_requests: { count: 1 }, org_followers: { throws: true } });
  assert.deepEqual(await quietly(() => loadOfficerCounts(thrown.client, ORG, NOW)), {
    pendingRequests: 1,
    newFollowersThisWeek: null,
  });
  const noClock = fakeService({ org_join_requests: { count: 1 }, org_followers: { count: 9 } });
  assert.deepEqual(await loadOfficerCounts(noClock.client, ORG, Number.NaN), { pendingRequests: 1, newFollowersThisWeek: null });
  assert.equal(noClock.queries.some((q) => q.table === "org_followers"), false, "no read without a clock");
});

test("loadOfficerCounts: the officer's block pairs are left out of the pending count, uuids only", async () => {
  const a = "22222222-2222-4222-8222-222222222222";
  const b = "33333333-3333-4333-8333-333333333333";
  const { client, queries } = fakeService({ org_join_requests: { count: 0 }, org_followers: { count: 0 } });
  await loadOfficerCounts(client, ORG, NOW, new Set([a, b, a, "x),status.eq.denied"]));
  const req = queries.find((q) => q.table === "org_join_requests")!;
  assert.deepEqual(req.calls.at(-1), ["not", "user_id", "in", `(${a},${b})`]);
  const none = fakeService({});
  await loadOfficerCounts(none.client, ORG, NOW, []);
  assert.equal(none.queries.find((q) => q.table === "org_join_requests")!.calls.some((c) => c[0] === "not"), false);
});
