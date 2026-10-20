/**
 * The three pin routes and `shared`
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.3, 4d; section 9):
 *   GET          /api/me/threads/[id]/message-pins
 *   PUT, DELETE  /api/me/threads/[id]/messages/[messageId]/pin
 *   GET          /api/me/threads/[id]/shared
 * against fakes (the cookie and service clients, the flag, the rate limit,
 * the restriction gate, `ensureMember`, `dmSendBlocked` all answer from one
 * `state` object), plus the mappers of `pins-read.ts` on plain objects and
 * the one pure export of the hook file (`pinTextCut`; the hook itself needs
 * React and a DOM and is not run here).
 *
 * The cookie fake stands for the VIEWER: its `users` read answers only the
 * profiles RLS would return, and its shared read pages like the database
 * (`.lt` and `.limit` applied), so "who may see this author" and "the next
 * read gets the next rows" are tested by rule.
 *
 * Run with:
 *   node --test src/lib/chat/pins-routes.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments
 * as globs, so a path with `[id]` in it never matches (the
 * remove-route.test.ts placement).
 *
 * WHY THE RESOLVE HOOK: the remove-route.test.ts pattern. One difference:
 * `@/lib/messages/channel-access` is replaced (its `ensureMember`) only for
 * the ROUTE files. `message-read.ts` gets the real module, so the shared
 * mapper runs the real `prepareForClient` with the real media-key rule and
 * the real proxy URL. The flag stub exports `chatV2For` and nothing else: a
 * route that imported anything more from `flag-server` would not load.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("pins-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__w3p.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__w3p.service; }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__w3p.service !== undefined; }",
  ),
  "@/lib/chat/flag-server": stub(
    "export async function chatV2For(id) { globalThis.__w3p.log.push(['chatV2For', id]); return globalThis.__w3p.flag; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit(key, opts) { globalThis.__w3p.log.push(['rateLimit', key, opts]); " +
      "return globalThis.__w3p.rateAllowed ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: 600 }; }\n" +
      "export function tooManyRequests(r) { return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), " +
      "{ status: 429, headers: { 'retry-after': String(r.retryAfterSec) } }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireNotRestricted(id) { globalThis.__w3p.log.push(['requireNotRestricted', id]); " +
      "return globalThis.__w3p.restricted ? new Response(JSON.stringify({ ok: false, error: 'restricted' }), { status: 403 }) : null; }",
  ),
  "@/lib/safety/pair-block": stub(
    "export async function dmSendBlocked(client, channelId, userId) { globalThis.__w3p.log.push(['dmSendBlocked', channelId, userId]); return globalThis.__w3p.block; }",
  ),
  // The hook file's three client imports (a .tsx, the toast, the browser's
  // fetch wrapper): only so `use-message-pins.ts` loads and its pure export
  // `pinTextCut` can be called. The hook itself is never run here.
  "@/components/feedback/LoadFailed": stub("export function asLoadFailure() { throw new Error('not in this test'); }"),
  "@/components/mobile/messages/send-failure": stub("export function toastSendFailure() { throw new Error('not in this test'); }"),
  "@/lib/feedback/request": stub("export async function vibeRequest() { throw new Error('not in this test'); }"),
};
/** Only for the route files; every other importer gets the real module. */
const ENSURE_MEMBER_STUB = stub(
  "export async function ensureMember(client, channelId, userId) { globalThis.__w3p.log.push(['ensureMember', channelId, userId]); return globalThis.__w3p.member; }",
);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/messages/channel-access") {
      const parent = (context as { parentURL?: string } | null)?.parentURL ?? "";
      if (parent.endsWith("/route.ts")) return { url: ENSURE_MEMBER_STUB, format: "module", shortCircuit: true };
    }
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const LIST_ROUTE = "../../app/api/me/threads/[id]/message-pins/route.ts";
const PIN_ROUTE = "../../app/api/me/threads/[id]/messages/[messageId]/pin/route.ts";
const SHARED_ROUTE = "../../app/api/me/threads/[id]/shared/route.ts";
const listRoute = (await import(LIST_ROUTE)) as typeof import("../../app/api/me/threads/[id]/message-pins/route");
const pinRoute = (await import(PIN_ROUTE)) as typeof import("../../app/api/me/threads/[id]/messages/[messageId]/pin/route");
const sharedRoute = (await import(SHARED_ROUTE)) as typeof import("../../app/api/me/threads/[id]/shared/route");
const readModule = "./pins-read.ts";
const {
  PIN_AUTHOR_SELECT,
  PIN_LIST_SELECT,
  PIN_LIVE_SELECT,
  PIN_ROWS_MAX,
  SHARED_READS_MAX,
  clampSharedLimit,
  pinAuthorIds,
  pinAuthors,
  pinSlots,
  toPinnedMessages,
  toSharedItems,
} = (await import(readModule)) as typeof import("./pins-read");
const messageReadModule = "./message-read.ts";
const { MESSAGE_SELECT } = (await import(messageReadModule)) as typeof import("./message-read");
const hookModule = "./use-message-pins.ts";
const { pinTextCut } = (await import(hookModule)) as typeof import("./use-message-pins");
type PinRow = import("./pins-read").PinRow;
type MessageRow = import("./message-read").MessageRow;

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Query = { table: string; calls: Call[]; who: "cookie" | "service" };
const METHODS = ["select", "eq", "neq", "is", "in", "or", "gt", "lt", "order", "limit", "maybeSingle", "insert", "delete"];

function fakeClient(answer: (q: Query) => Answer, queries: Query[], who: Query["who"]) {
  return {
    from(table: string) {
      const q: Query = { table, calls: [], who };
      queries.push(q);
      const builder: Record<string, unknown> = {
        then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => answer(q))
            .then(resolve, reject);
        },
      };
      for (const method of METHODS) {
        builder[method] = (...args: unknown[]) => {
          q.calls.push([method, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
}

const CHANNEL = "cccccccc-0000-4000-8000-000000000001";
const OTHER_CHANNEL = "cccccccc-0000-4000-8000-000000000002";
const MESSAGE = "aaaaaaaa-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const AVERY = "22222222-0000-4000-8000-000000000002";
const POST = "bbbbbbbb-0000-4000-8000-000000000001";
const mid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

const DM_MEMBER = { ok: true, isOrgChannel: false, orgId: null, accepted_at: "2026-09-01T00:00:00+00:00", cleared_at: null };
const PENDING_MEMBER = { ...DM_MEMBER, accepted_at: null };
const CLUB_MEMBER = { ok: true, isOrgChannel: true, orgId: "dddddddd-0000-4000-8000-000000000001", accepted_at: null, cleared_at: null, kind: "lounge", eventId: null };
const LIVE_MESSAGE = { id: MESSAGE, created_at: "2026-10-01T12:00:00+00:00", removed_at: null };
const NO_TABLE = { code: "42P01", message: 'relation "public.chat_message_pins" does not exist' };
const BOOM = { code: "XX000", message: "boom" };

type State = {
  cookie: ReturnType<typeof fakeClient>;
  service: ReturnType<typeof fakeClient> | undefined;
  flag: boolean;
  member: unknown;
  rateAllowed: boolean;
  restricted: boolean;
  block: { ok: true; blocked: boolean } | { ok: false; error: unknown };
  log: Call[];
};

type Setup = {
  user?: { id: string } | null;
  flag?: boolean;
  member?: unknown;
  rateAllowed?: boolean;
  restricted?: boolean;
  block?: State["block"];
  service?: false;
  /** PUT's cookie read of the message (null: no row in this chat) or its error. */
  message?: ({ id: string; created_at: string; removed_at: string | null } & Record<string, unknown>) | null;
  messageError?: { code: string; message: string };
  /** The service read of `chat_message_pins` (the list, or PUT's cap count) or its error. */
  pinRows?: PinRow[];
  pinsError?: { code: string; message: string };
  insertError?: { code: string; message: string };
  deleteError?: { code: string; message: string };
  /**
   * The `users` rows the VIEWER's client may read (RLS already applied: a
   * suspended or banned author is simply not among them), or that read's
   * error. Default: Avery. The fake answers the ones asked for with `.in`.
   */
  visibleUsers?: Record<string, unknown>[];
  usersError?: { code: string; message: string };
  /**
   * Every shared row of the chat, newest first, or the read's error. The
   * fake applies `.lt("created_at", …)` and `.limit(…)` and hands out copies
   * (the mapper changes rows in place), so a route that reads on gets the
   * next rows, as from the database.
   */
  sharedRows?: MessageRow[];
  sharedError?: { code: string; message: string };
};

/** The last argument of the last `method` call of a recorded chain. */
const argOf = (q: Query, method: string): unknown => q.calls.filter((c) => c[0] === method).at(-1)?.at(-1);

function setup(s: Setup) {
  const queries: Query[] = [];
  const cookie = Object.assign(
    fakeClient((q) => {
      if (q.table === "users") {
        if (s.usersError) return { data: null, error: s.usersError };
        const asked = new Set((argOf(q, "in") as string[] | undefined) ?? []);
        return { data: (s.visibleUsers ?? [AVERY_ROW]).filter((u) => asked.has(String(u.id))), error: null };
      }
      if (q.table !== "messages") throw new Error(`unexpected cookie read of ${q.table}`);
      if (q.calls.some((c) => c[0] === "maybeSingle")) {
        return s.messageError ? { data: null, error: s.messageError } : { data: s.message === undefined ? LIVE_MESSAGE : s.message, error: null };
      }
      if (s.sharedError) return { data: null, error: s.sharedError };
      const before = argOf(q, "lt") as string | undefined;
      const limit = argOf(q, "limit") as number | undefined;
      const older = (s.sharedRows ?? []).filter((row) => before === undefined || row.created_at < before);
      return { data: structuredClone(older.slice(0, limit)), error: null };
    }, queries, "cookie"),
    { auth: { getUser: async () => ({ data: { user: s.user === undefined ? { id: ME } : s.user }, error: null }) } },
  );
  const service =
    s.service === false
      ? undefined
      : fakeClient((q) => {
          if (q.table !== "chat_message_pins") throw new Error(`unexpected service read of ${q.table}`);
          const method = q.calls[0]?.[0];
          if (method === "insert") return { data: null, error: s.insertError ?? null };
          if (method === "delete") return { data: null, error: s.deleteError ?? null };
          return s.pinsError ? { data: null, error: s.pinsError } : { data: s.pinRows ?? [], error: null };
        }, queries, "service");
  const state: State = {
    cookie,
    service,
    flag: s.flag ?? true,
    member: s.member ?? DM_MEMBER,
    rateAllowed: s.rateAllowed ?? true,
    restricted: s.restricted ?? false,
    block: s.block ?? { ok: true, blocked: false },
    log: [],
  };
  (globalThis as unknown as { __w3p: State }).__w3p = state;
  return { state, queries };
}

type Reply = { status: number; body: Record<string, unknown>; cache: string | null };
async function reply(res: Response): Promise<Reply> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cache: res.headers.get("cache-control") };
}
const req = (query = "") => new Request(`http://vibe.test/${query}`);
const list = async (channelId = CHANNEL) => reply(await listRoute.GET(req(), { params: Promise.resolve({ id: channelId }) }));
const shared = async (query = "", channelId = CHANNEL) =>
  reply(await sharedRoute.GET(req(query), { params: Promise.resolve({ id: channelId }) }));
const put = async (channelId = CHANNEL, messageId = MESSAGE) =>
  reply(await pinRoute.PUT(req(), { params: Promise.resolve({ id: channelId, messageId }) }));
const del = async (channelId = CHANNEL, messageId = MESSAGE) =>
  reply(await pinRoute.DELETE(req(), { params: Promise.resolve({ id: channelId, messageId }) }));

const names = (log: Call[]) => log.map((c) => c[0]);
/** Every step in order: `who:table:first method`. */
const steps = (queries: Query[]) => queries.map((q) => `${q.who}:${q.table}:${String(q.calls[0]?.[0])}`);
const NOT_FOUND = { ok: false, error: "That's not there anymore.", code: "not_found" };
const NOT_ALLOWED = { ok: false, error: "You can't pin messages in this chat.", code: "pin_not_allowed" };
const CHATS_ONLY = { ok: false, error: "Pinning only works in direct messages and group chats.", code: "pins_chats_only" };
const TRY_AGAIN = { ok: false, error: "Try again in a moment.", code: "try_again" };

/** A pin row as `PIN_LIVE_SELECT` reads it. */
const livePin = (n: number, removedAt: string | null = null): PinRow => ({
  message_id: mid(n),
  pinned_at: "2026-10-02T00:00:00+00:00",
  message: { removed_at: removedAt },
});
const pinsOf = (count: number, from = 100) => Array.from({ length: count }, (_, i) => livePin(from + i));

// ── The gates every route shares (4.3's first line) ─────────────────────────

const ROUTES: [string, () => Promise<Reply>, (channelId: string) => Promise<Reply>][] = [
  ["GET message-pins", list, (id) => list(id)],
  ["PUT pin", put, (id) => put(id)],
  ["DELETE pin", del, (id) => del(id)],
  ["GET shared", shared, (id) => shared("", id)],
];

test("signed out → 401 Unauthorized, before the flag, nothing read", async () => {
  for (const [name, run] of ROUTES) {
    const { state, queries } = setup({ user: null });
    const r = await run();
    assert.deepEqual([r.status, r.body], [401, { ok: false, error: "Unauthorized" }], name);
    assert.deepEqual(state.log, [], name);
    assert.equal(queries.length, 0, name);
  }
});

test("flag off → 404 not_found, before the ids and before ensureMember", async () => {
  for (const [name, run] of ROUTES) {
    const { state, queries } = setup({ flag: false });
    const r = await run();
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], name);
    assert.deepEqual(state.log, [["chatV2For", ME]], name);
    assert.equal(queries.length, 0, name);
  }
});

test("a non-uuid [id] → 404 not_found after the flag, ensureMember never asked", async () => {
  for (const [name, , runWith] of ROUTES) {
    const { state, queries } = setup({});
    const r = await runWith("not-a-uuid");
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], name);
    assert.deepEqual(names(state.log), ["chatV2For"], name);
    assert.equal(queries.length, 0, name);
  }
});

test("a non-uuid [messageId] → 404 not_found on PUT and DELETE, ensureMember never asked", async () => {
  for (const run of [put, del]) {
    const { state, queries } = setup({});
    const r = await run(CHANNEL, "42");
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
    assert.deepEqual(names(state.log), ["chatV2For"]);
    assert.equal(queries.length, 0);
  }
});

test("not a member → ensureMember's status and Not a member", async () => {
  for (const status of [403, 500]) {
    for (const [name, run] of ROUTES) {
      const { state, queries } = setup({ member: { ok: false, status } });
      const r = await run();
      assert.deepEqual([r.status, r.body], [status, { ok: false, error: "Not a member" }], name);
      assert.deepEqual(state.log, [["chatV2For", ME], ["ensureMember", CHANNEL, ME]], name);
      assert.equal(queries.length, 0, name);
    }
  }
});

test("a club room → 400 pins_chats_only, before the rate limit and before any read", async () => {
  for (const [name, run] of ROUTES) {
    const { state, queries } = setup({ member: CLUB_MEMBER });
    const r = await run();
    assert.deepEqual([r.status, r.body], [400, CHATS_ONLY], name);
    assert.deepEqual(names(state.log), ["chatV2For", "ensureMember"], name);
    assert.equal(queries.length, 0, name);
  }
});

test("the two GETs answer `Cache-Control: private, no-store`, on a refusal too", async () => {
  for (const run of [list, shared]) {
    setup({});
    assert.equal((await run()).cache, "private, no-store");
    setup({ flag: false });
    assert.equal((await run()).cache, "private, no-store");
    setup({ user: null });
    assert.equal((await run()).cache, "private, no-store");
  }
});

test("the routes import only chatV2For from flag-server, and never flag-desktop-server", () => {
  for (const path of [LIST_ROUTE, PIN_ROUTE, SHARED_ROUTE]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const imports = source.split("\n").filter((line) => line.includes("flag-server") || line.includes("flag-desktop-server"));
    assert.deepEqual(imports, ['import { chatV2For } from "@/lib/chat/flag-server";'], path);
  }
});

// ── GET /api/me/threads/[id]/message-pins ───────────────────────────────────

const pinRow = (n: number, pinnedAt: string, message: PinRow["message"]): PinRow => ({ message_id: mid(n), pinned_at: pinnedAt, message });
const AVERY_ROW = { id: AVERY, handle: "avery", name: "Avery", avatar_url: null };
/** A suspended author: the service role reads this row, the viewer's client does not. */
const BLAKE = "33333333-0000-4000-8000-000000000003";
const BLAKE_ROW = { id: BLAKE, handle: "blake", name: "Blake", avatar_url: "avatars/blake.jpg" };
/** The authors' read answered with Avery only, as `pinAuthors` hands it to the mapper. */
const AVERY_ONLY = pinAuthors([AVERY_ROW]);
/** A message as `PIN_LIST_SELECT` embeds it: no `users` (the author is read apart, by `user_id`). */
const said = (n: number, content: string, createdAt: string, more: Record<string, unknown> = {}) => ({
  id: mid(n),
  content,
  created_at: createdAt,
  user_id: AVERY,
  media_url: null,
  media_kind: null,
  attachment_id: null,
  removed_at: null,
  ...more,
});

test("list: the gate order is flag, ensureMember, then ONE service read; no rate limit, no restriction gate; no pins, no authors' read", async () => {
  const { state, queries } = setup({});
  const r = await list();
  assert.deepEqual([r.status, r.body], [200, { ok: true, pins: [], cap: 20 }]);
  assert.deepEqual(state.log, [["chatV2For", ME], ["ensureMember", CHANNEL, ME]]);
  assert.deepEqual(steps(queries), ["service:chat_message_pins:select"]);
  assert.deepEqual(queries[0].calls, [
    ["select", PIN_LIST_SELECT],
    ["eq", "channel_id", CHANNEL],
    ["order", "pinned_at", { ascending: false }],
    ["limit", PIN_ROWS_MAX],
  ]);
});

test("list: a pending request and a blocked pair may still read", async () => {
  setup({ member: PENDING_MEMBER, block: { ok: true, blocked: true }, restricted: true });
  assert.equal((await list()).status, 200);
});

test("list: a missing table → 404 not_found (pins read as unavailable); another failure → 503 try_again", async () => {
  for (const error of [NO_TABLE, { code: "PGRST205", message: "Could not find the table" }]) {
    setup({ pinsError: error });
    const r = await list();
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], error.code);
  }
  setup({ pinsError: BOOM });
  assert.deepEqual((await list()).body, TRY_AGAIN);
  setup({ service: false });
  const r = await list();
  assert.deepEqual([r.status, r.body], [503, TRY_AGAIN]);
});

test("list: newest pin first, removed and cleared rows dropped, text cut at 140 while full_text is whole", async () => {
  const long = `${"word ".repeat(40)}end`; // 203 characters
  const rows: PinRow[] = [
    pinRow(1, "2026-10-01T10:00:00+00:00", said(1, "the oldest pin", "2026-09-20T09:00:00+00:00")),
    pinRow(2, "2026-10-03T10:00:00+00:00", said(2, long, "2026-09-21T09:00:00+00:00")),
    pinRow(3, "2026-10-02T10:00:00+00:00", said(3, "removed by a moderator", "2026-09-22T09:00:00+00:00", { removed_at: "2026-09-30T00:00:00+00:00" })),
    pinRow(4, "2026-10-02T11:00:00+00:00", said(4, "from before I cleared the chat", "2026-09-10T09:00:00+00:00")),
    pinRow(5, "2026-10-02T12:00:00+00:00", null),
  ];
  // The fake hands the rows back in the order above: the mapper sorts, it does not trust the read.
  const { queries } = setup({ pinRows: rows, member: { ...DM_MEMBER, cleared_at: "2026-09-15T00:00:00+00:00" } });
  const r = await list();
  assert.equal(r.status, 200);
  // The pins with the service role, then their authors on the VIEWER's client: one id, asked once.
  assert.deepEqual(steps(queries), ["service:chat_message_pins:select", "cookie:users:select"]);
  assert.deepEqual(queries[1].calls, [["select", PIN_AUTHOR_SELECT], ["in", "id", [AVERY]]]);
  assert.equal(r.body.cap, 20);
  const pins = r.body.pins as Record<string, unknown>[];
  assert.deepEqual(pins.map((p) => p.message_id), [mid(2), mid(1)]);
  assert.equal(pins[0].full_text, long, "the whole message, not cut");
  assert.equal((pins[0].text as string).length, 140);
  assert.ok((pins[0].text as string).endsWith("…"));
  assert.deepEqual(pins[1], {
    message_id: mid(1),
    pinned_at: "2026-10-01T10:00:00+00:00",
    created_at: "2026-09-20T09:00:00+00:00",
    text: "the oldest pin",
    full_text: "the oldest pin",
    author: AVERY_ROW,
    media_kind: null,
    has_post: false,
  });
  assert.ok(!JSON.stringify(r.body).includes("removed_at"), "a column that is only read never reaches the JSON");
});

test("list: without a clear mark nothing is dropped for its date", async () => {
  setup({ pinRows: [pinRow(4, "2026-10-02T11:00:00+00:00", said(4, "old", "2020-01-01T00:00:00+00:00"))] });
  assert.equal(((await list()).body.pins as unknown[]).length, 1);
});

test("list: an author the viewer's own client cannot read (suspended, banned) → author null; the service role never reads a profile", async () => {
  assert.ok(!PIN_LIST_SELECT.includes("users"), "no users embed in the service read");
  const rows: PinRow[] = [
    pinRow(1, "2026-10-02T10:00:00+00:00", said(1, "from Avery", "2026-09-20T09:00:00+00:00")),
    pinRow(2, "2026-10-01T10:00:00+00:00", said(2, "door code is 4411", "2026-09-21T09:00:00+00:00", { user_id: BLAKE })),
    // Removed, and before the clear mark: neither is shown, so neither author is asked for.
    pinRow(3, "2026-10-01T09:00:00+00:00", said(3, "gone", "2026-09-22T09:00:00+00:00", { user_id: ME, removed_at: "2026-09-30T00:00:00+00:00" })),
    pinRow(4, "2026-10-01T08:00:00+00:00", said(4, "cleared", "2026-09-01T09:00:00+00:00", { user_id: ME })),
  ];
  const member = { ...DM_MEMBER, cleared_at: "2026-09-15T00:00:00+00:00" };
  // RLS returns Avery only: Blake's row exists (BLAKE_ROW), the viewer's client does not get it.
  const { queries } = setup({ pinRows: rows, member, visibleUsers: [AVERY_ROW] });
  const r = await list();
  assert.equal(r.status, 200);
  assert.deepEqual(queries.map((q) => `${q.who}:${q.table}`), ["service:chat_message_pins", "cookie:users"], "users is read on the cookie client only");
  assert.deepEqual(queries[1].calls, [["select", PIN_AUTHOR_SELECT], ["in", "id", [AVERY, BLAKE]]]);
  const pins = r.body.pins as { message_id: string; author: unknown; text: string }[];
  assert.deepEqual(pins.map((p) => [p.message_id, p.author]), [[mid(1), AVERY_ROW], [mid(2), null]]);
  assert.equal(pins[1].text, "door code is 4411", "the pin itself still shows");
  const sent = JSON.stringify(r.body);
  for (const secret of [BLAKE_ROW.handle, BLAKE_ROW.name, BLAKE_ROW.avatar_url]) assert.ok(!sent.includes(secret), secret);
});

test("list: the authors' read failing costs the names, not the list (200, every author null)", async () => {
  const { queries } = setup({
    pinRows: [pinRow(1, "2026-10-02T10:00:00+00:00", said(1, "still here", "2026-09-20T09:00:00+00:00"))],
    usersError: BOOM,
  });
  const r = await list();
  assert.equal(r.status, 200);
  assert.deepEqual(steps(queries), ["service:chat_message_pins:select", "cookie:users:select"]);
  assert.deepEqual((r.body.pins as { text: string; author: unknown }[]).map((p) => [p.text, p.author]), [["still here", null]]);
});

// ── The mappers on plain objects (pins-read.ts) ─────────────────────────────

test("pinAuthorIds: the distinct authors of the pins that are shown; pinAuthors: rows by id, null and junk are empty", () => {
  const rows = [
    pinRow(1, "2026-10-01T10:00:00+00:00", said(1, "a", "2026-09-20T09:00:00+00:00")),
    pinRow(2, "2026-10-01T11:00:00+00:00", [said(2, "b", "2026-09-20T09:00:00+00:00")]),
    pinRow(3, "2026-10-01T12:00:00+00:00", said(3, "c", "2026-09-20T09:00:00+00:00", { user_id: BLAKE })),
    pinRow(4, "2026-10-01T13:00:00+00:00", said(4, "removed", "2026-09-20T09:00:00+00:00", { user_id: ME, removed_at: "2026-09-30T00:00:00+00:00" })),
    pinRow(5, "2026-10-01T14:00:00+00:00", null),
    pinRow(6, "2026-10-01T15:00:00+00:00", said(6, "no author column", "2026-09-20T09:00:00+00:00", { user_id: undefined })),
  ];
  assert.deepEqual(pinAuthorIds(rows, null), [AVERY, BLAKE]);
  assert.deepEqual(pinAuthorIds(rows, "2026-09-20T09:00:00+00:00"), [], "every message is at the clear mark");
  assert.deepEqual(pinAuthorIds(null, null), []);
  assert.deepEqual([...pinAuthors([AVERY_ROW, null, "x", { handle: "no id" }, { id: BLAKE }])], [
    [AVERY, AVERY_ROW],
    [BLAKE, { id: BLAKE, handle: "", name: "", avatar_url: null }],
  ]);
  assert.equal(pinAuthors(null).size, 0);
});

test("toPinnedMessages: a photo, a video and a shared post with no words; an author who is not in the viewer's read", () => {
  const pins = toPinnedMessages(
    [
      pinRow(1, "2026-10-01T10:00:00+00:00", said(1, "", "2026-09-20T09:00:00+00:00", { media_url: `messages/${CHANNEL}/a.jpg`, media_kind: "image" })),
      pinRow(2, "2026-10-01T11:00:00+00:00", said(2, "", "2026-09-20T09:00:00+00:00", { media_url: `messages/${CHANNEL}/b.mp4`, media_kind: "video" })),
      pinRow(3, "2026-10-01T12:00:00+00:00", said(3, "", "2026-09-20T09:00:00+00:00", { attachment_id: POST, user_id: BLAKE })),
    ],
    null,
    AVERY_ONLY,
  );
  assert.deepEqual(pins.map((p) => [p.text, p.full_text, p.media_kind, p.has_post, p.author?.handle ?? null]), [
    ["", "", null, true, null],
    ["", "", "video", false, "avery"],
    ["", "", "image", false, "avery"],
  ]);
});

test("toPinnedMessages: text is one line, full_text keeps its line breaks; pinTextCut (the hook file's export) is not a length test", () => {
  const [short] = toPinnedMessages([pinRow(1, "2026-10-01T10:00:00+00:00", said(1, "  Bring:\n\n  cups,   ice  ", "2026-09-20T09:00:00+00:00"))], null, AVERY_ONLY);
  assert.equal(short.text, "Bring: cups, ice");
  assert.equal(short.full_text, "Bring:\n\n  cups,   ice");
  assert.ok(short.full_text.length > short.text.length, "longer, and still not cut");
  assert.equal(pinTextCut(short), false);
  const [long] = toPinnedMessages([pinRow(2, "2026-10-01T10:00:00+00:00", said(2, "x".repeat(141), "2026-09-20T09:00:00+00:00"))], null, AVERY_ONLY);
  assert.equal(long.text.length, 140);
  assert.equal(long.full_text.length, 141);
  assert.equal(pinTextCut(long), true);
  const [edge] = toPinnedMessages([pinRow(3, "2026-10-01T10:00:00+00:00", said(3, "x".repeat(140), "2026-09-20T09:00:00+00:00"))], null, AVERY_ONLY);
  assert.equal(pinTextCut(edge), false);
  // A photo, a video or a post with no words: nothing to open.
  assert.equal(pinTextCut({ text: "", full_text: "" }), false);
});

test("pinTextCut is the ONE 'was the quote cut' rule: the hook file exports it and holds no length comparison", () => {
  const source = readFileSync(new URL("./use-message-pins.ts", import.meta.url), "utf8");
  assert.match(source, /export function pinTextCut\(pin: Pick<PinnedMessage, "text" \| "full_text">\): boolean/);
  assert.match(source, /pin\.text !== pin\.full_text\.replace\(\/\\s\+\/g, " "\)\.trim\(\)/);
  assert.doesNotMatch(source, /full_text\.length/);
});

test("toPinnedMessages: the clear mark is strict (a message AT the mark is dropped) and reads microseconds", () => {
  const at = "2026-09-15T00:00:00.123456+00:00";
  const rows = [
    pinRow(1, "2026-10-01T10:00:00+00:00", said(1, "at the mark", at)),
    pinRow(2, "2026-10-01T11:00:00+00:00", said(2, "a microsecond later", "2026-09-15T00:00:00.123457+00:00")),
  ];
  assert.deepEqual(toPinnedMessages(rows, at, AVERY_ONLY).map((p) => p.message_id), [mid(2)]);
});

test("toPinnedMessages: equal milliseconds are ordered by the microseconds; an embed that came as a list is read; null is empty", () => {
  const rows = [
    pinRow(1, "2026-10-01T10:00:00.000100+00:00", [said(1, "first", "2026-09-20T09:00:00+00:00")]),
    pinRow(2, "2026-10-01T10:00:00.000200+00:00", said(2, "second", "2026-09-20T09:00:00+00:00")),
  ];
  assert.deepEqual(toPinnedMessages(rows, null, AVERY_ONLY).map((p) => [p.text, p.author?.handle]), [["second", "avery"], ["first", "avery"]]);
  assert.deepEqual(toPinnedMessages(rows, null, new Map()).map((p) => p.author), [null, null], "no authors read: every author null");
  assert.deepEqual(toPinnedMessages(null, null, AVERY_ONLY), []);
});

test("toPinnedMessages and pinSlots: a pin on a deleted message's note is not listed and takes no slot (B7 review, Oct 19, 2026)", () => {
  const note = { content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null };
  const rows = [
    pinRow(1, "2026-10-02T10:00:00+00:00", said(1, "", "2026-09-22T09:00:00+00:00", note)),
    pinRow(2, "2026-10-01T10:00:00+00:00", said(2, "still here", "2026-09-21T09:00:00+00:00")),
  ];
  assert.deepEqual(toPinnedMessages(rows, null, AVERY_ONLY).map((p) => p.message_id), [mid(2)], "no empty \"Attachment\" pin");
  assert.deepEqual(pinAuthorIds(rows, null), [AVERY]);
  const live: PinRow[] = [...pinsOf(19), { message_id: mid(60), pinned_at: "2026-10-02T00:00:00+00:00", message: { removed_at: null, ...note } }];
  assert.deepEqual(pinSlots(live, MESSAGE), { live: 19, among: false }, "the note's pin frees its slot");
  assert.ok(PIN_LIVE_SELECT.includes("attachment_kind") && PIN_LIST_SELECT.includes("attachment_kind"), "both reads can tell a shared post from a note");
});

test("pinSlots: a pin on a removed message takes no slot; `among` ignores case", () => {
  const rows = [...pinsOf(19), livePin(7, "2026-09-30T00:00:00+00:00"), { message_id: mid(8), pinned_at: "x", message: null }];
  assert.deepEqual(pinSlots(rows, mid(7).toUpperCase()), { live: 19, among: true });
  assert.deepEqual(pinSlots(rows, MESSAGE), { live: 19, among: false });
  assert.deepEqual(pinSlots(null, MESSAGE), { live: 0, among: false });
});

test("clampSharedLimit: 1 to 60, 30 for nothing or not a number", () => {
  const cases: [string | null, number][] = [[null, 30], ["", 30], ["abc", 30], ["0", 1], ["-5", 1], ["1", 1], ["12.9", 12], ["60", 60], ["61", 60], ["1e9", 60]];
  for (const [raw, want] of cases) assert.equal(clampSharedLimit(raw), want, String(raw));
});

// ── PUT /api/me/threads/[id]/messages/[messageId]/pin ───────────────────────

test("PUT: the whole gate order, then the pin → { ok, pinned }", async () => {
  const { state, queries } = setup({});
  const r = await put();
  assert.deepEqual([r.status, r.body], [200, { ok: true, pinned: true }]);
  assert.deepEqual(state.log, [
    ["chatV2For", ME],
    ["ensureMember", CHANNEL, ME],
    ["rateLimit", `message-pin:${ME}`, { limit: 30, windowSec: 600 }],
    ["requireNotRestricted", ME],
    ["dmSendBlocked", CHANNEL, ME],
  ]);
  assert.deepEqual(steps(queries), ["cookie:messages:select", "service:chat_message_pins:select", "service:chat_message_pins:insert"]);
  assert.deepEqual(queries[0].calls, [
    ["select", "id, created_at, removed_at, content, kind, media_url, media_kind, attachment_id, attachment_kind, card_event_id"],
    ["eq", "id", MESSAGE],
    ["eq", "channel_id", CHANNEL],
    ["maybeSingle"],
  ]);
  assert.deepEqual(queries[1].calls, [["select", PIN_LIVE_SELECT], ["eq", "channel_id", CHANNEL], ["limit", PIN_ROWS_MAX]]);
  assert.deepEqual(queries[2].calls, [["insert", { message_id: MESSAGE, channel_id: CHANNEL, pinned_by: ME }]]);
});

test("PUT: the pin bucket → 429 after ensureMember, before the restriction gate", async () => {
  const { state, queries } = setup({ rateAllowed: false });
  assert.equal((await put()).status, 429);
  assert.deepEqual(names(state.log), ["chatV2For", "ensureMember", "rateLimit"]);
  assert.equal(queries.length, 0);
});

test("PUT: a restricted caller → the gate's own response, before the request and block checks", async () => {
  const { state, queries } = setup({ restricted: true, member: PENDING_MEMBER });
  const r = await put();
  assert.deepEqual([r.status, r.body], [403, { ok: false, error: "restricted" }]);
  assert.deepEqual(names(state.log), ["chatV2For", "ensureMember", "rateLimit", "requireNotRestricted"]);
  assert.equal(queries.length, 0);
});

test("PUT: a pending request → 403 pin_not_allowed, before the block check and any read", async () => {
  const { state, queries } = setup({ member: PENDING_MEMBER });
  const r = await put();
  assert.deepEqual([r.status, r.body], [403, NOT_ALLOWED]);
  assert.deepEqual(names(state.log), ["chatV2For", "ensureMember", "rateLimit", "requireNotRestricted"]);
  assert.equal(queries.length, 0);
});

test("PUT: a blocked pair → 403 pin_not_allowed; a block check that failed → 503 try_again; neither reads", async () => {
  const blocked = setup({ block: { ok: true, blocked: true } });
  const r = await put();
  assert.deepEqual([r.status, r.body], [403, NOT_ALLOWED]);
  assert.equal(blocked.queries.length, 0);
  const failed = setup({ block: { ok: false, error: "boom" } });
  const f = await put();
  assert.deepEqual([f.status, f.body], [503, TRY_AGAIN]);
  assert.equal(failed.queries.length, 0);
});

test("PUT: a message of another chat (no row for this [id]) → 404 not_found, no service read", async () => {
  const { queries } = setup({ message: null });
  const r = await put(OTHER_CHANNEL);
  assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  assert.deepEqual(steps(queries), ["cookie:messages:select"]);
  assert.deepEqual(queries[0].calls.slice(1, 3), [["eq", "id", MESSAGE], ["eq", "channel_id", OTHER_CHANNEL]], "the read is scoped to [id]");
});

test("PUT: a message at or before the caller's clear mark → 404 not_found; one after it pins", async () => {
  const cleared = (at: string) => ({ ...DM_MEMBER, cleared_at: at });
  for (const mark of ["2026-10-01T12:00:00+00:00", "2026-10-02T00:00:00+00:00"]) {
    const { queries } = setup({ member: cleared(mark) });
    const r = await put();
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], mark);
    assert.deepEqual(steps(queries), ["cookie:messages:select"], mark);
  }
  setup({ member: cleared("2026-10-01T11:59:59+00:00") });
  assert.deepEqual((await put()).body, { ok: true, pinned: true });
});

test("PUT: a removed message its author can still read → 404 not_found, never pinned (wave-1 review)", async () => {
  const { queries } = setup({ message: { ...LIVE_MESSAGE, removed_at: "2026-10-02T00:00:00+00:00" } });
  const r = await put();
  assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  assert.deepEqual(steps(queries), ["cookie:messages:select"]);
});

test("PUT: a message its sender deleted (its \"Message deleted\" note) → 404 not_found, no cap read, never pinned (B7 review, Oct 19, 2026)", async () => {
  const note = { ...LIVE_MESSAGE, content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null };
  const { queries } = setup({ message: note });
  const r = await put();
  assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  assert.deepEqual(steps(queries), ["cookie:messages:select"]);
  // A shared post with no words is not a note: it pins.
  setup({ message: { ...note, attachment_id: mid(50), attachment_kind: "post" } });
  assert.deepEqual((await put()).body, { ok: true, pinned: true });
});

test("PUT: a message read that fails → 503 try_again", async () => {
  setup({ messageError: BOOM });
  const r = await put();
  assert.deepEqual([r.status, r.body], [503, TRY_AGAIN]);
});

test("PUT: the cap: 20 live pins → 409 pin_limit and no insert; 19 → pinned", async () => {
  const full = setup({ pinRows: pinsOf(20) });
  const r = await put();
  assert.deepEqual([r.status, r.body], [409, { ok: false, error: "This chat already has 20 pinned messages. Unpin one first.", code: "pin_limit" }]);
  assert.ok(!steps(full.queries).includes("service:chat_message_pins:insert"));
  setup({ pinRows: pinsOf(19) });
  assert.deepEqual((await put()).body, { ok: true, pinned: true });
});

test("PUT: the cap counts only pins whose message is live (wave-1 review)", async () => {
  // 19 live pins and 5 on removed messages: 24 rows, 19 slots taken.
  setup({ pinRows: [...pinsOf(19), ...Array.from({ length: 5 }, (_, i) => livePin(500 + i, "2026-09-30T00:00:00+00:00"))] });
  assert.deepEqual((await put()).body, { ok: true, pinned: true });
  // 20 live ones beside them: full.
  setup({ pinRows: [...pinsOf(20), livePin(500, "2026-09-30T00:00:00+00:00")] });
  assert.equal((await put()).status, 409);
});

test("PUT: re-pinning an already pinned message at the cap → { ok, pinned, already }, not pin_limit", async () => {
  const mine: PinRow = { message_id: MESSAGE, pinned_at: "2026-10-02T00:00:00+00:00", message: { removed_at: null } };
  const { queries } = setup({ pinRows: [...pinsOf(19), mine], insertError: { code: "23505", message: "duplicate key value violates unique constraint" } });
  const r = await put();
  assert.deepEqual([r.status, r.body], [200, { ok: true, pinned: true, already: true }]);
  assert.equal(steps(queries).at(-1), "service:chat_message_pins:insert");
});

test("PUT: a missing table → 404 not_found at the count and at the insert; the service role not configured → 503", async () => {
  for (const s of [{ pinsError: NO_TABLE }, { insertError: NO_TABLE }, { insertError: { code: "PGRST204", message: "no column" } }] as Setup[]) {
    setup(s);
    const r = await put();
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], JSON.stringify(s));
  }
  setup({ service: false });
  const r = await put();
  assert.deepEqual([r.status, r.body], [503, TRY_AGAIN]);
});

test("PUT: the message deleted a moment ago (23503) → 404 not_found; any other write failure → 503 try_again", async () => {
  setup({ insertError: { code: "23503", message: "violates foreign key constraint" } });
  assert.deepEqual((await put()).body, NOT_FOUND);
  setup({ insertError: BOOM });
  assert.deepEqual((await put()).body, TRY_AGAIN);
  setup({ pinsError: BOOM });
  assert.deepEqual((await put()).body, TRY_AGAIN);
});

// ── DELETE /api/me/threads/[id]/messages/[messageId]/pin ────────────────────

test("DELETE: the gate order (no block check, no message read), then the service delete → { ok, pinned: false }", async () => {
  const { state, queries } = setup({});
  const r = await del();
  assert.deepEqual([r.status, r.body], [200, { ok: true, pinned: false }]);
  assert.deepEqual(state.log, [
    ["chatV2For", ME],
    ["ensureMember", CHANNEL, ME],
    ["rateLimit", `message-pin:${ME}`, { limit: 30, windowSec: 600 }],
    ["requireNotRestricted", ME],
  ]);
  assert.deepEqual(steps(queries), ["service:chat_message_pins:delete"]);
  assert.deepEqual(queries[0].calls, [["delete"], ["eq", "message_id", MESSAGE], ["eq", "channel_id", CHANNEL]]);
});

test("DELETE: a blocked pair may still unpin (dmSendBlocked is never asked)", async () => {
  const { state } = setup({ block: { ok: true, blocked: true } });
  assert.deepEqual((await del()).body, { ok: true, pinned: false });
  assert.ok(!names(state.log).includes("dmSendBlocked"));
});

test("DELETE: zero rows deleted is the same answer (the fake deletes nothing)", async () => {
  setup({ pinRows: [] });
  assert.deepEqual(await del(CHANNEL, mid(999)), { status: 200, body: { ok: true, pinned: false }, cache: null });
});

test("DELETE: the bucket 429, a restricted caller, a pending request 403 pin_not_allowed: none of them deletes", async () => {
  const limited = setup({ rateAllowed: false });
  assert.equal((await del()).status, 429);
  const restricted = setup({ restricted: true });
  assert.deepEqual((await del()).body, { ok: false, error: "restricted" });
  const pending = setup({ member: PENDING_MEMBER });
  const r = await del();
  assert.deepEqual([r.status, r.body], [403, NOT_ALLOWED]);
  for (const run of [limited, restricted, pending]) assert.equal(run.queries.length, 0);
});

test("DELETE: a missing table → 404 not_found; another failure → 503 try_again; no service role → 503", async () => {
  setup({ deleteError: NO_TABLE });
  const gone = await del();
  assert.deepEqual([gone.status, gone.body], [404, NOT_FOUND]);
  setup({ deleteError: BOOM });
  assert.deepEqual((await del()).body, TRY_AGAIN);
  setup({ service: false });
  assert.equal((await del()).status, 503);
});

// ── GET /api/me/threads/[id]/shared ─────────────────────────────────────────

const PHOTO_KEY = `messages/${CHANNEL}/photo-1.jpg`;
const sharedRow = (n: number, more: Partial<MessageRow> = {}): MessageRow => ({
  id: mid(n),
  content: "",
  created_at: `2026-10-01T12:00:${String(59 - n).padStart(2, "0")}+00:00`,
  user_id: AVERY,
  media_url: null,
  media_kind: null,
  attachment_id: null,
  attachment: null,
  removed_at: null,
  ...more,
});
const post = () => ({
  id: POST,
  type: "post",
  content: "Rush week starts Monday",
  media_url: "orgs/dddddddd-0000-4000-8000-000000000001/flyer.jpg",
  media_thumbnail_url: null,
  user_id: AVERY,
  author: AVERY_ROW,
});

test("shared: the gate order is flag, ensureMember, then ONE cookie read with the thread's select; the query's shape", async () => {
  const { state, queries } = setup({});
  const r = await shared();
  assert.deepEqual([r.status, r.body], [200, { ok: true, items: [], has_more: false }]);
  assert.deepEqual(state.log, [["chatV2For", ME], ["ensureMember", CHANNEL, ME]]);
  assert.deepEqual(steps(queries), ["cookie:messages:select"]);
  assert.deepEqual(queries[0].calls, [
    ["select", MESSAGE_SELECT],
    ["eq", "channel_id", CHANNEL],
    ["or", "media_url.not.is.null,attachment_id.not.is.null"],
    ["is", "removed_at", null],
    ["order", "created_at", { ascending: false }],
    ["limit", 31],
  ]);
});

test("shared: the clear mark, `before` and `limit` reach the read (limit + 1 rows asked)", async () => {
  const { queries } = setup({ member: { ...DM_MEMBER, cleared_at: "2026-09-15T00:00:00+00:00" } });
  await shared("?before=2026-10-01T12:00:00.123456%2B00:00&limit=5");
  assert.deepEqual(queries[0].calls.slice(4), [
    ["gt", "created_at", "2026-09-15T00:00:00+00:00"],
    ["lt", "created_at", "2026-10-01T12:00:00.123456+00:00"],
    ["order", "created_at", { ascending: false }],
    ["limit", 6],
  ]);
  const wide = setup({});
  await shared("?limit=500");
  assert.deepEqual(wide.queries[0].calls.at(-1), ["limit", 61]);
});

test("shared: a `before` that is not a timestamp → 400 invalid_after, nothing read", async () => {
  for (const bad of ["yesterday", "2026-13-01T00:00:00Z", "2026-10-01"]) {
    const { queries } = setup({});
    const r = await shared(`?before=${encodeURIComponent(bad)}`);
    assert.deepEqual([r.status, r.body], [400, { ok: false, error: "Reload to catch up.", code: "invalid_after" }], bad);
    assert.equal(queries.length, 0, bad);
  }
});

test("shared: media_url is the proxy URL, never the stored key; a post goes out as the thread sends it; a media-less row whose post is gone is skipped", async () => {
  setup({
    sharedRows: [
      sharedRow(1, { media_url: PHOTO_KEY, media_kind: "image" }),
      sharedRow(2, { media_url: `messages/${CHANNEL}/clip.mp4`, media_kind: "video" }),
      sharedRow(3, { attachment_id: POST, attachment_kind: "post", attachment: post() }),
      sharedRow(4, { attachment_id: POST, attachment_kind: "post", attachment: null }),
      sharedRow(5, { media_url: `messages/${OTHER_CHANNEL}/lifted.jpg`, media_kind: "image" }),
    ],
  });
  const r = await shared();
  assert.equal(r.status, 200);
  assert.equal(r.body.has_more, false);
  const items = r.body.items as Record<string, unknown>[];
  assert.deepEqual(items.map((i) => i.message_id), [mid(1), mid(2), mid(3)], "the gone post and the lifted key are skipped");
  assert.deepEqual(items[0], {
    message_id: mid(1),
    created_at: "2026-10-01T12:00:58+00:00",
    user_id: AVERY,
    media_url: `/api/me/threads/${CHANNEL}/messages/${mid(1)}/media`,
    media_kind: "image",
    attachment: null,
  });
  assert.equal(items[1].media_kind, "video");
  assert.deepEqual([items[2].media_url, items[2].media_kind], [null, null]);
  assert.deepEqual(items[2].attachment, { ...post(), media_url: `/api/posts/${POST}/media`, media_thumbnail_url: null });
  const sent = JSON.stringify(r.body);
  for (const file of ["photo-1.jpg", "clip.mp4", "flyer.jpg", "lifted.jpg"]) assert.ok(!sent.includes(file), `no stored key in the answer (${file})`);
});

test("shared: limit + 1 rows → has_more and exactly `limit` items; the extra row is never sent", async () => {
  const rows = Array.from({ length: 4 }, (_, i) => sharedRow(i + 1, { media_url: `messages/${CHANNEL}/p${i}.jpg`, media_kind: "image" }));
  setup({ sharedRows: rows });
  const more = await shared("?limit=3");
  assert.equal(more.body.has_more, true);
  assert.deepEqual((more.body.items as { message_id: string }[]).map((i) => i.message_id), [mid(1), mid(2), mid(3)]);
  setup({ sharedRows: rows.slice(0, 3) });
  assert.equal((await shared("?limit=3")).body.has_more, false);
});

const photo = (n: number) => sharedRow(n, { media_url: `messages/${CHANNEL}/p${n}.jpg`, media_kind: "image" });
/** A shared post that is gone or hidden from the viewer, with no photo: the mapper skips it. */
const gonePost = (n: number) => sharedRow(n, { attachment_id: POST, attachment_kind: "post", attachment: null });
const sharedIds = (r: Reply) => (r.body.items as { message_id: string }[]).map((i) => i.message_id);
const sharedReads = (queries: Query[]) => queries.map((q) => [argOf(q, "lt") ?? null, argOf(q, "limit")]);

test("shared: a page of skipped rows never answers `items: []` with `has_more: true`: the route reads on from the last RAW row", async () => {
  // 31 shared posts that are gone, then nothing: empty AND no more (it used to say more, forever).
  const gone = Array.from({ length: 31 }, (_, i) => gonePost(i + 1));
  const empty = setup({ sharedRows: gone });
  const r = await shared();
  assert.deepEqual([r.status, r.body], [200, { ok: true, items: [], has_more: false }]);
  assert.deepEqual(sharedReads(empty.queries), [[null, 31], [gone[29].created_at, 31]], "the second read starts under the 30th raw row");
  // Every read keeps the first one's filters.
  assert.deepEqual(empty.queries[1].calls, [
    ["select", MESSAGE_SELECT],
    ["eq", "channel_id", CHANNEL],
    ["or", "media_url.not.is.null,attachment_id.not.is.null"],
    ["is", "removed_at", null],
    ["lt", "created_at", gone[29].created_at],
    ["order", "created_at", { ascending: false }],
    ["limit", 31],
  ]);
  // The same 31, then two photos under them: found in the same request.
  const under = setup({ sharedRows: [...gone, photo(32), photo(33)] });
  const u = await shared();
  assert.deepEqual([sharedIds(u), u.body.has_more], [[mid(32), mid(33)], false]);
  assert.equal(under.queries.length, 2);
});

test("shared: skipped rows in the middle of the list: the page fills from the next read, and the next page starts at its last item", async () => {
  const rows = [photo(1), gonePost(2), gonePost(3), gonePost(4), photo(5), photo(6), photo(7)];
  const first = setup({ sharedRows: rows });
  const a = await shared("?limit=2");
  assert.deepEqual([sharedIds(a), a.body.has_more], [[mid(1), mid(5)], true], "photo 6 was read and not sent: there is more");
  assert.deepEqual(sharedReads(first.queries), [[null, 3], [rows[1].created_at, 3], [rows[3].created_at, 3]]);
  // What the client does next: `before` = the last item it got.
  const second = setup({ sharedRows: rows });
  const b = await shared(`?limit=2&before=${encodeURIComponent(rows[4].created_at)}`);
  assert.deepEqual([sharedIds(b), b.body.has_more], [[mid(6), mid(7)], false]);
  assert.equal(second.queries.length, 1);
});

test("shared: the reads are bounded; past the bound the answer ends rather than say `has_more` with no item", async () => {
  // limit 2: four reads look at 8 raw rows. Ten gone posts, then a photo the bound never reaches.
  const rows = [...Array.from({ length: 10 }, (_, i) => gonePost(i + 1)), photo(11)];
  const { queries } = setup({ sharedRows: rows });
  const r = await shared("?limit=2");
  assert.deepEqual(r.body, { ok: true, items: [], has_more: false });
  assert.equal(queries.length, SHARED_READS_MAX);
  assert.equal(SHARED_READS_MAX, 4);
  // One item before the run: `has_more` is true (older rows remain), and the client's next page moves on from it.
  const withOne = setup({ sharedRows: [photo(0), ...rows] });
  const one = await shared("?limit=2");
  assert.deepEqual([sharedIds(one), one.body.has_more], [[mid(0)], true]);
  assert.equal(withOne.queries.length, SHARED_READS_MAX);
});

test("shared: a later read that fails → 503 try_again, nothing half sent", async () => {
  const gone = Array.from({ length: 4 }, (_, i) => gonePost(i + 1));
  const { state, queries } = setup({ sharedRows: gone });
  // The first read answers; the second throws the database's error.
  const answer = state.cookie.from;
  let reads = 0;
  state.cookie.from = ((table: string) => {
    reads += 1;
    if (reads === 1) return answer(table);
    return fakeClient(() => ({ data: null, error: BOOM }), queries, "cookie").from(table);
  }) as typeof answer;
  const r = await shared("?limit=2");
  assert.deepEqual([r.status, r.body], [503, TRY_AGAIN]);
  assert.equal(queries.length, 2);
});

test("shared: a read that fails → 503 try_again; missing chat columns → 404 not_found", async () => {
  setup({ sharedError: BOOM });
  const r = await shared();
  assert.deepEqual([r.status, r.body], [503, TRY_AGAIN]);
  setup({ sharedError: { code: "42703", message: "column messages.removed_at does not exist" } });
  assert.deepEqual((await shared()).body, NOT_FOUND);
});

test("toSharedItems: null and an empty page are empty", () => {
  assert.deepEqual(toSharedItems(null, CHANNEL), []);
  assert.deepEqual(toSharedItems([], CHANNEL), []);
});
