/**
 * The FOLLOWER mode of `GET /api/orgs/[slug]/space` (club model, batch 1B;
 * adopted from the session scratchpad by the wave-1 repair, review finding
 * 12): the Board alone, the member count from 5 up, the follower viewer;
 * the database's `can_view_org_channel` (asked as the viewer) is the gate,
 * and a no is the stranger's 403 `members_only` with no Board read.
 *
 * Run with:
 *   node --test src/lib/chat/space-followers.test.ts
 *
 * The test lives here because `npm test` globs `src/**` and a path with
 * `[slug]` in it never matches (the rpc-refusal.test.ts precedent).
 *
 * WHY THE RESOLVE HOOK: the route imports "next/server", "server-only", the
 * two Supabase clients, the chat flag, event refs, rooms and message-read;
 * each resolves to a small data: module that answers from `globalThis`
 * (the reads-routes.test.ts harness). ONE PART OF `rooms.ts` IS REAL: the
 * memory of a missing `post_policy` column, forgotten by `install`.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("reads-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
/** The real rooms.ts, by its absolute URL: a data: module resolves nothing relative. */
const ROOMS_URL = new URL("lib/chat/rooms.ts", SRC_ROOT).href;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeCookie; }"),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { if (!globalThis.__vibeService) throw new Error('no service'); return globalThis.__vibeService; }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__vibeService !== undefined; }",
  ),
  "@/lib/chat/flag-server": dataModule(
    "export async function chatV2For(id) { globalThis.__vibeFlagAskedFor = id; return globalThis.__vibeFlag === true; }",
  ),
  "@/lib/chat/event-refs": dataModule(
    "export async function eventRefsFor(events, viewerId, opts) { return globalThis.__vibeEventRefsFor(events, viewerId, opts); }",
  ),
  "@/lib/chat/rooms": dataModule(
    "export async function loadRoom(id) { return globalThis.__vibeLoadRoom(id); }\n" +
      `export { postPolicyColumnMissing, notePostPolicyColumnMissing, forgetPostPolicyColumnMissing } from ${JSON.stringify(ROOMS_URL)};`,
  ),
  "@/lib/chat/message-read": dataModule(
    "export async function readChatMessages(client, channelId, opts, known) { return globalThis.__vibeReadChatMessages(client, channelId, opts, known); }",
  ),
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

type Handler = (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<{ status: number; body: Record<string, unknown> }>;
/** The follower /space answer, as far as these tests read it. */
type SpaceBody = {
  viewer: unknown;
  org: { member_count: number | null };
  rooms: unknown[];
  board_latest: { id: string };
  board_recent: { id: string }[];
  up_next: { id: string }[];
  upcoming: { id: string }[];
};
const spaceSpecifier = new URL("app/api/orgs/%5Bslug%5D/space/route.ts", SRC_ROOT).href;
const space = (await import(spaceSpecifier)) as { GET: Handler };
const { forgetPostPolicyColumnMissing } = (await import(
  ROOMS_URL
)) as typeof import("./rooms");
type EventRef = import("./types").EventRef;
type EventRow = import("./event-refs").EventRow;

// ── A fake PostgREST client ──────────────────────────────────────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown; count?: number | null };
type Logged = { table: string; calls: Call[] };
type Answerer = (table: string, calls: Call[], nth: number) => Answer;

const METHODS = ["select", "eq", "in", "is", "or", "not", "order", "limit", "neq", "gte", "lte", "lt", "gt"] as const;

/**
 * Each `from()` starts a fresh chain; awaiting it asks `answer(table, calls, nth)` — `nth` counts the reads of that table.
 * `rpc(fn, args)` is logged and answered as the table `rpc:<fn>`, its first call `["rpc", args]` (the event-refs.test.ts idiom).
 */
function fakeClient(answer: Answerer, userId: string | null) {
  const log: Logged[] = [];
  const seen = new Map<string, number>();
  const settle = (table: string, calls: Call[], nth: number) => {
    const a = answer(table, calls, nth);
    return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (table: string, calls: Call[], nth: number) => {
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(() => settle(table, calls, nth)).then(resolve, reject);
    builder.maybeSingle = () =>
      Promise.resolve().then(() => {
        const r = settle(table, calls, nth);
        const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
        return { data: rows[0] ?? null, error: r.error };
      });
    return builder;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: userId ? null : { message: "no session" } }) },
    from(table: string) {
      const nth = seen.get(table) ?? 0;
      seen.set(table, nth + 1);
      const calls: Call[] = [];
      log.push({ table, calls });
      return chain(table, calls, nth);
    },
    rpc(fn: string, args: unknown) {
      const table = `rpc:${fn}`;
      const nth = seen.get(table) ?? 0;
      seen.set(table, nth + 1);
      const calls: Call[] = [["rpc", args]];
      log.push({ table, calls });
      return chain(table, calls, nth);
    },
  };
  return { client, log };
}

type World = {
  cookie?: Answerer;
  /**
   * The cookie client's `rpc:<fn>` answers. Absent: every function is missing
   * (`PGRST202`, a database without migration C), so the per-room reads fall
   * back to today's shared windows and the older cases read as they always did.
   */
  rpc?: Answerer;
  service?: Answerer | null;
  user?: string | null;
  flag?: boolean;
  refs?: (events: EventRow[], viewerId: string, opts?: { counts?: boolean }) => Promise<Map<string, EventRef> | null>;
  loadRoom?: (id: string) => Promise<unknown>;
  read?: (client: unknown, channelId: string, opts: unknown, known: unknown) => Promise<unknown>;
};

/** Every EventRef of the rows given, `state` "soon", `room_id` = "room-of-" + id. */
async function plainRefs(events: EventRow[]): Promise<Map<string, EventRef>> {
  const refs = new Map<string, EventRef>();
  for (const ev of events) {
    refs.set(ev.id, {
      id: ev.id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, location: ev.location ?? "",
      state: "soon", room_id: `room-of-${ev.id}`, viewer_status: null, going_count: 0, maybe_count: 0,
    });
  }
  return refs;
}

const g = globalThis as unknown as Record<string, unknown>;

/** Install the fakes and forget a missing `post_policy` column; returns the two logs. */
function install(world: World) {
  forgetPostPolicyColumnMissing();
  const cookieAnswer = world.cookie ?? (() => ({ data: [] }));
  const rpcAnswer = world.rpc ?? (() => ({ error: MISSING_FN }));
  const cookie = fakeClient(
    (table, calls, nth) => (table.startsWith("rpc:") ? rpcAnswer(table, calls, nth) : cookieAnswer(table, calls, nth)),
    world.user === undefined ? VIEWER : world.user,
  );
  const service = world.service === null ? null : fakeClient(world.service ?? (() => ({ data: [] })), null);
  g.__vibeCookie = cookie.client;
  g.__vibeService = service ? service.client : undefined;
  g.__vibeFlag = world.flag ?? true;
  g.__vibeEventRefsFor = world.refs ?? plainRefs;
  g.__vibeLoadRoom = world.loadRoom ?? (async () => null);
  g.__vibeReadChatMessages = world.read ?? (async () => ({ ok: true, messages: [], room: null, viewerRole: null }));
  return { cookieLog: cookie.log, serviceLog: service ? service.log : [] };
}

const reads = (log: Logged[], table: string) => log.filter((entry) => entry.table === table);
const arg = (calls: Call[], method: string, column?: string): unknown => {
  const call = calls.find((c) => c[0] === method && (column === undefined || c[1] === column));
  return call ? (column === undefined ? call[1] : call[2]) : undefined;
};

const VIEWER = "11111111-1111-4111-8111-111111111111";
const ORG1 = "aaaaaaaa-0000-4000-8000-000000000001";
const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };
const req = (url = "http://localhost/api/x") => new Request(url);
const ctx = (slug = "salsa") => ({ params: Promise.resolve({ slug }) });


// ── The follower's space (batch 1B scratch checks) ──────────────────────────
const T = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;

const BOARD_ID = "cccccccc-0000-4000-8000-0000000000b0";
const BOARD_ROOM = { id: BOARD_ID, kind: "board", name: "Board", org_id: ORG1, event: null };
const org = (hidden_at: string | null = null) => ({ id: ORG1, handle: "salsa", name: "Salsa", logo_url: null, banner_url: null, verified: false, hidden_at });
const ev = (id: string, day: number) => ({ id, title: id, starts_at: T(day), ends_at: T(day, 12), location: null, org_id: ORG1 });
const followerService = (count: number | null, board = true): Answerer => (table, calls, nth) => {
  if (table === "orgs") return { data: [org()] };
  if (table === "org_members") return nth === 0 ? { data: [] } : count === null ? { error: { code: "XX000", message: "boom" } } : { count };
  if (table === "channels") {
    assert.equal(arg(calls, "eq", "kind"), "board");
    assert.equal(arg(calls, "eq", "org_id"), ORG1);
    return { data: board ? [{ id: BOARD_ID, name: "Board" }] : [] };
  }
  if (table === "events") return { data: [ev("ev-a", 9), ev("ev-b", 10)] };
  return { data: [] };
};
const page = async () => ({
  ok: true,
  messages: [{ id: "p1", hidden: false, removed: null }, { id: "p2", hidden: false, removed: null }],
  room: BOARD_ROOM, viewerRole: null, viewerStanding: "follower",
});
const followerWorld = (over: Partial<World> = {}) =>
  install({
    service: followerService(42),
    rpc: (t, calls) => {
      if (t !== "rpc:can_view_org_channel") return { error: { code: "XX000", message: "unexpected rpc" } };
      assert.deepEqual(calls[0][1], { cid: BOARD_ID, uid: VIEWER });
      return { data: true };
    },
    loadRoom: async () => BOARD_ROOM,
    read: page,
    ...over,
  });

test("follower space: the Board alone, the latest posts, the events, the count from 5 up, the follower viewer", async () => {
  const seen: unknown[] = [];
  const { cookieLog } = followerWorld({ read: async (_c, id, opts, known) => { seen.push([id, opts, known]); return page(); } });
  const res = await space.GET(req("http://localhost/api/orgs/salsa/space?panel=1&events=1"), ctx());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body as SpaceBody;
  assert.deepEqual(body.viewer, { role: null, standing: "follower", can_moderate: false });
  assert.equal(body.org.member_count, 42);
  assert.deepEqual(body.rooms, [{ id: BOARD_ID, kind: "board", name: "Board", unread: false, can_post: false, event: null, locked: false, post_policy: "everyone" }]);
  assert.equal(body.board_latest.id, "p2");
  assert.deepEqual(body.board_recent.map((m: { id: string }) => m.id), ["p2", "p1"]);
  assert.deepEqual(body.up_next.map((e: { id: string }) => e.id), ["ev-a", "ev-b"]);
  assert.deepEqual(body.upcoming.map((e: { id: string }) => e.id), ["ev-a", "ev-b"]);
  assert.equal(reads(cookieLog, "channels").length, 0, "the member rooms read is never made for a follower");
  assert.equal(reads(cookieLog, "channel_members").length, 0);
  assert.deepEqual(seen, [[BOARD_ID, { limit: 6 }, { viewerId: VIEWER, access: { ok: true, isOrgChannel: true, orgId: ORG1, accepted_at: null, cleared_at: null, kind: "board", eventId: null }, room: BOARD_ROOM }]]);
});

test("follower space: below 5 or a failed count is null; no Board, a no, a missing function: 403; another error: 500; Board unreadable: 503", async () => {
  followerWorld({ service: followerService(4) });
  assert.equal(((await space.GET(req(), ctx())).body as SpaceBody).org.member_count, null);
  followerWorld({ service: followerService(null) });
  assert.equal(((await space.GET(req(), ctx())).body as SpaceBody).org.member_count, null);
  followerWorld({ service: followerService(42, false) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 403, body: { ok: false, error: "Members only.", code: "members_only" } });
  // The club HAS a Board and the database says no (removed, barred, blocked,
  // unverified, the switch off): the same 403 a stranger gets, and the
  // Board is never read (the database gate is what this pins).
  let boardRead = false;
  followerWorld({ rpc: () => ({ data: false }), read: async () => ((boardRead = true), page()) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 403, body: { ok: false, error: "Members only.", code: "members_only" } });
  assert.equal(boardRead, false, "no Board read past a database no");
  followerWorld({ rpc: () => ({ error: MISSING_FN }) });
  assert.equal((await space.GET(req(), ctx())).status, 403);
  followerWorld({ rpc: () => ({ error: { code: "XX000", message: "boom" } }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Couldn't load this club.", code: "load_failed" } });
  followerWorld({ loadRoom: async () => null });
  assert.equal((await space.GET(req(), ctx())).status, 503);
  followerWorld({ read: async () => ({ ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } }) });
  assert.equal((await space.GET(req(), ctx())).status, 503);
  followerWorld({ service: (t, c, n) => (t === "orgs" ? { data: [org(T(1))] } : followerService(42)(t, c, n)) });
  assert.equal((await space.GET(req(), ctx())).status, 404, "a hidden club is not there, follower or not");
});
