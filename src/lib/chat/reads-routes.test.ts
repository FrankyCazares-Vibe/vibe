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
  "@/lib/chat/rooms": dataModule("export async function loadRoom(id) { return globalThis.__vibeLoadRoom(id); }"),
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

/** Each `from()` starts a fresh chain; awaiting it asks `answer(table, calls, nth)` — `nth` counts the reads of that table. */
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
  };
  return { client, log };
}

type World = {
  cookie?: Answerer;
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

/** Install the fakes; returns the two logs. */
function install(world: World) {
  const cookie = fakeClient(world.cookie ?? (() => ({ data: [] })), world.user === undefined ? VIEWER : world.user);
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
  assert.deepEqual(salsa.org, { id: ORG1, handle: "salsa", name: "Salsa", logo_url: "/api/orgs/salsa/asset/logo", banner_url: null, verified: true });
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
    assert.equal(selectOf(window.calls), "id, channel_id, content, created_at, user_id, kind, thread_root_id, users:users!messages_user_id_fkey(name)");
    assert.deepEqual(window.calls.find((c) => c[0] === "is"), ["is", "thread_root_id", null]);
    assert.deepEqual(window.calls.find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
    assert.equal(arg(window.calls, "limit"), 10);
  }
  assert.deepEqual(arg(previews[0].calls, "in", "channel_id"), [B1, B2]);
  assert.deepEqual(arg(previews[1].calls, "in", "channel_id"), [L1, L2]);
  assert.equal(selectOf(previews[2].calls), "channel_id, created_at");
  assert.deepEqual(arg(previews[2].calls, "in", "channel_id"), [E1]);
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
    assert.deepEqual(count.calls.filter((c) => c[0] === "is"), [["is", "thread_root_id", null], ["is", "removed_at", null]]);
    assert.deepEqual(count.calls.find((c) => c[0] === "neq"), ["neq", "user_id", VIEWER]);
    since.set(arg(count.calls, "eq", "channel_id"), arg(count.calls, "gt", "created_at"));
  }
  assert.equal(since.get(B1), T(2), "my last_read_at");
  assert.equal(since.get(L1), T(1), "a null last_read_at reads as my row's created_at");

  const events = reads(serviceLog, "events");
  assert.equal(events.length, 1);
  assert.equal(selectOf(events[0].calls), "id, title, starts_at, ends_at, location, org_id");
  assert.deepEqual(arg(events[0].calls, "in", "org_id"), [ORG1, ORG2]);
  assert.equal(typeof arg(events[0].calls, "gt", "ends_at"), "string");
  assert.deepEqual(events[0].calls.find((c) => c[0] === "order"), ["order", "starts_at", { ascending: true }]);
  assert.equal(arg(events[0].calls, "limit"), 20);
  assert.deepEqual(asked, [[["ev-1", "ev-2"], VIEWER, undefined]], "eventRefsFor over the first event per club, counts on");
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
  inboxWorld();
  g.__vibeEventRefsFor = async () => null;
  const refsFailed = await inbox.GET(req(), ctx());
  assert.equal(refsFailed.status, 200);
  assert.equal((refsFailed.body.clubs as InboxClub[])[1].next_event, null);
  assert.equal((refsFailed.body.clubs as InboxClub[])[1].board.latest?.id, "m-b1-new");
});

// ── GET /api/orgs/[slug]/space (7.2) ────────────────────────────────────────

const SP = { lounge: "sp-lounge", board: "sp-board", officers: "sp-officers", open: "sp-ev-open", closed: "sp-ev-closed", zeta: "sp-zeta", alpha: "sp-alpha" };
const spaceChannels = () => [
  { id: SP.zeta, kind: "room", name: "zeta", event_id: null, position: 1 },
  { id: SP.closed, kind: "event", name: "Old formal", event_id: "ev-closed", position: 0 },
  { id: SP.board, kind: "board", name: "Board", event_id: null, position: 0 },
  { id: SP.open, kind: "event", name: "Fall formal", event_id: "ev-open", position: 0 },
  { id: "sp-nokind", kind: null, name: "old", event_id: null, position: 0 },
  { id: SP.officers, kind: "officers", name: "Officers", event_id: null, position: 0 },
  { id: SP.alpha, kind: "room", name: "alpha", event_id: null, position: 0 },
  { id: SP.lounge, kind: "lounge", name: "Lounge", event_id: null, position: 0 },
];
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
const spaceCookie: Answerer = (table) => {
  if (table === "channels") return { data: spaceChannels() };
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
const boardPage = async () => ({ ok: true, messages: [{ id: "p1", hidden: false }, { id: "p2", hidden: false }, { id: "p3", hidden: true }], room: BOARD_ROOM, viewerRole: "member" });

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
  spaceWorld({ cookie: (t) => (t === "channels" ? { error: MISSING_KIND } : { data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
  spaceWorld({ cookie: (t) => (t === "channels" ? { error: { code: "XX000", message: "boom" } } : { data: [] }) });
  assert.deepEqual(await space.GET(req(), ctx()), { status: 500, body: { ok: false, error: "Request failed" } });
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
  assert.deepEqual(body.org, { id: ORG1, handle: "salsa", name: "Salsa", logo_url: "/api/orgs/salsa/asset/logo", banner_url: "https://cdn/banner.png", verified: true, member_count: 42 });
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
  assert.deepEqual(Object.keys(body.rooms[0]).sort(), ["can_post", "event", "id", "kind", "name", "unread"]);
  assert.equal(body.board_latest?.id, "p2", "the last non-hidden of the oldest-first page");
  assert.deepEqual(body.up_next.map((e) => e.id), ["ev-open", "ev-x", "ev-y"]);
  assert.equal("upcoming" in body, false);
  assert.deepEqual(reading, [[SP.board, { limit: 6 }, {
    viewerId: VIEWER,
    access: { ok: true, isOrgChannel: true, orgId: ORG1, accepted_at: null, cleared_at: null, kind: "board", eventId: null },
    room: BOARD_ROOM,
  }]]);

  const channels = reads(cookieLog, "channels")[0].calls;
  assert.equal(selectOf(channels), "id, kind, name, event_id, position");
  assert.equal(arg(channels, "eq", "org_id"), ORG1);
  assert.equal(arg(channels, "eq", "type"), "org_channel");
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
  spaceWorld({ refs: async () => null });
  const noRefs = await space.GET(req(), ctx());
  assert.equal(noRefs.status, 200);
  assert.deepEqual(noRefs.body.up_next, []);
  assert.deepEqual((noRefs.body.rooms as SpaceRoom[]).filter((r) => r.kind === "event").map((r) => [r.id, r.event, r.can_post]), [[SP.open, null, true], [SP.closed, null, true]], "no ref: an unknown state is not closed; by name");
  spaceWorld({ service: spaceService("owner") });
  const owner = await space.GET(req(), ctx());
  assert.deepEqual(owner.body.viewer, { role: "owner", can_moderate: true });
  assert.equal((owner.body.rooms as SpaceRoom[])[1].can_post, true);
});

// ── GET /api/me/calendar — the three fields (7.3) ───────────────────────────

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
    kind: "rsvp", id: "ev-club", title: "ev-club", starts_at: T(8), ends_at: T(8, 12), location: "Hall", color: "#5BD18C", viewer_status: "going",
    org: { handle: "salsa", name: "Salsa", verified: true }, org_id: null, room_id: null, room_state: null,
  });
  assert.equal(entries[2].color, "#FFB85A");
  assert.deepEqual(entries[0], { kind: "personal", id: "pe", title: "Dentist", starts_at: T(3), ends_at: null, location: "", notes: "", color: "#fff" });
  assert.equal(asked, 0);
  assert.match(selectOf(reads(cookieLog, "rsvps")[0].calls), /event:events!inner\(id,title,starts_at,ends_at,location,org_id,org:orgs\(handle,name,verified\)\)/);
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
      { id: "ev-club", title: "ev-club", starts_at: T(8), ends_at: T(8, 12), location: "Hall", org_id: ORG1 },
      { id: "ev-solo", title: "ev-solo", starts_at: T(8), ends_at: T(8, 12), location: "Hall", org_id: null },
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
