/**
 * The decision tables of the two card routes
 * (handoffs/chat-redesign/wave-2-contracts.md 4.1: the thirteen gates of
 * `POST /api/me/threads/[id]/cards`; 4.3: the twelve of
 * `PUT /api/me/threads/[id]/cards/[messageId]/vote`) against fakes: the
 * cookie and service clients, the flag, the rate limit, the moderation
 * gates, `ensureMember`, `roomOf`, `readChatMessage`, `clubRole` and
 * `hydrateCards` all answer from one `state` object, so every row of 4.1 /
 * 4.3 and the routes' own 3.10 rows are one small case each. The real
 * `readCreateCardBody`, `cardFallbackContent`, `rpcRefusal`, `blockedIdsFor`,
 * `isMissingChatSchema` and `isUuid` run underneath.
 *
 * Run with:
 *   node --test src/lib/chat/cards/routes.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments
 * as globs, so a path with `[id]` in it never matches (the
 * `remove-route.test.ts` placement); a relative import through `[id]`
 * loads fine.
 *
 * WHY THE RESOLVE HOOK: the routes import `next/server` (resolvable under
 * Node only as `next/server.js`), the cookie client (`next/headers`), the
 * service client and the server-only helpers (the `remove-route.test.ts`
 * pattern; the pure modules are the real files). `checkText` is replaced by
 * one that refuses the marker word `zzblocked`: the filter has its own
 * tests; what is proven here is the ORDER the route asks in (4.1.7).
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
if (typeof registerHooks !== "function") throw new Error("routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__b2.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__b2.service; }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__b2.service !== undefined; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit(key, opts) { globalThis.__b2.log.push(['rateLimit', key, opts]); " +
      "return globalThis.__b2.rateAllowed ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: 60 }; }\n" +
      "export function tooManyRequests(r) { return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), " +
      "{ status: 429, headers: { 'retry-after': String(r.retryAfterSec), 'content-type': 'application/json' } }); }",
  ),
  // `contentBlockedResponse` mirrors access.ts:134-144 (the 422 body with `field`).
  "@/lib/moderation/access": stub(
    "const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });\n" +
      "export async function requireCanPublish(id) { globalThis.__b2.log.push(['requireCanPublish', id]); " +
      "return globalThis.__b2.publishGate ? json({ ok: false, error: 'gate' }, 403) : null; }\n" +
      "export async function requireNotRestricted(id) { globalThis.__b2.log.push(['requireNotRestricted', id]); " +
      "return globalThis.__b2.restricted ? json({ ok: false, error: 'restricted' }, 403) : null; }\n" +
      "export function contentBlockedResponse(field) { return json({ ok: false, error: \"That includes words that aren't allowed on Vibe\", " +
      "code: 'content_blocked', ...(field ? { field } : {}) }, 422); }",
  ),
  "@/lib/moderation/text-filter": stub(
    "export function checkText(text) { return typeof text === 'string' && /zzblocked/i.test(text) ? { ok: false, category: 'test' } : { ok: true }; }",
  ),
  "@/lib/messages/channel-access": stub(
    "export async function ensureMember(client, channelId, userId) { globalThis.__b2.log.push(['ensureMember', channelId, userId]); return globalThis.__b2.member; }",
  ),
  "@/lib/chat/flag-server": stub(
    "export async function chatV2For(id) { globalThis.__b2.log.push(['chatV2For', id]); return globalThis.__b2.flag; }",
  ),
  "@/lib/chat/message-read": stub(
    "export async function roomOf(channelId, access) { globalThis.__b2.log.push(['roomOf', channelId, access]); return globalThis.__b2.roomOf; }\n" +
      "export async function readChatMessage(client, id, known) { const s = globalThis.__b2; " +
      "s.log.push(['readChatMessage', client === s.cookie, id, known]); return s.readBack.length ? s.readBack.shift() : null; }",
  ),
  "@/lib/chat/rooms": stub(
    "export async function clubRole(orgId, userId) { globalThis.__b2.log.push(['clubRole', orgId, userId]); return globalThis.__b2.roles[userId] ?? null; }",
  ),
  "@/lib/chat/cards/hydrate": stub(
    "export async function hydrateCards(client, rows, viewerId, opts) { const s = globalThis.__b2; " +
      "s.log.push(['hydrateCards', client === s.cookie, rows, viewerId, opts]); return s.hydrated; }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
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

const postSpecifier = "../../../app/api/me/threads/[id]/cards/route.ts";
const { POST } = (await import(postSpecifier)) as typeof import("../../../app/api/me/threads/[id]/cards/route");
const putSpecifier = "../../../app/api/me/threads/[id]/cards/[messageId]/vote/route.ts";
const { PUT } = (await import(putSpecifier)) as typeof import("../../../app/api/me/threads/[id]/cards/[messageId]/vote/route");
const typesSpecifier = "../types.ts";
const { refusalBody } = (await import(typesSpecifier)) as typeof import("../types");
type PollCard = import("../types").PollCard;

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Query = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq"] as const;

function fakeClient(answer: (q: Query) => Answer, queries: Query[]) {
  const chain = (q: Query) => {
    const builder: Record<string, unknown> = {
      then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => ({ data: null, error: null, ...answer(q) }))
          .then(resolve, reject);
      },
      maybeSingle() {
        q.calls.push(["maybeSingle"]);
        return Promise.resolve().then(() => {
          const a = answer(q);
          const rows = Array.isArray(a.data) ? a.data : a.data ? [a.data] : [];
          return { data: rows[0] ?? null, error: a.error ?? null };
        });
      },
    };
    for (const method of METHODS) {
      builder[method] = (...args: unknown[]) => {
        q.calls.push([method, ...args]);
        return builder;
      };
    }
    return builder;
  };
  return {
    from(table: string) {
      const q: Query = { table, calls: [] };
      queries.push(q);
      return chain(q);
    },
    rpc(fn: string, args: unknown) {
      const q: Query = { table: `rpc:${fn}`, calls: [["rpc", args]] };
      queries.push(q);
      return chain(q);
    },
  };
}

const uuid = (n: number, tail = "0") => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CHANNEL = uuid(1, "c");
const MESSAGE = uuid(1, "b");
const NEW_ID = uuid(2, "b");
const ORG = uuid(1, "d");
const ME = uuid(1, "a");
const OTHER = uuid(2, "a");
const EVENT = uuid(1, "e");
const OPTION = uuid(1, "f");
const ROOM = { id: CHANNEL, kind: "lounge", name: "Lounge", org_id: ORG, event: null };
const BOARD = { ...ROOM, kind: "board", name: "Board" };
const CLUB_MEMBER = { ok: true, isOrgChannel: true, orgId: ORG, kind: "lounge", eventId: null, accepted_at: null, cleared_at: null };
const DM_MEMBER = { ok: true, isOrgChannel: false, orgId: null, accepted_at: null, cleared_at: null };
const LIVE_EVENT = { id: EVENT, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", org_id: ORG, ends_at: "2099-01-01T00:00:00+00:00" };
const POLL_ROW = { id: MESSAGE, kind: "poll", user_id: OTHER, card_event_id: null, removed_at: null };
const CARD: PollCard = { type: "poll", question: "Q?", anonymous: false, multi: false, closes_at: null, closed: false, total_voters: 0, options: [] };

type State = {
  user: { id: string } | null;
  cookie: ReturnType<typeof fakeClient>;
  service: ReturnType<typeof fakeClient> | undefined;
  flag: boolean;
  rateAllowed: boolean;
  publishGate: boolean;
  restricted: boolean;
  member: unknown;
  roomOf: { room: unknown; failed: boolean };
  roles: Record<string, string>;
  readBack: unknown[];
  hydrated: Map<string, unknown> | null;
  log: Call[];
};

type Setup = {
  user?: { id: string } | null;
  flag?: boolean;
  rateAllowed?: boolean;
  publishGate?: boolean;
  restricted?: boolean;
  member?: unknown;
  roomOf?: { room: unknown; failed: boolean };
  roles?: Record<string, string>;
  service?: false;
  /** The service `events` read (4.1.11): its row, or none, or its error. */
  event?: Record<string, unknown> | null;
  eventError?: { code: string; message: string };
  /** The RPC: its error, or the id it answers (`null` = no id). */
  rpcError?: { code: string; message: string };
  rpcData?: unknown;
  /** The read-back answers, in order (4.1.13). */
  readBack?: unknown[];
  /** The vote route's cookie re-read (4.3.9): its rows, or its error. */
  messageRows?: unknown[];
  messageError?: { code: string; message: string };
  /** The `blocks` read (4.3.10): its rows, or its error. */
  blocks?: { blocker_id: string; blocked_id: string }[];
  blocksError?: { code: string; message: string };
  hydrated?: Map<string, unknown> | null;
};

function setup(s: Setup) {
  const queries: Query[] = [];
  const cookie = Object.assign(
    fakeClient((q) => {
      if (q.table === "messages") return s.messageError ? { data: null, error: s.messageError } : { data: s.messageRows ?? [POLL_ROW] };
      if (q.table === "blocks") return s.blocksError ? { data: null, error: s.blocksError } : { data: s.blocks ?? [] };
      throw new Error(`unexpected cookie read of ${q.table}`);
    }, queries),
    { auth: { getUser: async () => ({ data: { user: s.user === undefined ? { id: ME } : s.user }, error: null }) } },
  );
  const service =
    s.service === false
      ? undefined
      : fakeClient((q) => {
          if (q.table === "events") return s.eventError ? { data: null, error: s.eventError } : { data: s.event === undefined ? LIVE_EVENT : s.event };
          if (q.table.startsWith("rpc:")) return s.rpcError ? { data: null, error: s.rpcError } : { data: "rpcData" in s ? s.rpcData : NEW_ID };
          throw new Error(`unexpected service read of ${q.table}`);
        }, queries);
  const state: State = {
    user: s.user === undefined ? { id: ME } : s.user,
    cookie,
    service,
    flag: s.flag ?? true,
    rateAllowed: s.rateAllowed ?? true,
    publishGate: s.publishGate ?? false,
    restricted: s.restricted ?? false,
    member: s.member ?? CLUB_MEMBER,
    roomOf: s.roomOf ?? { room: ROOM, failed: false },
    roles: s.roles ?? { [ME]: "member" },
    readBack: s.readBack ?? [{ id: NEW_ID, kind: "poll" }],
    hydrated: s.hydrated === undefined ? new Map([[MESSAGE, CARD]]) : s.hydrated,
    log: [],
  };
  (globalThis as unknown as { __b2: State }).__b2 = state;
  return { state, queries };
}

const json = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body));
async function post(body: unknown, channelId = CHANNEL) {
  const req = new Request("http://vibe.test/", { method: "POST", body: json(body), headers: { "content-type": "application/json" } });
  const res = await POST(req, { params: Promise.resolve({ id: channelId }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function put(body: unknown, channelId = CHANNEL, messageId = MESSAGE) {
  const req = new Request("http://vibe.test/", { method: "PUT", body: json(body), headers: { "content-type": "application/json" } });
  const res = await PUT(req, { params: Promise.resolve({ id: channelId, messageId }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const names = (log: Call[]) => log.map((c) => c[0]);
const rpcs = (queries: Query[]) => queries.filter((q) => q.table.startsWith("rpc:"));
const POLL = { type: "poll", question: "Pizza or tacos?", options: [{ label: "Pizza" }, { label: "Tacos" }] };
const SIGNUP = { type: "signup", question: "Bring", options: [{ label: "Plates", capacity: 2 }] };
const EVENT_CARD = { type: "event", event_id: EVENT, note: "Bring a friend" };
const VOTE = { option_id: OPTION, on: true };
const refused = (code: Parameters<typeof refusalBody>[0], status: number, extra: Record<string, unknown> = {}) => ({
  status,
  body: { ...refusalBody(code), ...extra },
});

// ── POST, 4.1: gates 1-5 ────────────────────────────────────────────────────

test("POST 1: no user → 401 Unauthorized, nothing else asked", async () => {
  const { state, queries } = setup({ user: null });
  assert.deepEqual(await post(POLL), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.deepEqual(state.log, []);
  assert.equal(queries.length, 0);
});

test("POST 2: the flag off → 404 not_found with its sentence", async () => {
  const { state } = setup({ flag: false });
  assert.deepEqual(await post(POLL), refused("not_found", 404));
  assert.deepEqual(state.log, [["chatV2For", ME]]);
});

test("POST 3: the send bucket message-send:<uid> 60/60 → 429", async () => {
  const { state } = setup({ rateAllowed: false });
  assert.equal((await post(POLL)).status, 429);
  assert.deepEqual(state.log.at(-1), ["rateLimit", `message-send:${ME}`, { limit: 60, windowSec: 60 }]);
});

test("POST 4: requireCanPublish's response is answered as it is", async () => {
  const { state } = setup({ publishGate: true });
  assert.deepEqual(await post(POLL), { status: 403, body: { ok: false, error: "gate" } });
  assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireCanPublish"]);
});

test("POST 5: not JSON, null, an array → 400 Invalid JSON, before the shape", async () => {
  for (const body of ["{not json", "null", "[]", "\"poll\""]) {
    setup({});
    assert.deepEqual(await post(body), { status: 400, body: { ok: false, error: "Invalid JSON" } }, body);
  }
});

// ── POST, 4.1: gates 6-10 ───────────────────────────────────────────────────

test("POST 6: a bad shape → 400 invalid_card with the field, before the word filter and ensureMember", async () => {
  const cases: [unknown, string][] = [
    [{ ...POLL, type: "quiz" }, "type"],
    [{ ...POLL, question: "   " }, "question"],
    [{ ...POLL, options: [{ label: "One" }] }, "options"],
    [{ ...POLL, options: [{ label: "Pizza" }, { label: "" }] }, "options.1"],
    [{ ...EVENT_CARD, event_id: "not-a-uuid" }, "event_id"],
    [{ ...POLL, closes_at: "2000-01-01T00:00:00+00:00" }, "closes_at"],
  ];
  for (const [body, field] of cases) {
    const { state } = setup({});
    assert.deepEqual(await post(body), refused("invalid_card", 400, { field }), field);
    assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireCanPublish"]);
  }
});

test("POST 7: the word filter in the order question, options.<n>, note → 422 content_blocked with the field, before ensureMember", async () => {
  const cases: [unknown, string][] = [
    [{ ...POLL, question: "zzblocked?" }, "question"],
    [{ ...POLL, options: [{ label: "Pizza" }, { label: "zzblocked" }] }, "options.1"],
    [{ ...POLL, question: "zzblocked?", options: [{ label: "zzblocked" }, { label: "Tacos" }] }, "question"],
    [{ ...SIGNUP, options: [{ label: "zzblocked", capacity: 1 }] }, "options.0"],
    [{ ...EVENT_CARD, note: "zzblocked" }, "note"],
  ];
  for (const [body, field] of cases) {
    const { state } = setup({});
    assert.deepEqual(await post(body), {
      status: 422,
      body: { ok: false, error: "That includes words that aren't allowed on Vibe", code: "content_blocked", field },
    });
    assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireCanPublish"], field);
  }
});

test("POST 8: ensureMember's status and Not a member; a non-uuid [id] is not tested by the route", async () => {
  for (const status of [403, 500]) {
    const { state, queries } = setup({ member: { ok: false, status } });
    assert.deepEqual(await post(POLL, "abc"), { status, body: { ok: false, error: "Not a member" } });
    assert.deepEqual(state.log.at(-1), ["ensureMember", "abc", ME]);
    assert.equal(queries.length, 0);
  }
});

test("POST 9: a dm or a group → 400 cards_club_rooms_only; no room, no events read, no RPC", async () => {
  const { state, queries } = setup({ member: DM_MEMBER });
  assert.deepEqual(await post(EVENT_CARD), refused("cards_club_rooms_only", 400));
  assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireCanPublish", "ensureMember"]);
  assert.equal(queries.length, 0);
});

test("POST 10: roomOf failed → 503; no room with a kind → 503; no room and no kind (no migration A) → 404", async () => {
  setup({ roomOf: { room: null, failed: true } });
  assert.deepEqual(await post(POLL), refused("try_again", 503));
  setup({ roomOf: { room: null, failed: false } });
  assert.deepEqual(await post(POLL), refused("try_again", 503), "ensureMember named a kind");
  const { queries, state } = setup({ roomOf: { room: null, failed: false }, member: { ...CLUB_MEMBER, kind: undefined } });
  assert.deepEqual(await post(POLL), refused("not_found", 404));
  assert.equal(queries.length, 0, "no RPC");
  assert.deepEqual(state.log.at(-1), ["roomOf", CHANNEL, { ...CLUB_MEMBER, kind: undefined }]);
});

test("POST: the service role not configured → 503 try_again, after roomOf", async () => {
  const { state } = setup({ service: false });
  assert.deepEqual(await post(POLL), refused("try_again", 503));
  assert.equal(names(state.log).at(-1), "roomOf");
});

// ── POST, 4.1: gate 11, the Event card's event ──────────────────────────────

test("POST 11: an Event card reads the event with the service role: five columns, by id; a poll never does", async () => {
  const { queries } = setup({});
  assert.equal((await post(EVENT_CARD)).status, 201);
  assert.equal(queries[0].table, "events");
  assert.deepEqual(queries[0].calls, [["select", "id, title, starts_at, org_id, ends_at"], ["eq", "id", EVENT], ["maybeSingle"]]);
  const poll = setup({});
  assert.equal((await post(POLL)).status, 201);
  assert.deepEqual(poll.queries.map((q) => q.table), ["rpc:chat_create_poll"]);
});

test("POST 11: a missing, another club's, or an ended event → 404 event_not_found; a failed read → 503; no RPC", async () => {
  const cases: [Setup, ReturnType<typeof refused>][] = [
    [{ event: null }, refused("event_not_found", 404)],
    [{ event: { ...LIVE_EVENT, org_id: uuid(2, "d") } }, refused("event_not_found", 404)],
    [{ event: { ...LIVE_EVENT, ends_at: "2020-01-01T00:00:00+00:00" } }, refused("event_not_found", 404)],
    [{ event: { ...LIVE_EVENT, ends_at: null } }, refused("event_not_found", 404)],
    [{ eventError: { code: "57014", message: "canceling statement" } }, refused("try_again", 503)],
  ];
  for (const [s, want] of cases) {
    const { queries } = setup(s);
    assert.deepEqual(await post(EVENT_CARD), want, JSON.stringify(s));
    assert.equal(rpcs(queries).length, 0);
  }
});

// ── POST, 4.1: gate 12, the RPC and its SQLSTATEs ───────────────────────────

const fallbackSpecifier = "./fallback.ts";
const { cardFallbackContent } = (await import(fallbackSpecifier)) as typeof import("./fallback");

test("POST 12: chat_create_poll with the nine names of 3.3; a sign-up forces p_anonymous false and p_multi true", async () => {
  const poll = setup({});
  await post({ ...POLL, anonymous: true, multi: true, closes_at: "2099-01-01T00:00:00+00:00" });
  assert.deepEqual(rpcs(poll.queries)[0], {
    table: "rpc:chat_create_poll",
    calls: [["rpc", {
      p_channel: CHANNEL, p_user: ME, p_mode: "poll", p_question: "Pizza or tacos?",
      p_options: [{ label: "Pizza" }, { label: "Tacos" }], p_anonymous: true, p_multi: true,
      p_closes_at: "2099-01-01T00:00:00+00:00", p_content: cardFallbackContent({ type: "poll", question: "Pizza or tacos?" }),
    }]],
  });
  const signup = setup({});
  await post({ ...SIGNUP, anonymous: true, multi: false });
  assert.deepEqual(rpcs(signup.queries)[0].calls[0][1], {
    p_channel: CHANNEL, p_user: ME, p_mode: "signup", p_question: "Bring", p_options: [{ label: "Plates", capacity: 2 }],
    p_anonymous: false, p_multi: true, p_closes_at: null, p_content: cardFallbackContent({ type: "signup", question: "Bring" }),
  });
});

test("POST 12: chat_create_event_card with the five names of 3.4 and the fallback from the event's title and time", async () => {
  const { queries } = setup({});
  await post(EVENT_CARD);
  assert.deepEqual(rpcs(queries)[0], {
    table: "rpc:chat_create_event_card",
    calls: [["rpc", {
      p_channel: CHANNEL, p_user: ME, p_event: EVENT, p_note: "Bring a friend",
      p_content: cardFallbackContent({ type: "event", title: "Fall Formal", starts_at: LIVE_EVENT.starts_at, note: "Bring a friend" }),
    }]],
  });
});

test("POST 12: P0C21 → postRefusal's code at 403: board_officers_only for a member on the Board, room_closed otherwise; the role read once", async () => {
  const board = setup({ rpcError: { code: "P0C21", message: "cannot post" }, roomOf: { room: BOARD, failed: false } });
  assert.deepEqual(await post(POLL), refused("board_officers_only", 403));
  assert.deepEqual(board.state.log.filter((c) => c[0] === "clubRole"), [["clubRole", ORG, ME]]);
  const officer = setup({ rpcError: { code: "P0C21", message: "cannot post" }, roles: { [ME]: "owner" } });
  assert.deepEqual(await post(POLL), refused("room_closed", 403));
  assert.equal(names(officer.state.log).at(-1), "clubRole");
});

test("POST 12: P0C22 → 400 invalid_card with closes_at for a poll and note for an Event card; P0C23-26 by the table; the role never read", async () => {
  const cases: [string, unknown, ReturnType<typeof refused>][] = [
    ["P0C22", POLL, refused("invalid_card", 400, { field: "closes_at" })],
    ["P0C22", SIGNUP, refused("invalid_card", 400, { field: "closes_at" })],
    ["P0C22", EVENT_CARD, refused("invalid_card", 400, { field: "note" })],
    ["P0C23", EVENT_CARD, refused("event_not_found", 404)],
    ["P0C24", POLL, refused("not_found", 404)],
    ["P0C25", POLL, refused("poll_closed", 409)],
    ["P0C26", SIGNUP, refused("slot_full", 409)],
  ];
  for (const [code, body, want] of cases) {
    const { state } = setup({ rpcError: { code, message: "raised" } });
    assert.deepEqual(await post(body), want, code);
    assert.ok(!names(state.log).includes("clubRole"), code);
    assert.ok(!names(state.log).includes("readChatMessage"), code);
  }
});

test("POST 12: a missing function (PGRST202, 42883) → 404 not_found (3.10); any other error → 503 try_again; no id → 503", async () => {
  for (const code of ["PGRST202", "42883"]) {
    setup({ rpcError: { code, message: "function does not exist" } });
    assert.deepEqual(await post(POLL), refused("not_found", 404), code);
  }
  setup({ rpcError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await post(POLL), refused("try_again", 503));
  setup({ rpcData: null });
  assert.deepEqual(await post(POLL), refused("try_again", 503));
});

// ── POST, 4.1: gate 13, the read-back ───────────────────────────────────────

test("POST 13: the read-back on the viewer's client with { viewerId, access }, tried twice, then 503; else 201 { ok, message }", async () => {
  const twice = setup({ readBack: [null, null] });
  assert.deepEqual(await post(POLL), refused("try_again", 503));
  assert.deepEqual(twice.state.log.filter((c) => c[0] === "readChatMessage"), [
    ["readChatMessage", true, NEW_ID, { viewerId: ME, access: CLUB_MEMBER }],
    ["readChatMessage", true, NEW_ID, { viewerId: ME, access: CLUB_MEMBER }],
  ]);
  const message = { id: NEW_ID, kind: "poll", content: "Pizza or tacos?" };
  const second = setup({ readBack: [null, message] });
  assert.deepEqual(await post(POLL), { status: 201, body: { ok: true, message } });
  assert.equal(second.state.log.filter((c) => c[0] === "readChatMessage").length, 2);
  const first = setup({ readBack: [message] });
  assert.deepEqual(await post(POLL), { status: 201, body: { ok: true, message } });
  assert.deepEqual(names(first.state.log), ["chatV2For", "rateLimit", "requireCanPublish", "ensureMember", "roomOf", "readChatMessage"]);
});

// ── PUT, 4.3: gates 1-8 ─────────────────────────────────────────────────────

test("PUT 1, 2: no user → 401; the flag off → 404 not_found", async () => {
  const none = setup({ user: null });
  assert.deepEqual(await put(VOTE), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.deepEqual(none.state.log, []);
  const off = setup({ flag: false });
  assert.deepEqual(await put(VOTE), refused("not_found", 404));
  assert.deepEqual(off.state.log, [["chatV2For", ME]]);
});

test("PUT 2b: a non-uuid [messageId] → 404 not_found after the flag and before the rate limit; nothing read", async () => {
  const { state, queries } = setup({});
  assert.deepEqual(await put(VOTE, CHANNEL, "not-a-uuid"), refused("not_found", 404));
  assert.deepEqual(names(state.log), ["chatV2For"]);
  assert.equal(queries.length, 0);
});

test("PUT 3, 4: the vote bucket card-vote:<uid> 120/600 → 429; a restricted caller → the gate's response", async () => {
  const limited = setup({ rateAllowed: false });
  assert.equal((await put(VOTE)).status, 429);
  assert.deepEqual(limited.state.log.at(-1), ["rateLimit", `card-vote:${ME}`, { limit: 120, windowSec: 600 }]);
  const restricted = setup({ restricted: true });
  assert.deepEqual(await put(VOTE), { status: 403, body: { ok: false, error: "restricted" } });
  assert.deepEqual(names(restricted.state.log), ["chatV2For", "rateLimit", "requireNotRestricted"]);
});

test("PUT 5: not JSON → 400 Invalid JSON; option_id not a uuid → invalid_card option_id; on not a boolean → invalid_card on", async () => {
  for (const body of ["{not json", "null", "[]"]) {
    setup({});
    assert.deepEqual(await put(body), { status: 400, body: { ok: false, error: "Invalid JSON" } }, body);
  }
  const cases: [unknown, string][] = [
    [{ on: true }, "option_id"],
    [{ option_id: "abc", on: true }, "option_id"],
    [{ option_id: OPTION }, "on"],
    [{ option_id: OPTION, on: "yes" }, "on"],
  ];
  for (const [body, field] of cases) {
    const { state } = setup({});
    assert.deepEqual(await put(body), refused("invalid_card", 400, { field }), field);
    assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireNotRestricted"]);
  }
});

test("PUT 6, 7: ensureMember's status and Not a member; a dm or a group → 400 cards_club_rooms_only with nothing read", async () => {
  const out = setup({ member: { ok: false, status: 403 } });
  assert.deepEqual(await put(VOTE, "abc"), { status: 403, body: { ok: false, error: "Not a member" } });
  assert.deepEqual(out.state.log.at(-1), ["ensureMember", "abc", ME]);
  const dm = setup({ member: DM_MEMBER });
  assert.deepEqual(await put(VOTE), refused("cards_club_rooms_only", 400));
  assert.equal(names(dm.state.log).at(-1), "ensureMember");
  assert.equal(dm.queries.length, 0);
});

test("PUT 8: roomOf as 4.1.10: failed → 503; no room with a kind → 503; no room and no kind → 404; nothing read", async () => {
  const cases: [Setup, ReturnType<typeof refused>][] = [
    [{ roomOf: { room: null, failed: true } }, refused("try_again", 503)],
    [{ roomOf: { room: null, failed: false } }, refused("try_again", 503)],
    [{ roomOf: { room: null, failed: false }, member: { ...CLUB_MEMBER, kind: null } }, refused("not_found", 404)],
  ];
  for (const [s, want] of cases) {
    const { queries } = setup(s);
    assert.deepEqual(await put(VOTE), want);
    assert.equal(queries.length, 0);
  }
});

// ── PUT, 4.3: gate 9, the re-read on the viewer's client ────────────────────

test("PUT 9: the message re-read on the cookie client, scoped to [id]: the five columns, eq id, eq channel_id, limit 1, no maybeSingle; before anything else is read", async () => {
  const { queries } = setup({});
  assert.equal((await put(VOTE)).status, 200);
  assert.equal(queries[0].table, "messages");
  assert.deepEqual(queries[0].calls, [
    ["select", "id, kind, user_id, card_event_id, removed_at"],
    ["eq", "id", MESSAGE],
    ["eq", "channel_id", CHANNEL],
    ["limit", 1],
  ]);
  assert.deepEqual(queries.map((q) => q.table), ["messages", "blocks", "rpc:chat_cast_vote"]);
});

test("PUT 9: no row (another room's poll), a text or an Event card, or the viewer's own removed poll → 404 not_found; no blocks read, no RPC", async () => {
  const cases: [string, unknown[]][] = [
    ["no row", []],
    ["a text message", [{ ...POLL_ROW, kind: "text" }]],
    ["an Event card", [{ ...POLL_ROW, kind: "event_card", card_event_id: EVENT }]],
    ["the viewer's own removed poll", [{ ...POLL_ROW, user_id: ME, removed_at: "2026-10-08T21:00:00+00:00" }]],
    ["someone's removed poll", [{ ...POLL_ROW, removed_at: "2026-10-08T21:00:00+00:00" }]],
  ];
  for (const [name, rows] of cases) {
    const { queries } = setup({ messageRows: rows });
    assert.deepEqual(await put(VOTE), refused("not_found", 404), name);
    assert.deepEqual(queries.map((q) => q.table), ["messages"], name);
  }
});

test("PUT 9: the read without messages.kind (42703, no migration A) → 404 not_found; any other read error → 503 try_again", async () => {
  const noA = setup({ messageError: { code: "42703", message: "column messages.kind does not exist" } });
  assert.deepEqual(await put(VOTE), refused("not_found", 404));
  assert.equal(noA.queries.length, 1);
  const failed = setup({ messageError: { code: "PGRST301", message: "JWT expired" } });
  assert.deepEqual(await put(VOTE), refused("try_again", 503));
  assert.equal(failed.queries.length, 1);
});

// ── PUT, 4.3: gates 10-12, the block set, the RPC, the card ─────────────────

test("PUT 10: the block set read once on the cookie client (both directions, the viewer removed); a failed read → 503 and no RPC", async () => {
  const { queries } = setup({ blocks: [{ blocker_id: ME, blocked_id: OTHER }, { blocker_id: uuid(3, "a"), blocked_id: ME }, { blocker_id: ME, blocked_id: ME }] });
  assert.equal((await put(VOTE)).status, 200);
  const blocks = queries.filter((q) => q.table === "blocks");
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].calls, [["select", "blocker_id, blocked_id"], ["or", `blocker_id.eq.${ME},blocked_id.eq.${ME}`]]);
  const failed = setup({ blocksError: { code: "57014", message: "canceling statement" } });
  assert.deepEqual(await put(VOTE), refused("try_again", 503));
  assert.deepEqual(failed.queries.map((q) => q.table), ["messages", "blocks"]);
});

test("PUT: the service role not configured → 503 try_again, after the block set", async () => {
  const { queries } = setup({ service: false });
  assert.deepEqual(await put(VOTE), refused("try_again", 503));
  assert.deepEqual(queries.map((q) => q.table), ["messages", "blocks"]);
});

test("PUT 11: chat_cast_vote with the four names of 3.4, with the service role, after the re-read and the block set", async () => {
  const { queries } = setup({});
  await put({ option_id: OPTION, on: false });
  assert.deepEqual(rpcs(queries), [{ table: "rpc:chat_cast_vote", calls: [["rpc", { p_poll: MESSAGE, p_option: OPTION, p_user: ME, p_on: false }]] }]);
});

test("PUT 11: the SQLSTATEs by 3.2: P0C24 → 404, P0C25 → 409 poll_closed, P0C26 → 409 slot_full, P0C22 → 400 option_id; a missing function → 404; else 503; no card read", async () => {
  const cases: [string, ReturnType<typeof refused>][] = [
    ["P0C24", refused("not_found", 404)],
    ["P0C25", refused("poll_closed", 409)],
    ["P0C26", refused("slot_full", 409)],
    ["P0C22", refused("invalid_card", 400, { field: "option_id" })],
    ["PGRST202", refused("not_found", 404)],
    ["42883", refused("not_found", 404)],
    ["XX000", refused("try_again", 503)],
  ];
  for (const [code, want] of cases) {
    const { state } = setup({ rpcError: { code, message: "raised" } });
    assert.deepEqual(await put(VOTE), want, code);
    assert.ok(!names(state.log).includes("hydrateCards"), code);
  }
  const board = setup({ rpcError: { code: "P0C21", message: "raised" }, roomOf: { room: BOARD, failed: false } });
  assert.deepEqual(await put(VOTE), refused("board_officers_only", 403));
  assert.deepEqual(board.state.log.at(-1), ["clubRole", ORG, ME]);
});

test("PUT 12: hydrateCards on the cookie client with the re-read row, the room and the block set → 200 { ok, card }", async () => {
  const { state } = setup({ blocks: [{ blocker_id: ME, blocked_id: OTHER }] });
  assert.deepEqual(await put(VOTE), { status: 200, body: { ok: true, card: CARD } });
  const hydrate = state.log.find((c) => c[0] === "hydrateCards");
  assert.ok(hydrate);
  assert.deepEqual(hydrate, ["hydrateCards", true, [{ id: MESSAGE, kind: "poll", user_id: OTHER, card_event_id: null }], ME, { room: ROOM, blocked: new Set([OTHER]) }]);
  assert.deepEqual(names(state.log), ["chatV2For", "rateLimit", "requireNotRestricted", "ensureMember", "roomOf", "hydrateCards"]);
});

test("PUT 12: no card, a null map, or an Event card in its place → 503 try_again", async () => {
  const cases: [string, Map<string, unknown> | null][] = [
    ["a null map", null],
    ["no card", new Map()],
    ["an Event card", new Map([[MESSAGE, { type: "event", note: null, event: null }]])],
  ];
  for (const [name, hydrated] of cases) {
    setup({ hydrated });
    assert.deepEqual(await put(VOTE), refused("try_again", 503), name);
  }
});
