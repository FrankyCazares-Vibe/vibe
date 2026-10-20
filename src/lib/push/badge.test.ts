/**
 * The thread half of `loadBadgeCounts` (badge.ts) through
 * `chat_latest_per_channel` (S71 amendment 2, section 3): the app-icon count
 * used to read one window of `threads * 5` rows shared by every chat, so a
 * busy chat pushed a quiet one's unread message out and the icon undercounted.
 * Against a fake client; the function itself is tested in SQL
 * (scripts/sql/chat-latest-check.sql).
 *
 * Run with:
 *   node --test src/lib/push/badge.test.ts
 *
 * WHY THE RESOLVE HOOK: badge.ts imports "server-only" (an empty module
 * here), `@/` paths and extensionless relative ones.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("badge.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./badge.ts";
const { loadBadgeCounts } = (await import(specifier)) as typeof import("./badge");
type Client = Parameters<typeof loadBadgeCounts>[0];
type Hidden = NonNullable<Parameters<typeof loadBadgeCounts>[2]>;

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown; count?: number | null };
type Logged = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "is", "not", "in", "or", "order", "limit"] as const;

/** `from()` and `rpc()` chains that log their calls and answer `answer(table, calls)`; `rpc:<fn>` for a function. */
function fakeClient(answer: (table: string, calls: Call[]) => Answer) {
  const log: Logged[] = [];
  const chain = (table: string, calls: Call[]) => {
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => {
          const a = answer(table, calls);
          return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
        })
        .then(resolve, reject);
    return builder;
  };
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      return chain(table, calls);
    },
    rpc(fn: string, args: unknown) {
      const calls: Call[] = [["rpc", args]];
      log.push({ table: `rpc:${fn}`, calls });
      return chain(`rpc:${fn}`, calls);
    },
  };
  return { client: client as unknown as Client, log };
}
const arg = (calls: Call[], method: string, column?: string): unknown => {
  const call = calls.find((c) => c[0] === method && (column === undefined || c[1] === column));
  return call ? (column === undefined ? call[1] : call[2]) : undefined;
};

const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const CLASSMATE = "33333333-3333-4333-8333-333333333333";
const T = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;
const NOBODY_HIDDEN: Hidden = { blocked: new Set(), muted: new Set(), ids: [] };
const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };

type Msg = { channel_id: string; user_id: string; created_at: string; removed_at: string | null };
/** A busy dm (12 unread from a friend), a quiet dm (one unread from a classmate), my removed reply in the quiet one. */
const MESSAGES: Msg[] = [
  ...Array.from({ length: 12 }, (_, h) => ({ channel_id: "dm-busy", user_id: FRIEND, created_at: T(20, h), removed_at: null })),
  { channel_id: "dm-quiet", user_id: CLASSMATE, created_at: T(10), removed_at: null },
  { channel_id: "dm-quiet", user_id: ME, created_at: T(11), removed_at: T(11, 1) },
];
const newestFirst = [...MESSAGES].sort((a, b) => b.created_at.localeCompare(a.created_at));
const member = (channel_id: string, type: string, org_id: string | null = null) => ({
  channel_id, accepted_at: T(1), last_read_at: T(2), hidden_at: null, muted_until: null, channels: { type, org_id },
});

function world(rpc: (calls: Call[]) => Answer) {
  return fakeClient((table, calls) => {
    if (table === "notifications") return { count: 0 };
    if (table === "channel_members") return { data: [member("dm-busy", "dm"), member("dm-quiet", "dm"), member("club-board", "org_channel", "org-1")] };
    if (table === "messages") {
      // Today's shared window, as PostgREST runs it.
      const ids = arg(calls, "in", "channel_id") as string[];
      const live = calls.some((c) => c[0] === "is" && c[1] === "removed_at");
      return { data: newestFirst.filter((m) => ids.includes(m.channel_id) && (!live || m.removed_at === null)).slice(0, arg(calls, "limit") as number) };
    }
    if (table === "rpc:chat_latest_per_channel") return rpc(calls);
    return { data: [] };
  });
}
/** The function: the newest `p_per` rows of EACH channel. */
const perRoom = (calls: Call[]): Answer => {
  const a = calls[0][1] as { p_channels: string[]; p_per: number; p_live_only: boolean };
  return { data: a.p_channels.flatMap((id) => newestFirst.filter((m) => m.channel_id === id && (!a.p_live_only || m.removed_at === null)).slice(0, a.p_per)) };
};
const quiet = (t: TestContext) => t.mock.method(console, "warn", () => {});

test("badge, per room: one call on the client given, 5 rows of EACH chat, live only; the quiet chat's unread message counts", async () => {
  const { client, log } = world(perRoom);
  const res = await loadBadgeCounts(client, ME, NOBODY_HIDDEN);
  assert.deepEqual(res, { ok: true, notifications: 0, messages: 2, total: 2 });
  const calls = log.filter((l) => l.table === "rpc:chat_latest_per_channel").map((l) => l.calls);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], ["rpc", { p_channels: ["dm-busy", "dm-quiet"], p_per: 5, p_top_level_only: false, p_live_only: true }], "a club room never reaches the read");
  assert.equal(arg(calls[0], "select"), "channel_id, user_id, created_at, deleted_at");
  assert.deepEqual(calls[0].find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
  assert.equal(log.filter((l) => l.table === "messages").length, 0, "no shared window");
});

test("badge, no migration C: today's shared window answers, unchanged (and undercounts: the busy chat fills it)", async (t) => {
  quiet(t);
  const { client, log } = world(() => ({ error: MISSING_FN }));
  const res = await loadBadgeCounts(client, ME, NOBODY_HIDDEN);
  assert.deepEqual(res, { ok: true, notifications: 0, messages: 1, total: 1 });
  const windows = log.filter((l) => l.table === "messages").map((l) => l.calls);
  assert.equal(windows.length, 1);
  assert.equal(arg(windows[0], "select"), "channel_id, user_id, created_at, deleted_at");
  assert.deepEqual(arg(windows[0], "in", "channel_id"), ["dm-busy", "dm-quiet"]);
  assert.deepEqual(windows[0].filter((c) => c[0] === "is"), [["is", "removed_at", null]]);
  assert.equal(arg(windows[0], "limit"), 10);
});

test("badge, per room: any other error is today's { ok: false } (the dispatcher leaves the badge out), never a fallback", async () => {
  const boom = { code: "XX000", message: "boom" };
  const { client, log } = world(() => ({ error: boom }));
  assert.deepEqual(await loadBadgeCounts(client, ME, NOBODY_HIDDEN), { ok: false, error: boom });
  assert.equal(log.filter((l) => l.table === "messages").length, 0);
});

// ── A deleted message (the "Message deleted" note, Oct 19, 2026) ────────────

/** A note on top of each chat: over my own reply (dm-mine), over the friend's unread message (dm-theirs). */
const NOTES = [
  { channel_id: "dm-mine", user_id: FRIEND, created_at: T(10), removed_at: null, deleted_at: T(11) },
  { channel_id: "dm-mine", user_id: ME, created_at: T(9), removed_at: null, deleted_at: null },
  { channel_id: "dm-theirs", user_id: FRIEND, created_at: T(10), removed_at: null, deleted_at: T(11) },
  { channel_id: "dm-theirs", user_id: FRIEND, created_at: T(9), removed_at: null, deleted_at: null },
];
function noteWorld(noColumn: boolean) {
  return fakeClient((table, calls) => {
    if (table === "notifications") return { count: 0 };
    if (table === "channel_members") return { data: [member("dm-mine", "dm"), member("dm-theirs", "dm")] };
    const select = String(arg(calls, "select") ?? "");
    if (noColumn && select.includes("deleted_at")) return { error: { code: "42703", message: "column messages.deleted_at does not exist" } };
    if (table === "rpc:chat_latest_per_channel") {
      const a = calls[0][1] as { p_channels: string[] };
      return { data: NOTES.filter((m) => a.p_channels.includes(m.channel_id)).map((m) => (noColumn ? { ...m, deleted_at: undefined } : m)) };
    }
    return { data: [] };
  });
}

test("badge, a note is nothing to read: the newest row that is not a note decides", async () => {
  const { client } = noteWorld(false);
  assert.deepEqual(await loadBadgeCounts(client, ME, NOBODY_HIDDEN), { ok: true, notifications: 0, messages: 1, total: 1 }, "dm-theirs only");
});

test("badge, a database without deleted_at: the read is made again without it (no notes there, today's count)", async (t) => {
  quiet(t);
  const { client, log } = noteWorld(true);
  assert.deepEqual(await loadBadgeCounts(client, ME, NOBODY_HIDDEN), { ok: true, notifications: 0, messages: 2, total: 2 });
  const selects = log.filter((l) => l.table === "rpc:chat_latest_per_channel").map((l) => arg(l.calls, "select"));
  assert.deepEqual(selects, ["channel_id, user_id, created_at, deleted_at", "channel_id, user_id, created_at"]);
});
