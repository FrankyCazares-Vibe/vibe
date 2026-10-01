/**
 * The last-message reads of `GET /api/me/threads` (the old thread list, also
 * on production) through `chat_latest_per_channel` (S71 amendment 2,
 * section 3), against fakes of the cookie client. No database here; the
 * function itself is tested in SQL (scripts/sql/chat-latest-check.sql).
 *
 * The case that matters is the verifier's: a stranger's DM REQUEST vanished
 * from Requests while the recipient's other dms were busy, because one
 * window of `ids.length * 5` rows was shared by every dm and the request's
 * only message fell out of it (no inbound message → the phantom-request
 * guard hides it).
 *
 * Run with:
 *   node --test src/lib/chat/threads-list-route.test.ts
 *
 * WHY THE RESOLVE HOOK: the route imports "next/server", "server-only"
 * modules (r2, rate-limit, moderation/access) and the two Supabase clients;
 * each resolves to a small data: module. Everything else the GET runs
 * (`latest-per-room`, `schema`, `room-rules`, `hidden-users`,
 * `org-asset-url`) is the real code.
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
if (typeof registerHooks !== "function") throw new Error("threads-list-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeThreadsCookie; }"),
  "@/lib/supabase/service": dataModule("export function createSupabaseServiceClient() { throw new Error('the list never uses the service role'); }"),
  "@/lib/r2": dataModule(
    "export const GROUP_PHOTO_KEY_PREFIX = 'groups/';\nexport function isR2Configured() { return false; }\n" +
      "export async function signGroupPhotoGetUrl() { throw new Error('unused'); }",
  ),
  "@/lib/rate-limit": dataModule("export async function rateLimit() { return { allowed: true }; }\nexport function tooManyRequests() { return null; }"),
  "@/lib/moderation/access": dataModule("export function contentBlockedResponse() { return null; }\nexport async function requireCanPublish() { return null; }"),
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

type ThreadsBody = { ok: boolean; threads: Entry[]; requests: Entry[] };
type Entry = { id: string; is_request: boolean; last_message: { content: string; user_id: string; created_at: string } | null; unread: boolean };
const routeSpecifier = "../../app/api/me/threads/route.ts";
const route = (await import(routeSpecifier)) as { GET: (req: Request) => Promise<{ status: number; body: ThreadsBody }> };

// ── A fake PostgREST client (the reads-routes.test.ts one) ──────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown };
type Logged = { table: string; calls: Call[] };
type Answerer = (table: string, calls: Call[]) => Answer;
const METHODS = ["select", "eq", "in", "is", "or", "not", "order", "limit", "neq"] as const;

function fakeClient(answer: Answerer, userId: string) {
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
          return { data: a.data ?? null, error: a.error ?? null };
        })
        .then(resolve, reject);
    return builder;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
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

const reads = (log: Logged[], table: string) => log.filter((entry) => entry.table === table);
const arg = (calls: Call[], method: string, column?: string): unknown => {
  const call = calls.find((c) => c[0] === method && (column === undefined || c[1] === column));
  return call ? (column === undefined ? call[1] : call[2]) : undefined;
};

// ── The world ────────────────────────────────────────────────────────────────

const VIEWER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const OFFICER = "44444444-4444-4444-8444-444444444444";
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DM_BUSY = "dm-busy", DM_REQUEST = "dm-request", BOARD = "board-1";
const T = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;
const WIDE = "channel_id, content, created_at, user_id, media_kind, attachment_kind";
const BASE = "channel_id, content, created_at, user_id";
const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };

type Msg = { channel_id: string; content: string; created_at: string; user_id: string; media_kind: null; attachment_kind: null; thread_root_id: string | null; removed_at: string | null };
const msg = (channel_id: string, content: string, created_at: string, user_id: string, over: Partial<Msg> = {}): Msg => ({
  channel_id, content, created_at, user_id, media_kind: null, attachment_kind: null, thread_root_id: null, removed_at: null, ...over,
});
/** A busy dm with a friend, a stranger's request with one older message, a Board whose newest rows are replies. */
const rows = (): Msg[] => [
  ...Array.from({ length: 12 }, (_, h) => msg(DM_BUSY, `busy ${h}`, T(20, h), FRIEND)),
  msg(DM_REQUEST, "hi, I'm in your stats class", T(10), STRANGER),
  msg(BOARD, "Formal on Friday", T(5), OFFICER),
  msg(BOARD, "a reply", T(6), FRIEND, { thread_root_id: "post-1" }),
];

/** Today's shared window (in + is null + newest first + limit) and the function (newest p_per of EACH room). */
function messagesTable(all: Msg[]) {
  const newestFirst = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    window(calls: Call[]): Answer {
      const ids = arg(calls, "in", "channel_id") as string[];
      const nulls = calls.filter((c) => c[0] === "is").map((c) => String(c[1]) as keyof Msg);
      return { data: newestFirst.filter((m) => ids.includes(m.channel_id) && nulls.every((col) => m[col] === null)).slice(0, arg(calls, "limit") as number) };
    },
    perRoom(calls: Call[]): Answer {
      const a = calls[0][1] as { p_channels: string[]; p_per: number; p_top_level_only: boolean; p_live_only: boolean };
      const hits = a.p_channels.flatMap((id) =>
        newestFirst
          .filter((m) => m.channel_id === id && (!a.p_top_level_only || m.thread_root_id === null) && (!a.p_live_only || m.removed_at === null))
          .slice(0, Math.min(Math.max(a.p_per, 1), 20)),
      );
      return { data: hits.sort((x, y) => y.created_at.localeCompare(x.created_at)) };
    },
  };
}

const member = (channel_id: string, type: string, accepted_at: string | null, channels: Record<string, unknown> = {}) => ({
  channel_id, accepted_at, last_read_at: T(1), role: "member", channels: { id: channel_id, type, name: "", org_id: null, kind: null, ...channels },
});
const peer = (channel_id: string, id: string) => ({
  channel_id, user_id: id, last_read_at: null, role: "member", users: { id, handle: id.slice(0, 4), name: `User ${id.slice(0, 4)}`, avatar_url: null, school: null },
});

type World = { rpc?: (calls: Call[]) => Answer; memberships?: (calls: Call[]) => Answer };
function install(world: World = {}) {
  const table = messagesTable(rows());
  const { client, log } = fakeClient((t, calls) => {
    const select = String(arg(calls, "select") ?? "");
    if (t === "channel_members") {
      if (select.includes("users:users!")) return { data: [peer(DM_BUSY, FRIEND), peer(DM_REQUEST, STRANGER), peer(BOARD, OFFICER)] };
      if (select.includes("hidden_at")) return { data: [] };
      if (world.memberships) return world.memberships(calls);
      return { data: [
        member(DM_BUSY, "dm", T(1)),
        member(DM_REQUEST, "dm", null),
        member(BOARD, "org_channel", T(1), { name: "Board", org_id: ORG, kind: "board" }),
      ] };
    }
    if (t === "orgs") return { data: [{ id: ORG, handle: "salsa", name: "Salsa", logo_url: null, banner_url: null, verified: true }] };
    if (t === "org_members") return { data: [{ org_id: ORG, role: "member" }] };
    if (t === "messages") return table.window(calls);
    if (t === "rpc:chat_latest_per_channel") return world.rpc ? world.rpc(calls) : { error: MISSING_FN };
    return { data: [] };
  }, VIEWER);
  (globalThis as Record<string, unknown>).__vibeThreadsCookie = client;
  return { log, table };
}
const get = () => route.GET(new Request("http://localhost/api/me/threads"));
const quiet = (t: TestContext) => {
  t.mock.method(console, "warn", () => {});
  return t.mock.method(console, "error", () => {});
};

// ── The cases ────────────────────────────────────────────────────────────────

test("threads, per room: two calls on the viewer's client, 5 rows of EACH channel, top-level, the wide select; no shared window", async () => {
  const { log, table } = install({ rpc: (calls) => table.perRoom(calls) });
  const res = await get();
  assert.equal(res.status, 200);
  const calls = reads(log, "rpc:chat_latest_per_channel").map((entry) => entry.calls);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][0], ["rpc", { p_channels: [DM_BUSY, DM_REQUEST], p_per: 5, p_top_level_only: true, p_live_only: false }], "the dms and groups");
  assert.deepEqual(calls[1][0], ["rpc", { p_channels: [BOARD], p_per: 5, p_top_level_only: true, p_live_only: false }], "the club rooms");
  for (const c of calls) {
    assert.equal(arg(c, "select"), WIDE);
    assert.deepEqual(c.find((x) => x[0] === "order"), ["order", "created_at", { ascending: false }]);
  }
  assert.equal(reads(log, "messages").length, 0);

  const { threads, requests } = res.body;
  assert.deepEqual(requests.map((e) => [e.id, e.last_message?.content]), [[DM_REQUEST, "hi, I'm in your stats class"]], "the stranger's request stays in Requests");
  assert.equal(requests[0].unread, true);
  const board = threads.find((e) => e.id === BOARD);
  assert.equal(board?.last_message?.content, "Formal on Friday", "a reply under a Board post is never its preview");
  assert.equal(threads.find((e) => e.id === DM_BUSY)?.last_message?.content, "busy 11");
});

test("threads, no migration C: the missing function falls back to today's two shared windows (and the request vanishes, the bug C fixes)", async (t) => {
  quiet(t);
  const { log } = install();
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(reads(log, "rpc:chat_latest_per_channel").length, 2, "the function is tried first");
  const windows = reads(log, "messages").map((entry) => entry.calls);
  assert.equal(windows.length, 2);
  assert.deepEqual(windows.map((c) => arg(c, "in", "channel_id")), [[DM_BUSY, DM_REQUEST], [BOARD]]);
  assert.deepEqual(windows.map((c) => arg(c, "limit")), [10, 5], "today's reads, unchanged");
  for (const c of windows) {
    assert.equal(arg(c, "select"), WIDE);
    assert.deepEqual(c.filter((x) => x[0] === "is"), [["is", "thread_root_id", null]]);
  }
  assert.deepEqual(res.body.requests, [], "the busy dm filled the shared window: today's behaviour, kept until C runs");
});

test("threads, per room: a failed wide read retries the base columns through the function (today's retry), then soft-fails", async (t) => {
  const errors = quiet(t);
  const seen: string[] = [];
  const { log } = install({
    rpc: (calls) => {
      const select = String(arg(calls, "select"));
      seen.push(select);
      return select === WIDE ? { error: { code: "XX000", message: "boom" } } : { data: [msg(DM_REQUEST, "base row", T(10), STRANGER)] };
    },
  });
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual(seen.sort(), [BASE, BASE, WIDE, WIDE]);
  assert.equal(reads(log, "messages").length, 0, "a real error is not a missing function: no shared window");
  assert.deepEqual(res.body.requests.map((e) => e.last_message?.content), ["base row"]);
  assert.ok(errors.mock.calls.some((c) => c.arguments[0] === "[threads.GET lastMsgs]"));

  install({ rpc: () => ({ error: { code: "XX000", message: "boom" } }) });
  const none = await get();
  assert.equal(none.status, 200, "both selects failing still renders the list");
  assert.deepEqual(none.body.requests, [], "no last message: the phantom guard hides the request, as today");
  assert.ok(errors.mock.calls.some((c) => c.arguments[0] === "[threads.GET lastMsgs fallback]"));
});

test("threads, per room, a database without channels.kind: the function is asked without the top-level filter", async (t) => {
  quiet(t);
  let nth = 0;
  const { log, table } = install({
    rpc: (calls) => table.perRoom(calls),
    memberships: () =>
      nth++ === 0
        ? { error: { code: "42703", message: "column channels.kind does not exist" } }
        : { data: [member(DM_BUSY, "dm", T(1)), member(DM_REQUEST, "dm", null)] },
  });
  const res = await get();
  assert.equal(res.status, 200);
  const calls = reads(log, "rpc:chat_latest_per_channel").map((entry) => entry.calls);
  assert.equal(calls.length, 1, "no club rooms listed: one read");
  assert.deepEqual(calls[0][0], ["rpc", { p_channels: [DM_BUSY, DM_REQUEST], p_per: 5, p_top_level_only: false, p_live_only: false }]);
  assert.deepEqual(res.body.requests.map((e) => e.id), [DM_REQUEST]);
});
