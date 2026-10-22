/**
 * Stub-harness tests for the three reads of wave 2
 * (handoffs/chat-redesign/wave-2-contracts.md section 7, W2-B4): the
 * decision table of `GET /api/me/inbox`, `GET /api/orgs/[slug]/space` and
 * the three calendar fields, against fakes of the cookie client and the
 * service client. No database exists here (13.3, "stub harness").
 *
 * Run with:
 *   node --test src/lib/chat/reads-routes.test.ts
 *
 * The test lives here because `npm test` globs `src/**` and a path with
 * `[slug]` in it never matches (the rpc-refusal.test.ts precedent).
 *
 * WHY THE RESOLVE HOOK: the routes import "next/server", "server-only",
 * "@/lib/supabase/server", "@/lib/supabase/service", "@/lib/chat/flag-server",
 * "@/lib/chat/event-refs", "@/lib/chat/rooms" and "@/lib/chat/message-read";
 * each resolves to a small data: module that answers from `globalThis`.
 * Everything else (`reads`, `stub`, `blocks`, `room-rules`, `schema`,
 * `org-asset-url`) is the real code.
 *
 * ONE PART OF `rooms.ts` IS REAL: the memory of a missing `post_policy`
 * column (wave-3 contract 4.2). The stub of "@/lib/chat/rooms" fakes
 * `loadRoom` and re-exports the three memory functions from the file itself,
 * so the route and this test share one memory. `install` forgets it, so no
 * case inherits another's.
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
    'export const EVENT_REF_COLUMNS = "id, title, starts_at, ends_at, location, org_id, visibility"; export async function eventRefsFor(events, viewerId, opts) { return globalThis.__vibeEventRefsFor(events, viewerId, opts); }',
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
const inboxSpecifier = "../../app/api/me/inbox/route.ts";
const spaceSpecifier = "../../app/api/orgs/[slug]/space/route.ts";
const calendarSpecifier = "../../app/api/me/calendar/route.ts";
const inbox = (await import(inboxSpecifier)) as { GET: Handler };
const space = (await import(spaceSpecifier)) as { GET: Handler };
const calendar = (await import(calendarSpecifier)) as { GET: Handler };
const { forgetPostPolicyColumnMissing, notePostPolicyColumnMissing, postPolicyColumnMissing } = (await import(
  ROOMS_URL
)) as typeof import("./rooms");
type EventRef = import("./types").EventRef;
type EventRow = import("./event-refs").EventRow;
type InboxClub = import("./types").InboxClub;
type SpaceResponse = import("./types").SpaceResponse;
type SpaceRoom = import("./types").SpaceRoom;

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
const selectOf = (calls: Call[]) => String(arg(calls, "select") ?? "");

const VIEWER = "11111111-1111-4111-8111-111111111111";
const BLOCKED = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ORG1 = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG2 = "aaaaaaaa-0000-4000-8000-000000000002";
const MISSING_KIND = { code: "42703", message: "column channels.kind does not exist" };
const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };
const req = (url = "http://localhost/api/x") => new Request(url);
const ctx = (slug = "salsa") => ({ params: Promise.resolve({ slug }) });

// ── GET /api/me/inbox (7.1) ──────────────────────────────────────────────────

const B1 = "b1", L1 = "l1", E1 = "e1", B2 = "b2", L2 = "l2";
const T = (day: number, hour = 10) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+00:00`;
const membership = (channel_id: string, org_id: string, kind: string, over: Record<string, unknown> = {}) => ({
  channel_id, created_at: T(1), last_read_at: T(2), pinned_at: null, muted_until: null, channels: { id: channel_id, org_id, kind, name: kind }, ...over,
});
const inboxRows = () => [
  membership(B1, ORG1, "board"),
  membership(L1, ORG1, "lounge", { pinned_at: null, muted_until: T(20), last_read_at: null }),
  membership(E1, ORG1, "event"),
  membership(B2, ORG2, "board"),
  membership(L2, ORG2, "lounge", { pinned_at: T(5) }),
  membership("b3", "org-3", "board"), // no lounge row: left out
];
const orgRow = (id: string, name: string) => ({ id, handle: name.toLowerCase(), name, logo_url: `orgs/${id}/logo.png`, banner_url: null, verified: id === ORG1 });

/** The happy world of the inbox: two clubs, one blocked person, an officer's Board post by them. */
const inboxCookie: Answerer = (table, calls, nth) => {
  if (table === "channel_members") return { data: inboxRows() };
  if (table === "orgs") return { data: [orgRow(ORG1, "Salsa"), orgRow(ORG2, "Chess")] };
  if (table === "org_members") return { data: [{ org_id: ORG1, role: "member" }, { org_id: ORG2, role: "admin" }] };
  if (table === "blocks") return { data: [{ blocker_id: VIEWER, blocked_id: BLOCKED }] };
  if (table === "messages") {
    const ids = arg(calls, "in", "channel_id") as string[];
    if (ids.includes(B1)) {
      return { data: [
        { id: "m-b1-new", channel_id: B1, content: "Officer news", created_at: T(9), user_id: BLOCKED, kind: "text", thread_root_id: null, users: { name: "Blocked Officer" } },
        { id: "m-b1-old", channel_id: B1, content: "Older", created_at: T(8), user_id: OTHER, kind: "text", thread_root_id: null, users: { name: "Ann" } },
        { id: "m-b2", channel_id: B2, content: "Poll: lunch?", created_at: T(7), user_id: BLOCKED, kind: "poll", thread_root_id: null, users: { name: "Blocked Member" } },
      ] };
    }
    if (ids.includes(L1)) {
      return { data: [
        { id: "m-l1-hidden", channel_id: L1, content: "hidden", created_at: T(10), user_id: BLOCKED, kind: "text", thread_root_id: null, users: { name: "X" } },
        { id: "m-l1", channel_id: L1, content: "hey", created_at: T(6), user_id: OTHER, kind: "event_card", thread_root_id: null, users: null },
      ] };
    }
    if (ids.includes(E1)) return { data: [{ channel_id: E1, created_at: T(12) }, { channel_id: E1, created_at: T(11) }] };
    void nth;
    return { data: [] };
  }
  return { data: [] };
};
const inboxService: Answerer = (table, calls) => {
  if (table === "org_members") return { data: [{ org_id: ORG1, user_id: BLOCKED, role: "admin" }, { org_id: ORG2, user_id: BLOCKED, role: "member" }] };
  if (table === "messages") {
    const channel = arg(calls, "eq", "channel_id");
    return { count: channel === B1 ? 2 : channel === L1 ? 150 : 0 };
  }
  if (table === "events") return { data: [
    { id: "ev-1", title: "Formal", starts_at: T(15), ends_at: T(15, 12), location: "Hall", org_id: ORG1 },
    { id: "ev-1b", title: "Later", starts_at: T(16), ends_at: T(16, 12), location: null, org_id: ORG1 },
    { id: "ev-2", title: "Blitz", starts_at: T(17), ends_at: T(17, 12), location: "", org_id: ORG2 },
  ] };
  return { data: [] };
};
const inboxWorld = () => install({ cookie: inboxCookie, service: inboxService });

test("inbox: 401 without a session; 404 not_found with the flag off", async () => {
  install({ user: null });
  assert.deepEqual(await inbox.GET(req(), ctx()), { status: 401, body: { ok: false, error: "Unauthorized" } });
  install({ flag: false });
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { ok: false, error: "That's not there anymore.", code: "not_found" });
  assert.equal(g.__vibeFlagAskedFor, VIEWER);
});

test("inbox: a database without A (no channels.kind) is read again without kind and answers clubs: []", async () => {
  const { cookieLog } = install({
    cookie: (table, calls, nth) => (table === "channel_members" && nth === 0 ? { error: MISSING_KIND } : { data: [membership(B1, ORG1, "board")] }),
  });
  assert.deepEqual(await inbox.GET(req(), ctx()), { status: 200, body: { ok: true, clubs: [] } });
  const [first, second] = reads(cookieLog, "channel_members");
  assert.match(selectOf(first.calls), /channels!inner\(id, org_id, kind, name\)/);
  assert.match(selectOf(second.calls), /channels!inner\(id, org_id, name\)/);
  assert.deepEqual(first.calls.find((c) => c[0] === "not"), ["not", "channels.org_id", "is", null]);
  assert.equal(arg(first.calls, "eq", "user_id"), VIEWER);
});

test("inbox: the reads that decide what is shown fail closed with 500", async () => {
  const fails = async (world: World) => {
    install(world);
    assert.deepEqual(await inbox.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Request failed" } });
  };
  await fails({ cookie: (table) => (table === "channel_members" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  await fails({ cookie: (table) => (table === "channel_members" ? { data: inboxRows() } : table === "orgs" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  await fails({ cookie: (table) => (table === "channel_members" ? { data: inboxRows() } : table === "org_members" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  await fails({ cookie: (table) => (table === "channel_members" ? { data: inboxRows() } : table === "blocks" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
});

test("inbox: no club rooms at all answers clubs: [] without further reads", async () => {
  const { cookieLog } = install({ cookie: () => ({ data: [] }) });
  assert.deepEqual(await inbox.GET(req(), ctx()), { status: 200, body: { ok: true, clubs: [] } });
  assert.equal(cookieLog.length, 1);
});

test("inbox: the happy path, field by field (7.1.2-7.1.9)", async () => {
  const { cookieLog, serviceLog } = inboxWorld();
  const asked: unknown[] = [];
  g.__vibeEventRefsFor = async (events: EventRow[], viewerId: string, opts?: unknown) => {
    asked.push([events.map((e) => e.id), viewerId, opts]);
    return plainRefs(events);
  };
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  const clubs = res.body.clubs as InboxClub[];
  assert.deepEqual(clubs.map((c) => c.org.id), [ORG2, ORG1], "the pinned club first, then by activity");

  const salsa = clubs[1];
  assert.deepEqual(salsa.org, { id: ORG1, handle: "salsa", name: "Salsa", logo_url: "/api/orgs/salsa/asset/logo?v=logo.png", banner_url: null, verified: true });
  assert.equal(salsa.viewer_role, "member");
  assert.deepEqual(salsa.board, {
    room_id: B1,
    latest: { id: "m-b1-new", text: "Officer news", author_name: "Blocked Officer", created_at: T(9), kind: "text" },
    unread: true,
  });
  assert.deepEqual(salsa.lounge, { room_id: L1, latest: { id: "m-l1", text: "hey", author_name: "", created_at: T(6), kind: "event_card" }, unread_count: 99 });
  assert.equal(salsa.next_event?.id, "ev-1");
  assert.equal(salsa.last_activity_at, T(12), "the event room's newest message wins");
  assert.equal(salsa.pinned_at, null);
  assert.equal(salsa.muted_until, T(20));

  const chess = clubs[0];
  assert.equal(chess.viewer_role, "admin");
  assert.deepEqual(chess.board, { room_id: B2, latest: null, unread: false }, "a blocked member's Board post is skipped, no other row in the window");
  assert.deepEqual(chess.lounge, { room_id: L2, latest: null, unread_count: 0 });
  assert.equal(chess.next_event?.id, "ev-2");
  assert.equal(chess.last_activity_at, null);
  assert.equal(chess.pinned_at, T(5));
  assert.equal(chess.org.verified, false);

  // The reads, as 7.1 pins them.
  const previews = reads(cookieLog, "messages");
  assert.equal(previews.length, 3);
  for (const window of previews.slice(0, 2)) {
    assert.equal(selectOf(window.calls), "id, channel_id, content, created_at, user_id, kind, thread_root_id, attachment_kind, users:users!messages_user_id_fkey(name)");
    assert.deepEqual(window.calls.filter((c) => c[0] === "is"), [["is", "thread_root_id", null], ["is", "removed_at", null]], "top-level, and never the viewer's own removed row (7.1.4)");
    assert.deepEqual(window.calls.find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
    assert.equal(arg(window.calls, "limit"), 10);
  }
  assert.deepEqual(arg(previews[0].calls, "in", "channel_id"), [B1, B2]);
  assert.deepEqual(arg(previews[1].calls, "in", "channel_id"), [L1, L2]);
  assert.equal(selectOf(previews[2].calls), "channel_id, created_at");
  assert.deepEqual(arg(previews[2].calls, "in", "channel_id"), [E1]);
  assert.deepEqual(previews[2].calls.filter((c) => c[0] === "is"), [["is", "thread_root_id", null], ["is", "removed_at", null]], "the event-activity read skips removed rows too (7.1.7)");
  assert.equal(arg(previews[2].calls, "limit"), 3);

  const officers = reads(serviceLog, "org_members");
  assert.equal(officers.length, 1);
  assert.equal(selectOf(officers[0].calls), "org_id, user_id, role");
  assert.deepEqual(arg(officers[0].calls, "in", "user_id"), [BLOCKED]);
  assert.deepEqual(arg(officers[0].calls, "in", "org_id"), [ORG1, ORG2]);

  const counts = reads(serviceLog, "messages");
  assert.equal(counts.length, 4);
  const since = new Map<unknown, unknown>();
  for (const count of counts) {
    assert.deepEqual(count.calls[0], ["select", "id", { count: "exact", head: true }]);
    // A deleted message's note is nothing new to read (B7 review, Oct 19, 2026).
    assert.deepEqual(count.calls.filter((c) => c[0] === "is"), [["is", "thread_root_id", null], ["is", "removed_at", null], ["is", "deleted_at", null]]);
    assert.deepEqual(count.calls.find((c) => c[0] === "neq"), ["neq", "user_id", VIEWER]);
    since.set(arg(count.calls, "eq", "channel_id"), arg(count.calls, "gt", "created_at"));
  }
  assert.equal(since.get(B1), T(2), "my last_read_at");
  assert.equal(since.get(L1), T(1), "a null last_read_at reads as my row's created_at");

  const events = reads(serviceLog, "events");
  assert.equal(events.length, 1);
  assert.equal(selectOf(events[0].calls), "id, title, starts_at, ends_at, location, org_id, visibility");
  assert.deepEqual(arg(events[0].calls, "in", "org_id"), [ORG1, ORG2]);
  assert.equal(typeof arg(events[0].calls, "gt", "ends_at"), "string");
  assert.deepEqual(events[0].calls.find((c) => c[0] === "order"), ["order", "starts_at", { ascending: true }]);
  assert.equal(arg(events[0].calls, "limit"), 20);
  assert.deepEqual(asked, [[["ev-1", "ev-2"], VIEWER, undefined]], "eventRefsFor over the first event per club, counts on");
});

test("inbox: a database without deleted_at (20261019150000) counts as before: the count is asked again without the filter (B7 review, Oct 19, 2026)", async () => {
  const noColumn = { error: { code: "42703", message: "column messages.deleted_at does not exist" } };
  const { serviceLog } = install({
    cookie: inboxCookie,
    service: (t, c, n) => (t === "messages" && c.some((x) => x[0] === "is" && x[1] === "deleted_at") ? noColumn : inboxService(t, c, n)),
  });
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  const salsa = (res.body.clubs as InboxClub[]).find((c) => c.org.id === ORG1)!;
  assert.equal(salsa.board.unread, true);
  assert.equal(salsa.lounge.unread_count, 99);
  const counts = reads(serviceLog, "messages");
  assert.equal(counts.length, 8, "each of the 4 counts asked twice: with the filter, then without");
  assert.equal(counts.filter((q) => q.calls.some((x) => x[0] === "is" && x[1] === "deleted_at")).length, 4);
});

test("inbox: a failed preview window, a failed count, failed events or no service role never answer 500", async () => {
  const fails = { error: { code: "XX000", message: "boom" } };
  install({ cookie: (t, c, n) => (t === "messages" ? fails : inboxCookie(t, c, n)), service: () => fails });
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  const clubs = res.body.clubs as InboxClub[];
  assert.equal(clubs.length, 2);
  for (const club of clubs) {
    assert.equal(club.board.latest, null);
    assert.equal(club.lounge.latest, null);
    assert.equal(club.board.unread, false);
    assert.equal(club.lounge.unread_count, 0);
    assert.equal(club.next_event, null);
    assert.equal(club.last_activity_at, null);
  }
  install({ cookie: inboxCookie, service: null });
  const noService = await inbox.GET(req(), ctx());
  assert.equal(noService.status, 200);
  const salsaNoService = (noService.body.clubs as InboxClub[])[1];
  assert.equal(salsaNoService.next_event, null);
  assert.equal(salsaNoService.board.latest?.id, "m-b1-old", "no service role: the officer exception cannot be checked, the next row is the preview");
  assert.equal(salsaNoService.lounge.latest?.id, "m-l1");
  install({ cookie: inboxCookie, service: (t, c, n) => (t === "org_members" ? { error: { code: "XX000", message: "boom" } } : inboxService(t, c, n)) });
  const rolesFailed = await inbox.GET(req(), ctx());
  assert.equal(rolesFailed.status, 200);
  assert.equal((rolesFailed.body.clubs as InboxClub[])[1].board.latest?.id, "m-b1-old", "the officer-role read failed: the blocked author's row stays hidden, the next row is the preview");
  inboxWorld();
  g.__vibeEventRefsFor = async () => null;
  const refsFailed = await inbox.GET(req(), ctx());
  assert.equal(refsFailed.status, 200);
  assert.equal((refsFailed.body.clubs as InboxClub[])[1].next_event, null);
  assert.equal((refsFailed.body.clubs as InboxClub[])[1].board.latest?.id, "m-b1-new");
});

// ── GET /api/me/inbox, the per-room reads (S71 amendment 2) ─────────────────

type StoredMsg = {
  id: string; channel_id: string; content: string; created_at: string; user_id: string; kind: string;
  thread_root_id: string | null; removed_at: string | null; users: { name: string } | null;
};
type LatestArgs = { p_channels: string[]; p_per: number; p_top_level_only: boolean; p_live_only: boolean };

/**
 * A small `messages` table that answers both reads as the database does:
 * today's shared window (`in` + `is null` + newest first + `limit`, ONE window
 * for all the rooms) and `chat_latest_per_channel` (the newest `p_per` rows
 * of EACH room, clamped to 1..20, the first 500 ids, newest first overall).
 */
function messagesTable(rows: StoredMsg[]) {
  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const isNull = (row: StoredMsg, column: unknown) => (row as unknown as Record<string, unknown>)[String(column)] === null;
  return {
    window(calls: Call[]): Answer {
      const ids = arg(calls, "in", "channel_id") as string[];
      const nulls = calls.filter((c) => c[0] === "is").map((c) => c[1]);
      const hits = newestFirst.filter((row) => ids.includes(row.channel_id) && nulls.every((column) => isNull(row, column)));
      return { data: hits.slice(0, arg(calls, "limit") as number) };
    },
    perRoom(calls: Call[]): Answer {
      const a = calls[0][1] as LatestArgs;
      const per = Math.min(Math.max(a.p_per ?? 1, 1), 20);
      const hits = a.p_channels.slice(0, 500).flatMap((id) =>
        newestFirst
          .filter((row) => row.channel_id === id && (!a.p_top_level_only || row.thread_root_id === null) && (!a.p_live_only || row.removed_at === null))
          .slice(0, per),
      );
      return { data: hits.sort((x, y) => y.created_at.localeCompare(x.created_at)) };
    },
  };
}

const E2 = "e2";
const msg = (id: string, channel_id: string, created_at: string, over: Partial<StoredMsg> = {}): StoredMsg => ({
  id, channel_id, content: id, created_at, user_id: OTHER, kind: "text", thread_root_id: null, removed_at: null, users: { name: "Ann" }, ...over,
});
/** Busy rooms beside quiet ones: in one shared window the busy room of each kind fills every slot. */
const busyRows = (): StoredMsg[] => [
  msg("b1-only", B1, T(5)),
  ...Array.from({ length: 12 }, (_, h) => msg(`b2-${h}`, B2, T(21, h))),
  ...Array.from({ length: 12 }, (_, h) => msg(`l1-${h}`, L1, T(20, h))),
  msg("l2-live", L2, T(10)),
  msg("l2-reply", L2, T(19), { thread_root_id: "l2-live" }),
  msg("l2-removed", L2, T(18), { removed_at: T(18, 1), user_id: VIEWER }),
  ...Array.from({ length: 7 }, (_, h) => msg(`e1-${h}`, E1, T(22, h))),
  msg("e2-only", E2, T(3)),
];
const busyCookie = (table: ReturnType<typeof messagesTable>): Answerer => (t, calls) => {
  if (t === "channel_members") {
    return { data: [
      membership(B1, ORG1, "board"), membership(L1, ORG1, "lounge"), membership(E1, ORG1, "event"),
      membership(B2, ORG2, "board"), membership(L2, ORG2, "lounge"), membership(E2, ORG2, "event"),
    ] };
  }
  if (t === "orgs") return { data: [orgRow(ORG1, "Salsa"), orgRow(ORG2, "Chess")] };
  if (t === "org_members") return { data: [{ org_id: ORG1, role: "member" }, { org_id: ORG2, role: "member" }] };
  if (t === "messages") return table.window(calls);
  return { data: [] };
};
const busyService: Answerer = (t) => (t === "messages" ? { count: 0 } : { data: [] });
const busyWorld = (rpc: boolean) => {
  const table = messagesTable(busyRows());
  return install({
    cookie: busyCookie(table),
    rpc: rpc ? (t, calls) => (t === "rpc:chat_latest_per_channel" ? table.perRoom(calls) : { error: MISSING_FN }) : undefined,
    service: busyService,
  });
};
const latestIds = (clubs: InboxClub[]) =>
  clubs.map((c) => ({ club: c.org.name, board: c.board.latest?.id ?? null, lounge: c.lounge.latest?.id ?? null, last: c.last_activity_at }));

test("inbox, per room: one call per read on the cookie client, k rows of EACH room, today's filters; no shared window", async () => {
  const { cookieLog, serviceLog } = busyWorld(true);
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  const calls = reads(cookieLog, "rpc:chat_latest_per_channel");
  assert.equal(calls.length, 3);
  const [board, lounge, events] = calls.map((c) => c.calls);
  assert.deepEqual(board[0], ["rpc", { p_channels: [B1, B2], p_per: 5, p_top_level_only: true, p_live_only: true }]);
  assert.deepEqual(lounge[0], ["rpc", { p_channels: [L1, L2], p_per: 5, p_top_level_only: true, p_live_only: true }]);
  assert.deepEqual(events[0], ["rpc", { p_channels: [E1, E2], p_per: 1, p_top_level_only: true, p_live_only: true }]);
  for (const preview of [board, lounge]) {
    assert.equal(selectOf(preview), "id, channel_id, content, created_at, user_id, kind, thread_root_id, attachment_kind, users:users!messages_user_id_fkey(name)", "the same select list, the users embed included (attachment_kind since Oct 19, 2026: a shared post is not a deleted message)");
  }
  assert.equal(selectOf(events), "channel_id, created_at");
  for (const c of [board, lounge, events]) assert.deepEqual(c.find((x) => x[0] === "order"), ["order", "created_at", { ascending: false }]);
  assert.equal(reads(cookieLog, "messages").length, 0, "no shared window once the function answers");
  assert.equal(serviceLog.filter((entry) => entry.table.startsWith("rpc:")).length, 0, "never the service role for these reads");

  assert.deepEqual(latestIds(res.body.clubs as InboxClub[]), [
    { club: "Salsa", board: "b1-only", lounge: "l1-11", last: T(22, 6) },
    { club: "Chess", board: "b2-11", lounge: "l2-live", last: T(21, 11) },
  ], "the quiet Board, the quiet Lounge (not its reply, not my removed row) and the quiet event room all count");
  const salsa = (res.body.clubs as InboxClub[])[0];
  assert.deepEqual(salsa.board.latest, { id: "b1-only", text: "b1-only", author_name: "Ann", created_at: T(5), kind: "text" }, "the embed's name on the function's rows");
});

test("inbox, no migration C: the function is missing, today's shared windows answer (and starve the quiet rooms, the bug C fixes)", async () => {
  const { cookieLog } = busyWorld(false);
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  assert.equal(reads(cookieLog, "rpc:chat_latest_per_channel").length, 3, "the function is tried first");
  const windows = reads(cookieLog, "messages");
  assert.deepEqual(windows.map((w) => arg(w.calls, "limit")), [10, 10, 6], "then today's reads, unchanged");
  assert.deepEqual(latestIds(res.body.clubs as InboxClub[]), [
    { club: "Salsa", board: null, lounge: "l1-11", last: T(22, 6) },
    { club: "Chess", board: "b2-11", lounge: null, last: T(21, 11) },
  ]);
});

test("inbox, per room: any other error from the function falls back to today's shared window for the PREVIEWS (an old preview beats none); the event-room read keeps today's soft fail", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const { cookieLog } = install({
    cookie: busyCookie(messagesTable(busyRows())),
    rpc: () => ({ error: { code: "XX000", message: "boom" } }),
    service: busyService,
  });
  const res = await inbox.GET(req(), ctx());
  assert.equal(res.status, 200);
  assert.equal(reads(cookieLog, "rpc:chat_latest_per_channel").length, 3, "the function is tried first");
  // Board and Lounge previews: today's shared window, read once each (S71b repair: `fallbackOnAnyError`).
  const windows = reads(cookieLog, "messages");
  assert.deepEqual(windows.map((w) => arg(w.calls, "limit")), [10, 10], "the two preview windows; no event-room window");
  // Exactly today's answer for the previews (the shared window still starves the quiet rooms): never blank.
  const latest = latestIds(res.body.clubs as InboxClub[]);
  // (Chess sorts first here: with the event-room read failed, Salsa's event activity does not count.)
  assert.deepEqual(latest.map((c) => ({ club: c.club, board: c.board, lounge: c.lounge })), [
    { club: "Chess", board: "b2-11", lounge: null },
    { club: "Salsa", board: null, lounge: "l1-11" },
  ]);
  const logged = errors.mock.calls.map((c) => String(c.arguments[0]));
  const refused = logged.filter((line) => line.startsWith("[me/inbox chat_latest_per_channel] the function refused this read"));
  assert.equal(refused.length, 2, logged.join(" | "));
  assert.ok(logged.includes("[me/inbox event rooms]"), logged.join(" | "));
  assert.ok(!logged.includes("[me/inbox board previews]") && !logged.includes("[me/inbox lounge previews]"), "the previews did not fail: they fell back");
});

// ── GET /api/orgs/[slug]/space (7.2) ────────────────────────────────────────

const SP = { lounge: "sp-lounge", board: "sp-board", officers: "sp-officers", open: "sp-ev-open", closed: "sp-ev-closed", zeta: "sp-zeta", alpha: "sp-alpha" };
/** Officers and the event chats are private; `alpha` is a private extra room, `zeta` a public one. Every rule is `everyone`. */
const spaceChannels = (): Record<string, unknown>[] => [
  { id: SP.zeta, kind: "room", name: "zeta", event_id: null, position: 1, is_private: false, post_policy: "everyone" },
  { id: SP.closed, kind: "event", name: "Old formal", event_id: "ev-closed", position: 0, is_private: true, post_policy: "everyone" },
  { id: SP.board, kind: "board", name: "Board", event_id: null, position: 0, is_private: false, post_policy: "everyone" },
  { id: SP.open, kind: "event", name: "Fall formal", event_id: "ev-open", position: 0, is_private: true, post_policy: "everyone" },
  { id: "sp-nokind", kind: null, name: "old", event_id: null, position: 0, is_private: false, post_policy: "everyone" },
  { id: SP.officers, kind: "officers", name: "Officers", event_id: null, position: 0, is_private: true, post_policy: "everyone" },
  { id: SP.alpha, kind: "room", name: "alpha", event_id: null, position: 0, is_private: true, post_policy: "everyone" },
  { id: SP.lounge, kind: "lounge", name: "Lounge", event_id: null, position: 0, is_private: false, post_policy: "everyone" },
];
/** The select the space route makes first (wave-3 contract 4.2), and the one from before `channels.post_policy`. */
const ROOMS_SELECT = "id, kind, name, event_id, position, is_private, post_policy";
const ROOMS_SELECT_BEFORE = "id, kind, name, event_id, position, is_private";
const MISSING_POLICY = { code: "42703", message: "column channels.post_policy does not exist" };
/** The rows as the database would send them for this select: no `post_policy` key unless the select named it. */
const selected = (rows: Record<string, unknown>[], calls: Call[]) =>
  selectOf(calls).includes("post_policy")
    ? rows
    : rows.map((row) => {
        const rest = { ...row };
        delete rest.post_policy;
        return rest;
      });
/** `spaceChannels()` with the two extra rooms' rules set: `zeta` public, `alpha` private. */
const policyChannels = (zeta: string, alpha: string) =>
  spaceChannels().map((row) => (row.id === SP.zeta ? { ...row, post_policy: zeta } : row.id === SP.alpha ? { ...row, post_policy: alpha } : row));
const spaceEvent = (id: string, day: number) => ({ id, title: id, starts_at: T(day), ends_at: T(day, 12), location: null, org_id: ORG1 });
const spaceOrg = (hidden_at: string | null = null) => ({ id: ORG1, handle: "salsa", name: "Salsa", logo_url: "orgs/x/logo.png", banner_url: "https://cdn/banner.png", verified: true, hidden_at });

const spaceService = (role: string | null = "member"): Answerer => (table, calls, nth) => {
  if (table === "orgs") return { data: [spaceOrg()] };
  if (table === "org_members") return nth === 0 ? { data: role ? [{ role }] : [] } : { count: 42 };
  if (table === "messages") {
    const channel = arg(calls, "eq", "channel_id");
    return { count: channel === SP.lounge ? 3 : channel === SP.open ? 1 : 0 };
  }
  if (table === "events") {
    if (arg(calls, "in", "id")) return { data: [spaceEvent("ev-open", 8), spaceEvent("ev-closed", 1)] };
    const limit = arg(calls, "limit");
    const rows = [spaceEvent("ev-open", 8), spaceEvent("ev-x", 9), spaceEvent("ev-y", 10), spaceEvent("ev-z", 11)];
    return { data: rows.slice(0, limit === 3 ? 3 : 50) };
  }
  return { data: [] };
};
const spaceCookie: Answerer = (table, calls) => {
  if (table === "channels") return { data: selected(spaceChannels(), calls) };
  if (table === "channel_members") {
    return { data: [
      { channel_id: SP.lounge, last_read_at: T(2), created_at: T(1) },
      { channel_id: SP.board, last_read_at: null, created_at: T(1) },
      { channel_id: SP.open, last_read_at: T(2), created_at: T(1) },
    ] };
  }
  return { data: [] };
};
const spaceRefs = async (events: EventRow[]) => {
  const refs = await plainRefs(events);
  for (const ref of refs.values()) ref.state = ref.id === "ev-closed" ? "closed" : ref.id === "ev-open" ? "live" : "soon";
  return refs;
};
const BOARD_ROOM = { id: SP.board, kind: "board", name: "Board", org_id: ORG1, event: null };
// Oldest first: p3 is a stub, p4 the viewer's own removed post (RLS shows it to its author) — neither is `board_latest` (7.2.4).
const boardPage = async () => ({
  ok: true,
  messages: [
    { id: "p1", hidden: false, removed: null },
    { id: "p2", hidden: false, removed: null },
    { id: "p3", hidden: true, removed: null },
    { id: "p4", hidden: false, removed: { by: "officer", at: "2026-10-05T00:00:00.000Z", reason: null } },
  ],
  room: BOARD_ROOM,
  viewerRole: "member",
});

function spaceWorld(over: Partial<World> = {}) {
  return install({ cookie: spaceCookie, service: spaceService(), refs: spaceRefs, loadRoom: async () => BOARD_ROOM, read: boardPage, ...over });
}

test("space: the sweep — 401, 404 with the flag off, load_failed, not_found, members_only, hidden club", async () => {
  install({ user: null });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 401, body: { ok: false, error: "Unauthorized", code: "unauthorized" } });
  spaceWorld({ flag: false });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
  spaceWorld({ service: (t) => (t === "orgs" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Couldn't load this club.", code: "load_failed" } });
  spaceWorld({ service: () => ({ data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
  spaceWorld({ service: (t) => (t === "orgs" ? { data: [spaceOrg()] } : { error: { code: "XX000", message: "boom" } }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Couldn't load this club.", code: "load_failed" } });
  const { serviceLog } = spaceWorld({ service: spaceService(null) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 403, body: { ok: false, error: "Members only.", code: "members_only" } });
  assert.equal(arg(reads(serviceLog, "orgs")[0].calls, "eq", "handle"), "salsa");
  assert.equal(selectOf(reads(serviceLog, "orgs")[0].calls), "id, handle, name, logo_url, banner_url, verified, hidden_at");
  spaceWorld({ service: (t, c, n) => (t === "orgs" ? { data: [spaceOrg(T(1))] } : spaceService(null)(t, c, n)) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
});

test("space: the rooms read — a database without A answers 404; another failure 500", async () => {
  // Without A both selects fail as missing schema: the one naming post_policy, then the one before it. Only then 404.
  const withoutA = spaceWorld({ cookie: (t) => (t === "channels" ? { error: MISSING_KIND } : { data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
  assert.deepEqual(reads(withoutA.cookieLog, "channels").map((r) => selectOf(r.calls)), [ROOMS_SELECT, ROOMS_SELECT_BEFORE]);
  // A failure that is not a missing schema is not asked again, and is not remembered as a missing column.
  const broken = spaceWorld({ cookie: (t) => (t === "channels" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Request failed" } });
  assert.equal(reads(broken.cookieLog, "channels").length, 1);
  assert.equal(postPolicyColumnMissing(), false);
});

test("space: the happy path, field by field (7.2.1-7.2.5), and ?events=1 (7.2.6)", async () => {
  const { cookieLog, serviceLog } = spaceWorld();
  const reading: unknown[] = [];
  g.__vibeReadChatMessages = async (_client: unknown, channelId: string, opts: unknown, known: unknown) => {
    reading.push([channelId, opts, known]);
    return boardPage();
  };
  const res = await space.GET(req("http://localhost/api/orgs/salsa/space"), ctx());
  assert.equal(res.status, 200);
  const body = res.body as unknown as SpaceResponse;
  assert.deepEqual(body.org, { id: ORG1, handle: "salsa", name: "Salsa", logo_url: "/api/orgs/salsa/asset/logo?v=logo.png", banner_url: "https://cdn/banner.png", verified: true, member_count: 42 });
  assert.deepEqual(body.viewer, { role: "member", can_moderate: false });
  assert.deepEqual(body.rooms.map((r) => [r.id, r.unread, r.can_post]), [
    [SP.lounge, true, true],
    [SP.board, false, false],
    [SP.officers, false, true],
    [SP.open, true, true],
    [SP.alpha, false, true],
    [SP.zeta, false, true],
  ], "order; the closed event room out; Officers unread false without a row; a member cannot post on the Board");
  assert.equal(body.rooms[3].event?.id, "ev-open");
  assert.equal(body.rooms[3].event?.state, "live");
  assert.equal(body.rooms[0].event, null);
  for (const room of body.rooms) {
    assert.deepEqual(Object.keys(room).sort(), ["can_post", "event", "id", "kind", "locked", "name", "post_policy", "unread"]);
  }
  assert.deepEqual(body.rooms.map((r) => [r.id, r.locked, r.post_policy]), [
    [SP.lounge, false, "everyone"],
    [SP.board, false, "everyone"],
    [SP.officers, true, "everyone"],
    [SP.open, true, "everyone"],
    [SP.alpha, true, "everyone"],
    [SP.zeta, false, "everyone"],
  ], "locked is is_private: Officers, the event chat and the private extra room");
  assert.equal(body.board_latest?.id, "p2", "the last non-hidden, non-removed of the oldest-first page");
  assert.deepEqual(body.up_next.map((e) => e.id), ["ev-open", "ev-x", "ev-y"]);
  assert.equal("upcoming" in body, false);
  assert.equal("board_recent" in body, false, "only with ?panel=1");
  assert.deepEqual(reading, [[SP.board, { limit: 6 }, {
    viewerId: VIEWER,
    access: { ok: true, isOrgChannel: true, orgId: ORG1, accepted_at: null, cleared_at: null, kind: "board", eventId: null },
    room: BOARD_ROOM,
  }]]);

  assert.equal(reads(cookieLog, "channels").length, 1, "the column is there: one rooms read");
  const channels = reads(cookieLog, "channels")[0].calls;
  assert.equal(selectOf(channels), "id, kind, name, event_id, position, is_private, post_policy");
  assert.equal(arg(channels, "eq", "org_id"), ORG1);
  assert.equal(arg(channels, "eq", "type"), "org_channel");
  assert.equal(reads(cookieLog, "org_channel_members").length, 0, "no room is `listed`: the by-name list is not read");
  const mine = reads(cookieLog, "channel_members")[0].calls;
  assert.deepEqual(arg(mine, "in", "channel_id"), [SP.zeta, SP.closed, SP.board, SP.open, SP.officers, SP.alpha, SP.lounge]);
  assert.equal(arg(mine, "eq", "user_id"), VIEWER);
  const counts = reads(serviceLog, "messages");
  assert.deepEqual(counts.map((c) => [arg(c.calls, "eq", "channel_id"), arg(c.calls, "gt", "created_at")]), [[SP.board, T(1)], [SP.open, T(2)], [SP.lounge, T(2)]], "counts only for rooms I hold a row on; a null last_read_at reads as created_at");
  assert.deepEqual(reads(serviceLog, "org_members")[1].calls[0], ["select", "user_id", { count: "exact", head: true }]);
  const events = reads(serviceLog, "events");
  assert.equal(events.length, 2);
  assert.deepEqual(arg(events[0].calls, "in", "id"), ["ev-closed", "ev-open"]);
  assert.equal(arg(events[1].calls, "limit"), 3);
  assert.equal(arg(events[1].calls, "eq", "org_id"), ORG1);

  const world = spaceWorld();
  const withEvents = await space.GET(req("http://localhost/api/orgs/salsa/space?events=1"), ctx());
  assert.deepEqual((withEvents.body as unknown as SpaceResponse).upcoming?.map((e) => e.id), ["ev-open", "ev-x", "ev-y", "ev-z"]);
  assert.deepEqual((withEvents.body as unknown as SpaceResponse).up_next.map((e) => e.id), ["ev-open", "ev-x", "ev-y"]);
  assert.equal(arg(reads(world.serviceLog, "events")[2].calls, "limit"), 50);
});

test("space: no Board → board_latest null (200); the Board room unreadable → 503; the page read's refusal passes through", async () => {
  spaceWorld({ cookie: (t, c, n) => (t === "channels" ? { data: spaceChannels().filter((r) => r.kind !== "board") } : spaceCookie(t, c, n)) });
  const noBoard = await space.GET(req(), ctx());
  assert.equal(noBoard.status, 200);
  assert.equal(noBoard.body.board_latest, null);
  assert.equal((noBoard.body.rooms as SpaceRoom[]).length, 5);
  spaceWorld({ loadRoom: async () => null });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } });
  spaceWorld({ read: async () => ({ ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } }) });
  assert.equal((await space.GET(req(), ctx())).status, 503);
  // No refs: the state comes from the event row the route read (roomState,
  // the real clock): an event over years ago is closed and out, one years
  // away is soon and kept without its ref; a room whose event row was not
  // read either is kept (an unknown state is not closed).
  const farEvent = (id: string, year: number) => ({ id, title: id, starts_at: `${year}-06-01T10:00:00+00:00`, ends_at: `${year}-06-01T12:00:00+00:00`, location: null, org_id: ORG1 });
  spaceWorld({
    refs: async () => null,
    service: (t, c, n) => (t === "events" && arg(c, "in", "id") ? { data: [farEvent("ev-open", 2099), farEvent("ev-closed", 2020)] } : spaceService()(t, c, n)),
  });
  const noRefs = await space.GET(req(), ctx());
  assert.equal(noRefs.status, 200);
  assert.deepEqual(noRefs.body.up_next, []);
  assert.deepEqual((noRefs.body.rooms as SpaceRoom[]).filter((r) => r.kind === "event").map((r) => [r.id, r.event, r.can_post]), [[SP.open, null, true]], "no ref: the closed room (by its row's dates) is out, the open one kept without its ref");
  spaceWorld({ refs: async () => null, service: (t, c, n) => (t === "events" ? { error: { code: "XX000", message: "boom" } } : spaceService()(t, c, n)) });
  const noRows = await space.GET(req(), ctx());
  assert.equal(noRows.status, 200);
  assert.deepEqual((noRows.body.rooms as SpaceRoom[]).filter((r) => r.kind === "event").map((r) => [r.id, r.event, r.can_post]), [[SP.open, null, true], [SP.closed, null, true]], "no ref and no event row: an unknown state is not closed; by name");
  spaceWorld({ service: spaceService("owner") });
  const owner = await space.GET(req(), ctx());
  assert.deepEqual(owner.body.viewer, { role: "owner", can_moderate: true });
  assert.equal((owner.body.rooms as SpaceRoom[])[1].can_post, true);
});

// ── GET /api/orgs/[slug]/space, wave 3 (wave-3-desktop/contract.md 4.2) ─────

const roomsOf = (res: { body: Record<string, unknown> }) => res.body.rooms as SpaceRoom[];
/** `spaceService("member")` for a world asked more than once: the role read is told by its select, not by its turn. */
const steadyService: Answerer = (table, calls, nth) =>
  table === "org_members" ? (selectOf(calls) === "role" ? { data: [{ role: "member" }] } : { count: 42 }) : spaceService()(table, calls, nth);
const FIVE_MINUTES = 5 * 60 * 1000;

test("space: a database without post_policy — the select fails once, the retry answers every room `everyone`, and the NEXT request makes one select", async () => {
  const { cookieLog } = spaceWorld({
    cookie: (t, c, n) => (t === "channels" && selectOf(c).includes("post_policy") ? { error: MISSING_POLICY } : spaceCookie(t, c, n)),
    service: steadyService,
  });
  assert.equal(postPolicyColumnMissing(), false, "install forgot it");
  const first = await space.GET(req(), ctx());
  assert.equal(first.status, 200, "a missing column is never a 404 or a failed read");
  assert.deepEqual(reads(cookieLog, "channels").map((r) => selectOf(r.calls)), [ROOMS_SELECT, ROOMS_SELECT_BEFORE]);
  for (const call of reads(cookieLog, "channels")) {
    assert.equal(arg(call.calls, "eq", "org_id"), ORG1);
    assert.equal(arg(call.calls, "eq", "type"), "org_channel");
  }
  assert.deepEqual(roomsOf(first).map((r) => [r.id, r.locked, r.post_policy, r.can_post]), [
    [SP.lounge, false, "everyone", true],
    [SP.board, false, "everyone", false],
    [SP.officers, true, "everyone", true],
    [SP.open, true, "everyone", true],
    [SP.alpha, true, "everyone", true],
    [SP.zeta, false, "everyone", true],
  ], "locked still comes from is_private; the rule is today's");
  for (const room of roomsOf(first)) {
    assert.deepEqual(Object.keys(room).sort(), ["can_post", "event", "id", "kind", "locked", "name", "post_policy", "unread"]);
  }
  assert.equal(postPolicyColumnMissing(), true, "the route noted it");

  // The same world, not installed again: the memory holds, so ONE select, the one from before the column.
  const second = await space.GET(req(), ctx());
  assert.equal(second.status, 200);
  assert.deepEqual(reads(cookieLog, "channels").map((r) => selectOf(r.calls)), [ROOMS_SELECT, ROOMS_SELECT_BEFORE, ROOMS_SELECT_BEFORE]);
  assert.deepEqual(roomsOf(second).map((r) => r.post_policy), ["everyone", "everyone", "everyone", "everyone", "everyone", "everyone"]);

  // Once the memory is gone the select names the column again.
  forgetPostPolicyColumnMissing();
  assert.equal((await space.GET(req(), ctx())).status, 200);
  assert.deepEqual(reads(cookieLog, "channels").slice(3).map((r) => selectOf(r.calls)), [ROOMS_SELECT, ROOMS_SELECT_BEFORE]);
});

test("the memory of a missing post_policy column lasts 5 minutes from the LAST note", () => {
  forgetPostPolicyColumnMissing();
  const t0 = Date.parse("2026-10-04T12:00:00Z");
  assert.equal(postPolicyColumnMissing(t0), false, "nothing noted");
  notePostPolicyColumnMissing(t0);
  assert.equal(postPolicyColumnMissing(t0), true);
  assert.equal(postPolicyColumnMissing(t0 + FIVE_MINUTES - 1), true);
  assert.equal(postPolicyColumnMissing(t0 + FIVE_MINUTES), false, "over at 5 minutes");
  notePostPolicyColumnMissing(t0 + 4 * 60 * 1000);
  assert.equal(postPolicyColumnMissing(t0 + FIVE_MINUTES + 1), true, "a later note starts the 5 minutes again");
  assert.equal(postPolicyColumnMissing(t0 + 9 * 60 * 1000), false);
  notePostPolicyColumnMissing();
  assert.equal(postPolicyColumnMissing(), true, "both default to the clock");
  forgetPostPolicyColumnMissing();
  assert.equal(postPolicyColumnMissing(), false);
});

test("space: can_post follows an extra room's post_policy; the by-name list is ONE cookie read, made only for `listed`", async () => {
  const extras = (res: { body: Record<string, unknown> }) =>
    roomsOf(res).filter((r) => r.kind === "room").map((r) => [r.id, r.locked, r.post_policy, r.can_post]);
  const cookieWith = (zeta: string, alpha: string, list: Answer): Answerer => (t, c, n) =>
    t === "channels" ? { data: selected(policyChannels(zeta, alpha), c) } : t === "org_channel_members" ? list : spaceCookie(t, c, n);

  // A member, zeta public + `listed`, alpha private + `officers`: not on zeta's list.
  const offList = spaceWorld({ cookie: cookieWith("listed", "officers", { data: [] }) });
  assert.deepEqual(extras(await space.GET(req(), ctx())), [[SP.alpha, true, "officers", false], [SP.zeta, false, "listed", false]]);
  const listReads = reads(offList.cookieLog, "org_channel_members");
  assert.equal(listReads.length, 1);
  assert.equal(selectOf(listReads[0].calls), "channel_id");
  assert.equal(arg(listReads[0].calls, "eq", "user_id"), VIEWER);
  assert.deepEqual(arg(listReads[0].calls, "in", "channel_id"), [SP.zeta, SP.closed, SP.board, SP.open, SP.officers, SP.alpha, SP.lounge]);

  // On both lists: `listed` lets them post, `officers` still does not.
  spaceWorld({ cookie: cookieWith("listed", "officers", { data: [{ channel_id: SP.zeta }, { channel_id: SP.alpha }] }) });
  assert.deepEqual(extras(await space.GET(req(), ctx())), [[SP.alpha, true, "officers", false], [SP.zeta, false, "listed", true]]);

  // An admin posts under both rules, on no list.
  spaceWorld({ cookie: cookieWith("listed", "officers", { data: [] }), service: spaceService("admin") });
  assert.deepEqual(extras(await space.GET(req(), ctx())), [[SP.alpha, true, "officers", true], [SP.zeta, false, "listed", true]]);
  // A member is not an officer.
  spaceWorld({ cookie: cookieWith("officers", "everyone", { data: [] }), service: spaceService("member") });
  assert.deepEqual(extras(await space.GET(req(), ctx())), [[SP.alpha, true, "everyone", true], [SP.zeta, false, "officers", false]]);

  // No `listed` room: the list is never read. A failed list read: the closed side, still 200.
  const noListed = spaceWorld({ cookie: cookieWith("officers", "officers", { error: { code: "XX000", message: "boom" } }) });
  assert.equal((await space.GET(req(), ctx())).status, 200);
  assert.equal(reads(noListed.cookieLog, "org_channel_members").length, 0);
  spaceWorld({ cookie: cookieWith("listed", "everyone", { error: { code: "XX000", message: "boom" } }) });
  const listFailed = await space.GET(req(), ctx());
  assert.equal(listFailed.status, 200);
  assert.deepEqual(extras(listFailed), [[SP.alpha, true, "everyone", true], [SP.zeta, false, "listed", false]]);

  // A value the column cannot hold reads `everyone`.
  spaceWorld({ cookie: cookieWith("mods", "", { data: [] }) });
  assert.deepEqual(extras(await space.GET(req(), ctx())), [[SP.alpha, true, "everyone", true], [SP.zeta, false, "everyone", true]]);
});

test("space: board_recent only with ?panel=1 — at most 3, newest first, cut from the one Board page read with { limit: 6 }", async () => {
  const msg = (id: string, over: Record<string, unknown> = {}) => ({ id, hidden: false, removed: null, ...over });
  const removed = { by: "officer", at: "2026-10-05T00:00:00.000Z", reason: null };
  const sixPosts = async () => ({
    ok: true,
    messages: [msg("p1"), msg("p2"), msg("p3"), msg("p4", { hidden: true }), msg("p5"), msg("p6", { removed })],
    room: BOARD_ROOM,
    viewerRole: "member",
  });
  const asked: unknown[] = [];
  const counted = (page: () => Promise<unknown>) => async (_client: unknown, channelId: string, opts: unknown) => {
    asked.push([channelId, opts]);
    return page();
  };
  const recent = (res: { body: Record<string, unknown> }) => (res.body as unknown as SpaceResponse).board_recent?.map((m) => m.id);

  spaceWorld({ read: counted(sixPosts) });
  const panel = await space.GET(req("http://localhost/api/orgs/salsa/space?panel=1"), ctx());
  assert.equal(panel.status, 200);
  assert.deepEqual(recent(panel), ["p5", "p3", "p2"], "the stub and the removed post take no place; newest first");
  assert.equal(panel.body.board_latest && (panel.body.board_latest as { id: string }).id, "p5", "board_latest is its first entry");
  assert.equal("upcoming" in panel.body, false);
  assert.deepEqual(asked, [[SP.board, { limit: 6 }]], "ONE Board read, the limit unchanged");

  // Without the parameter (or with another value) the key is absent, as `upcoming` is without ?events=1.
  spaceWorld({ read: counted(sixPosts), service: steadyService });
  assert.equal("board_recent" in (await space.GET(req("http://localhost/api/orgs/salsa/space"), ctx())).body, false);
  assert.equal("board_recent" in (await space.GET(req("http://localhost/api/orgs/salsa/space?panel=0"), ctx())).body, false);
  assert.equal("board_recent" in (await space.GET(req("http://localhost/api/orgs/salsa/space?events=1"), ctx())).body, false);
  assert.deepEqual(asked.slice(1), [[SP.board, { limit: 6 }], [SP.board, { limit: 6 }], [SP.board, { limit: 6 }]]);

  // Fewer than three shown posts; both parameters together; a club with no Board.
  spaceWorld();
  const both = await space.GET(req("http://localhost/api/orgs/salsa/space?events=1&panel=1"), ctx());
  assert.deepEqual(recent(both), ["p2", "p1"]);
  assert.equal((both.body as unknown as SpaceResponse).upcoming?.length, 4);
  spaceWorld({ cookie: (t, c, n) => (t === "channels" ? { data: selected(spaceChannels().filter((r) => r.kind !== "board"), c) } : spaceCookie(t, c, n)) });
  const noBoard = await space.GET(req("http://localhost/api/orgs/salsa/space?panel=1"), ctx());
  assert.equal(noBoard.status, 200);
  assert.deepEqual(noBoard.body.board_recent, []);

  // The flag off: still 404, with or without the parameter.
  spaceWorld({ flag: false });
  assert.deepEqual(await space.GET(req("http://localhost/api/orgs/salsa/space?panel=1"), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
});

const rsvpRow = (id: string, org_id: string | null, status = "going") => ({
  status,
  event: { id, title: id, starts_at: T(8), ends_at: T(8, 12), location: "Hall", org_id, org: org_id ? { handle: "salsa", name: "Salsa", verified: true } : null },
});
const calendarCookie: Answerer = (table) => {
  if (table === "rsvps") return { data: [rsvpRow("ev-club", ORG1), rsvpRow("ev-solo", null, "maybe"), { status: "going", event: null }] };
  if (table === "personal_events") return { data: [{ id: "pe", title: "Dentist", starts_at: T(3), ends_at: null, location: "", notes: "", color: "#fff" }] };
  return { data: [] };
};

test("calendar: flag off → the three fields null on every rsvp entry, eventRefsFor not asked; personal entries untouched", async () => {
  const { cookieLog } = install({ cookie: calendarCookie, flag: false });
  let asked = 0;
  g.__vibeEventRefsFor = async () => { asked += 1; return new Map(); };
  const res = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(res.status, 200);
  const entries = res.body.entries as Record<string, unknown>[];
  assert.deepEqual(entries.map((e) => e.id), ["pe", "ev-club", "ev-solo"]);
  assert.deepEqual(entries[1], {
    kind: "rsvp", id: "ev-club", title: "ev-club", starts_at: T(8), ends_at: T(8, 12), location: "Hall", viewer_status: "going",
    org: { handle: "salsa", name: "Salsa", verified: true }, visibility: "everyone", org_id: null, room_id: null, room_state: null,
  });
  // Oct 19, 2026 (critique D13): an RSVP carries its status and no fixed
  // colour; the client paints it by `viewer_status`.
  assert.equal(entries[2].viewer_status, "maybe");
  assert.equal("color" in entries[1], false, "no green for Going");
  assert.equal("color" in entries[2], false, "no amber for Interested");
  assert.deepEqual(entries[0], { kind: "personal", id: "pe", title: "Dentist", starts_at: T(3), ends_at: null, location: "", notes: "", color: "#fff" });
  assert.equal(asked, 0);
  assert.match(selectOf(reads(cookieLog, "rsvps")[0].calls), /event:events!inner\(id,title,starts_at,ends_at,location,org_id,visibility,org:orgs\(handle,name,verified\)\)/);
  assert.equal(g.__vibeFlagAskedFor, VIEWER);
});

test("calendar: flag on → eventRefsFor with counts: false; org_id, room_id, room_state per entry; a failed build → nulls, 200", async () => {
  install({ cookie: calendarCookie, flag: true });
  const asked: unknown[] = [];
  g.__vibeEventRefsFor = async (events: EventRow[], viewerId: string, opts?: unknown) => {
    asked.push([events, viewerId, opts]);
    const refs = await plainRefs(events);
    refs.get("ev-solo")!.room_id = null;
    return refs;
  };
  const res = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(res.status, 200);
  const entries = res.body.entries as Record<string, unknown>[];
  assert.deepEqual([entries[1].org_id, entries[1].room_id, entries[1].room_state], [ORG1, "room-of-ev-club", "soon"]);
  assert.deepEqual([entries[2].org_id, entries[2].room_id, entries[2].room_state], [null, null, null], "no club: no room, no state");
  assert.deepEqual(asked, [[
    [
      { id: "ev-club", title: "ev-club", starts_at: T(8), ends_at: T(8, 12), location: "Hall", org_id: ORG1, visibility: null },
      { id: "ev-solo", title: "ev-solo", starts_at: T(8), ends_at: T(8, 12), location: "Hall", org_id: null, visibility: null },
    ],
    VIEWER,
    { counts: false },
  ]]);

  install({ cookie: calendarCookie, flag: true });
  g.__vibeEventRefsFor = async () => null;
  const failed = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(failed.status, 200);
  const after = failed.body.entries as Record<string, unknown>[];
  assert.deepEqual([after[1].org_id, after[1].room_id, after[1].room_state], [null, null, null]);
  assert.equal(after.length, 3);

  install({ user: null });
  assert.deepEqual(await calendar.GET(req("http://localhost/api/me/calendar"), ctx()), { status: 401, body: { ok: false, error: "Unauthorized" } });
});

// Oct 22, 2026 ("Members only" events): an RSVP'd members-only event says so
// in its entry and hands its visibility to eventRefsFor; junk reads "everyone".
test("calendar: each rsvp entry carries visibility, members-only included, and eventRefsFor gets it", async () => {
  const membersCookie: Answerer = (table) => {
    if (table === "rsvps") {
      return {
        data: [
          { status: "going", event: { ...rsvpRow("ev-chapter", ORG1).event, visibility: "members" } },
          { status: "maybe", event: { ...rsvpRow("ev-odd", ORG1).event, visibility: "friends" } },
        ],
      };
    }
    return { data: [] };
  };
  install({ cookie: membersCookie, flag: true });
  const asked: EventRow[][] = [];
  g.__vibeEventRefsFor = async (events: EventRow[]) => {
    asked.push(events);
    return plainRefs(events);
  };
  const res = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(res.status, 200);
  const entries = res.body.entries as Record<string, unknown>[];
  assert.deepEqual(entries.map((e) => [e.id, e.visibility]), [["ev-chapter", "members"], ["ev-odd", "everyone"]]);
  assert.deepEqual(asked[0].map((e) => e.visibility), ["members", "friends"], "the row as read; eventRefsFor reads it safely");
});

// Oct 19, 2026 (critique B8 repair): the club behind an RSVP is named with the
// SERVICE client when the viewer's embed hides it. `orgs_select` hides a
// private club (SAE is `is_public = false`) from every non-member, so a
// prospect's rush RSVP used to come back with `org: null` and no link.
test("calendar: a private club's RSVP still carries its handle for a non-member; a hidden club stays unnamed; a failed read never 500s", async () => {
  const ORG3 = "aaaaaaaa-0000-4000-8000-000000000003";
  const prospectCookie: Answerer = (table) => {
    if (table === "rsvps") {
      return {
        data: [
          // The viewer's embed: null for the private club and the hidden one, the public club named.
          { status: "going", event: { id: "ev-rush", title: "Rush", starts_at: T(8), ends_at: T(8, 12), location: "House", org_id: ORG1, org: null } },
          { status: "maybe", event: { id: "ev-hidden", title: "Test", starts_at: T(9), ends_at: T(9, 12), location: "", org_id: ORG2, org: null } },
          { status: "going", event: { id: "ev-public", title: "Salsa", starts_at: T(10), ends_at: T(10, 12), location: "", org_id: ORG3, org: { handle: "salsa", name: "Salsa", verified: true } } },
        ],
      };
    }
    return { data: [] };
  };
  const orgsService: Answerer = (table) =>
    table === "orgs"
      ? {
          data: [
            { id: ORG1, handle: "sae", name: "Sigma Alpha Epsilon", verified: true, hidden_at: null },
            { id: ORG2, handle: "test_club", name: "Test club", verified: false, hidden_at: "2026-09-01T00:00:00Z" },
          ],
        }
      : { data: [] };

  const { serviceLog } = install({ cookie: prospectCookie, service: orgsService, flag: false });
  const res = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(res.status, 200);
  const byId = new Map((res.body.entries as Record<string, unknown>[]).map((e) => [e.id, e]));
  assert.deepEqual(byId.get("ev-rush")!.org, { handle: "sae", name: "Sigma Alpha Epsilon", verified: true }, "a private club is still named, so the chip links to its page");
  assert.equal(byId.get("ev-hidden")!.org, null, "a hidden club is never named to a non-member");
  assert.deepEqual(byId.get("ev-public")!.org, { handle: "salsa", name: "Salsa", verified: true }, "the embed's answer is kept");
  const orgReads = reads(serviceLog, "orgs");
  assert.equal(orgReads.length, 1, "one read for every unnamed club");
  assert.deepEqual(arg(orgReads[0].calls, "in", "id"), [ORG1, ORG2], "only the clubs the embed hid are asked for");
  assert.equal(selectOf(orgReads[0].calls), "id,handle,name,verified,hidden_at");

  // A failed service read, or no service key: the RSVP still lists, unnamed, 200.
  install({ cookie: prospectCookie, service: () => ({ error: { code: "XX000", message: "boom" } }), flag: false });
  const failed = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(failed.status, 200);
  assert.equal((failed.body.entries as Record<string, unknown>[]).find((e) => e.id === "ev-rush")!.org, null);
  install({ cookie: prospectCookie, service: null, flag: false });
  const noKey = await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(noKey.status, 200);
  assert.equal((noKey.body.entries as Record<string, unknown>[]).length, 3);

  // Every club already named by the embed: the service role is never asked.
  const { serviceLog: quiet } = install({ cookie: calendarCookie, flag: false });
  await calendar.GET(req("http://localhost/api/me/calendar"), ctx());
  assert.equal(reads(quiet, "orgs").length, 0);
});
