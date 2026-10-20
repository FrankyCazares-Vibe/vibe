/**
 * The unread-DM count of `GET /api/me/otto` through `chat_latest_per_channel`
 * (S71 amendment 2, section 3): it used to read one window of `dms * 3` rows
 * shared by every dm, so a busy dm pushed a quiet dm's unread message out and
 * the count dropped. Against fakes of both clients; every other section of
 * the route reads empty. The function itself is tested in SQL
 * (scripts/sql/chat-latest-check.sql).
 *
 * Run with:
 *   node --test src/lib/chat/otto-unread-route.test.ts
 *
 * WHY THE RESOLVE HOOK: the route imports "next/server", the two Supabase
 * clients and a "server-only" helper; each resolves to a small data: module
 * (server-only to an empty one). The rest is the real code.
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
if (typeof registerHooks !== "function") throw new Error("otto-unread-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeOttoCookie; }"),
  "@/lib/supabase/service": dataModule("export function createSupabaseServiceClient() { return globalThis.__vibeOttoService; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const routeSpecifier = "../../app/api/me/otto/route.ts";
const route = (await import(routeSpecifier)) as {
  GET: () => Promise<{ status: number; body: { ok: boolean; counts: { unread: number }; failed?: string[] } }>;
};

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown };
type Logged = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "is", "not", "in", "or", "order", "limit", "gte", "lte", "gt", "lt", "neq"] as const;

function fakeClient(answer: (table: string, calls: Call[]) => Answer, userId: string | null) {
  const log: Logged[] = [];
  const chain = (table: string, calls: Call[]) => {
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    const settle = () => {
      const a = answer(table, calls);
      return { data: a.data ?? null, error: a.error ?? null, count: null };
    };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(settle).then(resolve, reject);
    builder.maybeSingle = () => Promise.resolve().then(() => ({ data: null, error: settle().error }));
    return builder;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
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
  return { client, log };
}
const arg = (calls: Call[], method: string, column?: string): unknown => {
  const call = calls.find((c) => c[0] === method && (column === undefined || c[1] === column));
  return call ? (column === undefined ? call[1] : call[2]) : undefined;
};

const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const CLASSMATE = "33333333-3333-4333-8333-333333333333";
const T = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;
const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };

type Msg = { channel_id: string; user_id: string; created_at: string };
/** A busy dm (12 unread from a friend) and a quiet one (one unread from a classmate). */
const newestFirst: Msg[] = [
  ...Array.from({ length: 12 }, (_, h) => ({ channel_id: "dm-busy", user_id: FRIEND, created_at: T(20, h) })),
  { channel_id: "dm-quiet", user_id: CLASSMATE, created_at: T(10) },
].sort((a, b) => b.created_at.localeCompare(a.created_at));
const dm = (channel_id: string) => ({ channel_id, last_read_at: T(2), accepted_at: T(1), hidden_at: null, channels: { id: channel_id, type: "dm" } });

function install(rpc: (calls: Call[]) => Answer) {
  const cookie = fakeClient((table, calls) => {
    if (table === "channel_members") return { data: [dm("dm-busy"), dm("dm-quiet")] };
    if (table === "messages") {
      const ids = arg(calls, "in", "channel_id") as string[];
      return { data: newestFirst.filter((m) => ids.includes(m.channel_id)).slice(0, arg(calls, "limit") as number) };
    }
    if (table === "rpc:chat_latest_per_channel") return rpc(calls);
    return { data: [] };
  }, ME);
  const service = fakeClient(() => ({ data: [] }), null);
  const g = globalThis as Record<string, unknown>;
  g.__vibeOttoCookie = cookie.client;
  g.__vibeOttoService = service.client;
  return { cookieLog: cookie.log, serviceLog: service.log };
}
const perRoom = (calls: Call[]): Answer => {
  const a = calls[0][1] as { p_channels: string[]; p_per: number };
  return { data: a.p_channels.flatMap((id) => newestFirst.filter((m) => m.channel_id === id).slice(0, a.p_per)) };
};
const quiet = (t: TestContext) => {
  t.mock.method(console, "warn", () => {});
  return t.mock.method(console, "error", () => {});
};

test("otto, per room: one call on the cookie client, 3 rows of EACH dm, no filters; the quiet dm's unread message counts", async () => {
  const { cookieLog, serviceLog } = install(perRoom);
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.counts.unread, 2);
  const calls = cookieLog.filter((l) => l.table === "rpc:chat_latest_per_channel").map((l) => l.calls);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], ["rpc", { p_channels: ["dm-busy", "dm-quiet"], p_per: 3, p_top_level_only: false, p_live_only: false }]);
  assert.equal(arg(calls[0], "select"), "channel_id,user_id,created_at, deleted_at");
  assert.deepEqual(calls[0].find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
  assert.equal(cookieLog.filter((l) => l.table === "messages").length, 0, "no shared window");
  assert.equal(serviceLog.filter((l) => l.table.startsWith("rpc:")).length, 0, "never the service role");
});

test("otto, no migration C: today's shared window, unchanged (and the busy dm hides the quiet one's unread)", async (t) => {
  quiet(t);
  const { cookieLog } = install(() => ({ error: MISSING_FN }));
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.counts.unread, 1);
  const windows = cookieLog.filter((l) => l.table === "messages").map((l) => l.calls);
  assert.equal(windows.length, 1);
  assert.equal(arg(windows[0], "select"), "channel_id,user_id,created_at, deleted_at");
  assert.deepEqual(arg(windows[0], "in", "channel_id"), ["dm-busy", "dm-quiet"]);
  assert.equal(arg(windows[0], "limit"), 6);
});

test("otto, per room: any other error is today's \"dms\" failed section, never a fallback", async (t) => {
  const errors = quiet(t);
  const { cookieLog } = install(() => ({ error: { code: "XX000", message: "boom" } }));
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.counts.unread, 0);
  assert.ok(res.body.failed?.includes("dms"), JSON.stringify(res.body.failed));
  assert.equal(cookieLog.filter((l) => l.table === "messages").length, 0);
  assert.ok(errors.mock.calls.some((c) => c.arguments[0] === "[api/me/otto unread-dms]"));
});

test("otto, a note is nothing to read: a dm whose newest row is a deleted message counts by the row under it", async () => {
  const notes = [
    { channel_id: "dm-busy", user_id: FRIEND, created_at: T(20), deleted_at: T(21) },
    { channel_id: "dm-busy", user_id: ME, created_at: T(19), deleted_at: null },
    { channel_id: "dm-quiet", user_id: CLASSMATE, created_at: T(10), deleted_at: T(11) },
    { channel_id: "dm-quiet", user_id: CLASSMATE, created_at: T(9), deleted_at: null },
  ];
  install((calls) => {
    const a = calls[0][1] as { p_channels: string[] };
    return { data: notes.filter((m) => a.p_channels.includes(m.channel_id)) };
  });
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.counts.unread, 1, "dm-busy: my own message under the note; dm-quiet: the classmate's earlier one is unread");
});
