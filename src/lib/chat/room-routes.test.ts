/**
 * Stub-harness tests for the room routes and the roster of wave 3
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.2, section 8
 * W3-2-roomroutes): the three-step read of `GET /api/orgs/[slug]/channels`,
 * create and edit with `post_policy`, the cap of five extra rooms, the create
 * rate limit, and `?visible=1` on `GET /api/orgs/[slug]/members`. No database
 * exists here: the cookie client and the service client are fakes.
 *
 * Run with:
 *   node --test src/lib/chat/room-routes.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments as
 * globs, so a path with `[slug]` in it never matches (the
 * reads-routes.test.ts placement).
 *
 * WHY THE RESOLVE HOOK: the routes import `next/server` (resolvable under
 * Node only as `next/server.js`), the cookie client (`next/headers`), the
 * service client, the rate limiter, the moderation gates and the memory of a
 * missing `post_policy` column (`@/lib/chat/rooms`). Each is replaced whole
 * and answers from one `state` object. Everything else is the real code:
 * `loadClubOfficer` (it reads the fake service), `room-rules`, `schema`,
 * `types`, `blocks`, the word filter.
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
if (typeof registerHooks !== "function") throw new Error("room-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__rr.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__rr.service; }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__rr.service !== undefined; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit(key, opts) { globalThis.__rr.events.push('rateLimit'); globalThis.__rr.rateArgs = [key, opts]; " +
      "return globalThis.__rr.rateAllowed ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: 600 }; }\n" +
      "export function tooManyRequests(r) { return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), " +
      "{ status: 429, headers: { 'retry-after': String(r.retryAfterSec) } }); }",
  ),
  "@/lib/moderation/access": stub(
    "const refuse = (error) => new Response(JSON.stringify({ ok: false, error }), { status: 403 });\n" +
      "export async function requireCanPublish(id) { globalThis.__rr.events.push('requireCanPublish'); return globalThis.__rr.mayPublish ? null : refuse('cannot publish'); }\n" +
      "export async function requireNotRestricted(id) { globalThis.__rr.events.push('requireNotRestricted'); return globalThis.__rr.restricted ? refuse('restricted') : null; }\n" +
      "export function contentBlockedResponse(field) { return new Response(JSON.stringify({ ok: false, code: 'content_blocked', field }), { status: 422 }); }",
  ),
  // The pinned trio of contract 4.2. The memory itself is W3-2-roomreads' and is tested there (reads-routes.test.ts).
  "@/lib/chat/rooms": stub(
    "export function postPolicyColumnMissing() { return globalThis.__rr.columnMissing === true; }\n" +
      "export function notePostPolicyColumnMissing() { globalThis.__rr.events.push('notePostPolicyColumnMissing'); globalThis.__rr.columnMissing = true; }\n" +
      "export function forgetPostPolicyColumnMissing() { globalThis.__rr.columnMissing = false; }",
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

const listSpecifier = "../../app/api/orgs/[slug]/channels/route.ts";
const roomSpecifier = "../../app/api/orgs/[slug]/channels/[channelId]/route.ts";
const rosterSpecifier = "../../app/api/orgs/[slug]/members/route.ts";
const list = (await import(listSpecifier)) as typeof import("../../app/api/orgs/[slug]/channels/route");
const room = (await import(roomSpecifier)) as typeof import("../../app/api/orgs/[slug]/channels/[channelId]/route");
const roster = (await import(rosterSpecifier)) as typeof import("../../app/api/orgs/[slug]/members/route");

// ── A fake PostgREST client: every chain is recorded and answered whole ─────

type Call = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };

type State = {
  cookie: unknown;
  service: unknown;
  rateAllowed: boolean;
  rateArgs: unknown;
  mayPublish: boolean;
  restricted: boolean;
  /** The memory of contract 4.2, as the stubbed trio answers it. */
  columnMissing: boolean;
  /** The gates and the awaited queries, in the order they ran. */
  events: string[];
  queries: Query[];
};

const METHODS = ["select", "eq", "neq", "or", "order", "limit", "insert", "update", "delete", "maybeSingle", "single"];

/** `service:channels.insert`, `cookie:blocks.select`; a head count reads `.count`. */
function label(q: Query): string {
  const [op, , opts] = q.calls[0] ?? ["?"];
  const counted = op === "select" && typeof opts === "object" && opts !== null && "count" in opts;
  return `${q.client}:${q.table}.${counted ? "count" : op}`;
}

/** A chain is answered when it is awaited, so `state.events` holds the queries in the order the route ran them. */
function fakeClient(client: Query["client"], answer: (q: Query, nth: number) => Answer, state: State) {
  const seen = new Map<string, number>();
  return {
    from(table: string) {
      const q: Query = { client, table, calls: [] };
      const builder: Record<string, unknown> = {
        then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              const nth = seen.get(table) ?? 0;
              seen.set(table, nth + 1);
              state.queries.push(q);
              state.events.push(label(q));
              const a = answer(q, nth);
              return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
            })
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

const SLUG = "chess";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const CHANNEL = "cccccccc-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const ANN = "22222222-0000-4000-8000-000000000002";
const BEN = "33333333-0000-4000-8000-000000000003";
const CAT = "44444444-0000-4000-8000-000000000004";
const T = "2026-10-01T10:00:00+00:00";
const MISSING_COLUMN = { code: "42703", message: "column channels.post_policy does not exist" };
const NOT_IN_CACHE = { code: "PGRST204", message: "Could not find the 'post_policy' column of 'channels' in the schema cache" };
const BOOM = { code: "XX000", message: "boom" };
const TRY_AGAIN = { ok: false, error: "Try again in a moment.", code: "try_again" };
const ROOM_LOCKED = { ok: false, error: "This room can't be renamed, hidden or deleted.", code: "room_locked" };
const ROOM_LIMIT = { ok: false, error: "This club already has 5 extra rooms. Delete one first.", code: "room_limit" };

type World = {
  user?: { id: string } | null;
  /** The viewer's role in the club, as the service reads it (null: not a member). */
  role?: string | null;
  rateAllowed?: boolean;
  mayPublish?: boolean;
  restricted?: boolean;
  columnMissing?: boolean;
  /** The cookie client's answers (the list's `channels` reads, the roster's `blocks` read). */
  cookie?: (q: Query, nth: number) => Answer;
  /** The service's answers past the club and the viewer's role, which the harness answers itself. */
  service?: (q: Query, nth: number) => Answer;
};

function setup(world: World = {}) {
  const state: State = {
    cookie: null,
    service: null,
    rateAllowed: world.rateAllowed ?? true,
    rateArgs: null,
    mayPublish: world.mayPublish ?? true,
    restricted: world.restricted ?? false,
    columnMissing: world.columnMissing ?? false,
    events: [],
    queries: [],
  };
  const role = world.role === undefined ? "owner" : world.role;
  const user = world.user === undefined ? { id: ME } : world.user;
  state.cookie = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    ...fakeClient("cookie", world.cookie ?? ((q) => { throw new Error(`unexpected cookie read of ${q.table}`); }), state),
  };
  state.service = fakeClient("service", (q, nth) => {
    if (q.table === "orgs") return { data: { id: ORG, hidden_at: null } };
    if (q.table === "org_members" && selectOf(q) === "role") return { data: role ? { role } : null };
    if (world.service) return world.service(q, nth);
    throw new Error(`unexpected service read of ${q.table}`);
  }, state);
  (globalThis as unknown as { __rr: State }).__rr = state;
  return state;
}

const argOf = (q: Query, method: string, column?: string): unknown => {
  const call = q.calls.find((c) => c[0] === method && (column === undefined || c[1] === column));
  return call ? (column === undefined ? call[1] : call[2]) : undefined;
};
const selectOf = (q: Query) => String(argOf(q, "select") ?? "");
const of = (state: State, name: string) => state.queries.filter((q) => label(q) === name);
/** The columns a select names, cut from a full row: what PostgREST would send back. */
const project = (row: Record<string, unknown>, select: string) =>
  Object.fromEntries(select.split(",").map((c) => c.trim()).map((c) => [c, row[c]]));
async function read(res: Response | undefined) {
  assert.ok(res, "the handler answers"); // every branch returns; the inferred type carries an `undefined` the runtime never does
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// ── GET /api/orgs/[slug]/channels: the three-step read (4.2) ─────────────────

const LIST_COLUMNS = "id, name, topic, is_private, pinned, position, created_at, parent_channel_id";
const EVENT_FILTER: Call = ["or", "kind.is.null,kind.neq.event"];
const roomRow = (id: string, kind: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name: kind, topic: null, is_private: false, pinned: false, position: 0, created_at: T, parent_channel_id: null, kind, post_policy: "everyone", ...over,
});
const CLUB_ROOMS = [
  roomRow("c-board", "board"),
  roomRow("c-lounge", "lounge"),
  roomRow("c-exec", "room", { name: "exec-only", is_private: true, post_policy: "officers" }),
  roomRow("c-formal", "event", { name: "Spring Formal", is_private: true }),
];
const hasEventFilter = (q: Query) => q.calls.some((c) => c[0] === EVENT_FILTER[0] && c[1] === EVENT_FILTER[1]);
/** The club's rooms as the database would send them: the columns asked for, without the event chat when the chain filters it. */
const listRows = (q: Query): Answer => ({
  data: CLUB_ROOMS.filter((r) => !hasEventFilter(q) || r.kind !== "event").map((r) => project(r, selectOf(q))),
});
const getList = async () => read(await list.GET(new Request("http://vibe.test/"), { params: Promise.resolve({ slug: SLUG }) }));
const channelReads = (state: State) => of(state, "cookie:channels.select");

test("list: with both columns, ONE read; every row carries kind and post_policy, no event chat", async () => {
  const state = setup({ role: "member", cookie: listRows });
  const res = await getList();
  assert.equal(res.status, 200);
  const rows = res.body.channels as Record<string, unknown>[];
  assert.deepEqual(rows.map((r) => [r.id, r.kind, r.post_policy]), [["c-board", "board", "everyone"], ["c-lounge", "lounge", "everyone"], ["c-exec", "room", "officers"]]);
  const reads = channelReads(state);
  assert.equal(reads.length, 1);
  assert.equal(selectOf(reads[0]), `${LIST_COLUMNS}, kind, post_policy`);
  assert.ok(hasEventFilter(reads[0]));
  assert.equal(argOf(reads[0], "eq", "org_id"), ORG);
  assert.ok(!state.events.includes("notePostPolicyColumnMissing"));
});

for (const missing of [MISSING_COLUMN, NOT_IN_CACHE]) {
  test(`list: the first select fails ${missing.code} and the second succeeds -> rows keep kind, no event chat, no post_policy`, async () => {
    const state = setup({ role: "member", cookie: (q, nth) => (nth === 0 ? { error: missing } : listRows(q)) });
    const res = await getList();
    assert.equal(res.status, 200);
    const rows = res.body.channels as Record<string, unknown>[];
    assert.deepEqual(rows.map((r) => r.id), ["c-board", "c-lounge", "c-exec"], "the event chat is still left out");
    for (const row of rows) {
      assert.equal(typeof row.kind, "string", "every row still carries kind");
      assert.ok(!("post_policy" in row), "no row has post_policy");
    }
    const [first, second, ...rest] = channelReads(state);
    assert.equal(rest.length, 0, "two reads, never the bare one");
    assert.equal(selectOf(first), `${LIST_COLUMNS}, kind, post_policy`);
    assert.equal(selectOf(second), `${LIST_COLUMNS}, kind`, "today's kind-aware select");
    assert.ok(hasEventFilter(first) && hasEventFilter(second));
    assert.deepEqual(second.calls.filter((c) => c[0] === "order"), [
      ["order", "pinned", { ascending: false }], ["order", "position", { ascending: true }], ["order", "created_at", { ascending: true }],
    ]);
    assert.equal(state.events.filter((e) => e === "notePostPolicyColumnMissing").length, 1, "the miss is remembered once");
  });
}

test("list: while the column is remembered missing, step 1 is skipped: one read, today's select", async () => {
  const state = setup({ role: "member", columnMissing: true, cookie: listRows });
  const res = await getList();
  assert.equal(res.status, 200);
  const reads = channelReads(state);
  assert.equal(reads.length, 1);
  assert.equal(selectOf(reads[0]), `${LIST_COLUMNS}, kind`);
  assert.ok(hasEventFilter(reads[0]));
  assert.ok((res.body.channels as Record<string, unknown>[]).every((r) => "kind" in r && !("post_policy" in r)));
  assert.ok(!state.events.includes("notePostPolicyColumnMissing"), "nothing new to remember");
});

test("list: both kind-aware selects fail as missing schema -> the bare read (no kind, no filter)", async () => {
  const state = setup({ role: "member", cookie: (q, nth) => (nth < 2 ? { error: MISSING_COLUMN } : listRows(q)) });
  const res = await getList();
  assert.equal(res.status, 200);
  const reads = channelReads(state);
  assert.deepEqual(reads.map(selectOf), [`${LIST_COLUMNS}, kind, post_policy`, `${LIST_COLUMNS}, kind`, LIST_COLUMNS]);
  assert.ok(!hasEventFilter(reads[2]), "the bare read cannot name kind");
  const rows = res.body.channels as Record<string, unknown>[];
  assert.equal(rows.length, CLUB_ROOMS.length, "every row, as before chat rooms");
  assert.ok(rows.every((r) => !("kind" in r) && !("post_policy" in r)));
});

test("list: remembered missing and kind missing too -> two reads, the second bare", async () => {
  const state = setup({ role: "member", columnMissing: true, cookie: (q, nth) => (nth === 0 ? { error: MISSING_COLUMN } : listRows(q)) });
  assert.equal((await getList()).status, 200);
  assert.deepEqual(channelReads(state).map(selectOf), [`${LIST_COLUMNS}, kind`, LIST_COLUMNS]);
});

test("list: a failure that is not a missing schema never falls back: 500 load_failed after one read", async () => {
  const state = setup({ role: "member", cookie: () => ({ error: BOOM }) });
  assert.deepEqual(await getList(), { status: 500, body: { ok: false, error: "Failed to load channels", code: "load_failed" } });
  assert.equal(channelReads(state).length, 1);
  assert.ok(!state.events.includes("notePostPolicyColumnMissing"));
});

test("list: the gates before the read are today's (401 signed out, 403 for a non-member, no channels read)", async () => {
  setup({ user: null });
  assert.deepEqual(await getList(), { status: 401, body: { ok: false, error: "Unauthorized", code: "unauthorized" } });
  const state = setup({ role: null });
  assert.deepEqual(await getList(), { status: 403, body: { ok: false, error: "Channels are for members", code: "members_only" } });
  assert.equal(channelReads(state).length, 0);
});

// ── POST /api/orgs/[slug]/channels: post_policy, the cap, the rate limit (4.2) ─

/** The select a create has always answered with. */
const CREATED_COLUMNS = "id, name, topic, is_private, pinned, position, created_at";
const NEW_ROOM = "eeeeeeee-0000-4000-8000-000000000001";

type CreateWorld = {
  /** The name-clash read that asks for `kind` (default: no clash). */
  clash?: Answer;
  /** How many extra rooms the club already has. */
  rooms?: number;
  countError?: Answer["error"];
  /** The insert's answer, by its turn (default: the row, cut to the columns the chain selects). */
  insert?: (q: Query, nth: number) => Answer | null;
};

/** The service's `channels` answers for a create: the clash read, the head count, the insert. */
function createService(over: CreateWorld = {}) {
  let inserts = 0;
  return (q: Query): Answer => {
    if (q.table !== "channels") throw new Error(`unexpected service read of ${q.table}`);
    const name = label(q);
    if (name === "service:channels.count") return over.countError ? { error: over.countError } : { count: over.rooms ?? 0 };
    if (name === "service:channels.select") return selectOf(q) === "id, kind" ? (over.clash ?? { data: [] }) : { data: [] };
    const row = q.calls[0][1] as Record<string, unknown>;
    const answered = over.insert?.(q, inserts++);
    if (answered) return answered;
    return { data: project({ id: NEW_ROOM, pinned: false, created_at: T, ...row }, selectOf(q)) };
  };
}
const create = async (body: unknown, raw?: string) =>
  read(
    await list.POST(
      new Request("http://vibe.test/", { method: "POST", body: raw ?? JSON.stringify(body), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ slug: SLUG }) },
    ),
  );
const inserts = (state: State) => of(state, "service:channels.insert");
const insertedRow = (q: Query) => q.calls[0][1] as Record<string, unknown>;
/** The insert a create has always made on a database with `channels.kind`. */
const TODAYS_ROW = { org_id: ORG, type: "org_channel", name: "study-group", topic: null, is_private: false, position: 100, kind: "room" };

for (const body of [{ name: "study-group" }, { name: "study-group", post_policy: "everyone" }]) {
  test(`create: ${"post_policy" in body ? "post_policy everyone" : "no post_policy"} -> today's insert and select, byte for byte`, async () => {
    const state = setup({ service: createService() });
    const res = await create(body);
    assert.equal(res.status, 201);
    const [insert, ...rest] = inserts(state);
    assert.equal(rest.length, 0);
    assert.deepEqual(insertedRow(insert), TODAYS_ROW, "no post_policy key in the row");
    assert.equal(selectOf(insert), CREATED_COLUMNS, "the returning select is today's string");
    assert.deepEqual(res.body, {
      ok: true,
      channel: { id: NEW_ROOM, name: "study-group", topic: null, is_private: false, pinned: false, position: 100, created_at: T, post_policy: "everyone" },
    });
  });
}

for (const policy of ["officers", "listed"] as const) {
  test(`create: post_policy ${policy} is written and read back`, async () => {
    const state = setup({ service: createService() });
    const res = await create({ name: "study-group", post_policy: policy, is_private: false });
    assert.equal(res.status, 201);
    const [insert] = inserts(state);
    assert.deepEqual(insertedRow(insert), { ...TODAYS_ROW, post_policy: policy });
    assert.equal(selectOf(insert), `${CREATED_COLUMNS}, post_policy`);
    assert.equal((res.body.channel as Record<string, unknown>).post_policy, policy);
  });
}

for (const missing of [NOT_IN_CACHE, MISSING_COLUMN]) {
  test(`create: post_policy officers when the insert fails ${missing.code} -> 503 try_again and NO second insert`, async () => {
    const state = setup({ service: createService({ insert: () => ({ error: missing }) }) });
    assert.deepEqual(await create({ name: "study-group", post_policy: "officers" }), { status: 503, body: TRY_AGAIN });
    assert.equal(inserts(state).length, 1, "never the bare insert, never a silent everyone room");
  });
}

test("create: without a rule, an insert that fails as missing schema is retried bare, as today", async () => {
  const state = setup({ service: createService({ insert: (_q, nth) => (nth === 0 ? { error: MISSING_COLUMN } : null) }) });
  const res = await create({ name: "study-group" });
  assert.equal(res.status, 201);
  const [first, second] = inserts(state);
  assert.deepEqual(insertedRow(first), TODAYS_ROW);
  const bare = { org_id: ORG, type: "org_channel", name: "study-group", topic: null, is_private: false, position: 100 };
  assert.deepEqual(insertedRow(second), bare, "the second insert drops kind and still has no post_policy");
  assert.equal((res.body.channel as Record<string, unknown>).post_policy, "everyone");
});

test("create: a post_policy outside the three is 400 before the officer guard", async () => {
  for (const bad of ["mods", "", null, 1, ["officers"]]) {
    const state = setup({ service: createService() });
    assert.deepEqual(await create({ name: "study-group", post_policy: bad }), { status: 400, body: { ok: false, error: "Invalid post_policy" } });
    assert.deepEqual(state.events, ["rateLimit", "requireCanPublish"], JSON.stringify(bad));
  }
});

test("create: the 6th extra room -> 409 room_limit, nothing written; the 5th is made", async () => {
  const full = setup({ service: createService({ rooms: 5 }) });
  assert.deepEqual(await create({ name: "study-group" }), { status: 409, body: ROOM_LIMIT });
  assert.equal(inserts(full).length, 0);
  const [count] = of(full, "service:channels.count");
  assert.deepEqual(count.calls, [["select", "id", { count: "exact", head: true }], ["eq", "org_id", ORG], ["eq", "kind", "room"]]);

  const over = setup({ service: createService({ rooms: 7 }) });
  assert.equal((await create({ name: "study-group", post_policy: "officers" })).status, 409, "a club already over the cap");
  assert.equal(inserts(over).length, 0);

  const room = setup({ service: createService({ rooms: 4 }) });
  assert.equal((await create({ name: "study-group" })).status, 201);
  assert.equal(inserts(room).length, 1);
});

test("create: no count is made when kind cannot be read (hasRoomKinds false)", async () => {
  const state = setup({ service: createService({ clash: { error: { code: "42703", message: "column channels.kind does not exist" } }, rooms: 99 }) });
  const res = await create({ name: "study-group" });
  assert.equal(res.status, 201);
  assert.equal(of(state, "service:channels.count").length, 0);
  assert.deepEqual(of(state, "service:channels.select").map(selectOf), ["id, kind", "id"]);
  const [insert, ...rest] = inserts(state);
  assert.equal(rest.length, 0);
  assert.ok(!("kind" in insertedRow(insert)) && !("post_policy" in insertedRow(insert)));
});

test("create: a count that cannot be read never writes on a guess (500)", async () => {
  const state = setup({ service: createService({ countError: BOOM }) });
  assert.deepEqual(await create({ name: "study-group" }), { status: 500, body: { ok: false, error: "Failed to create channel" } });
  assert.equal(inserts(state).length, 0);
});

test("create: a rule asked where kind cannot be read -> the insert's missing schema is 503, one insert", async () => {
  const state = setup({
    service: createService({ clash: { error: { code: "42703", message: "column channels.kind does not exist" } }, insert: () => ({ error: NOT_IN_CACHE }) }),
  });
  assert.deepEqual(await create({ name: "study-group", post_policy: "listed" }), { status: 503, body: TRY_AGAIN });
  assert.equal(inserts(state).length, 1);
});

// The gate order of 4.2: rate limit, publish gate, body, name rule, officer guard, cap.
// Each case trips ONE gate with every later gate also set to refuse: the answer and
// `state.events` say which one ran first.

const GUARD = ["service:orgs.select", "service:org_members.select"];

test("create order: the whole path, gate by gate", async () => {
  const state = setup({ service: createService() });
  assert.equal((await create({ name: "study-group", post_policy: "officers" })).status, 201);
  assert.deepEqual(state.events, [
    "rateLimit", "requireCanPublish", ...GUARD, "service:channels.select", "service:channels.count", "service:channels.insert",
  ]);
  assert.deepEqual(state.rateArgs, [`room-create:${ME}`, { limit: 10, windowSec: 600 }]);
});

test("create order: 401 before the rate limit (the key needs the person)", async () => {
  const state = setup({ user: null, rateAllowed: false });
  assert.deepEqual(await create({ name: "study-group" }), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.deepEqual(state.events, []);
});

test("create order: the rate limit is first: 429 before the publish gate", async () => {
  const state = setup({ rateAllowed: false, mayPublish: false, role: "member" });
  const res = await create(null, "{not json");
  assert.deepEqual(res, { status: 429, body: { ok: false, error: "Too many requests. Try again shortly." } });
  assert.deepEqual(state.events, ["rateLimit"]);
});

test("create order: the publish gate answers before the body is read", async () => {
  const state = setup({ mayPublish: false, role: "member" });
  assert.deepEqual(await create(null, "{not json"), { status: 403, body: { ok: false, error: "cannot publish" } });
  assert.deepEqual(state.events, ["rateLimit", "requireCanPublish"]);
});

test("create order: the body, then the name rule, both before the officer guard", async () => {
  const notJson = setup({ role: "member" });
  assert.deepEqual(await create(null, "{not json"), { status: 400, body: { ok: false, error: "Invalid JSON" } });
  assert.deepEqual(notJson.events, ["rateLimit", "requireCanPublish"]);

  // A bad rule AND a bad name: the body's own field is judged first.
  const both = setup({ role: "member" });
  assert.deepEqual(await create({ name: "Not A Slug", post_policy: "mods" }), { status: 400, body: { ok: false, error: "Invalid post_policy" } });
  assert.deepEqual(both.events, ["rateLimit", "requireCanPublish"]);

  const badName = setup({ role: "member" });
  const res = await create({ name: "x" });
  assert.equal(res.status, 400);
  assert.match(String(res.body.error), /^Channel name must be 2–31 chars/);
  assert.deepEqual(badName.events, ["rateLimit", "requireCanPublish"], "a member with a bad name reads 400, not 403");
});

test("create order: the officer guard before the cap (a member of a full club reads 403 and nothing is counted)", async () => {
  const state = setup({ role: "member", service: createService({ rooms: 5 }) });
  assert.deepEqual(await create({ name: "study-group" }), { status: 403, body: { ok: false, error: "Admin only" } });
  assert.deepEqual(state.events, ["rateLimit", "requireCanPublish", ...GUARD]);
});

test("create order: the cap is the last gate: today's name answers come first, the insert never runs", async () => {
  const locked = setup({ service: createService({ rooms: 5 }) });
  assert.deepEqual(await create({ name: "lounge" }), { status: 409, body: ROOM_LOCKED });
  assert.equal(of(locked, "service:channels.count").length, 0);

  const taken = setup({ service: createService({ rooms: 5, clash: { data: [{ id: "c-exec", kind: "room" }] } }) });
  assert.deepEqual(await create({ name: "study-group" }), { status: 409, body: { ok: false, error: "Channel name already exists" } });
  assert.equal(of(taken, "service:channels.count").length, 0);

  const full = setup({ service: createService({ rooms: 5 }) });
  assert.deepEqual(await create({ name: "study-group" }), { status: 409, body: ROOM_LIMIT });
  assert.deepEqual(full.events, ["rateLimit", "requireCanPublish", ...GUARD, "service:channels.select", "service:channels.count"]);
});

// ── PATCH /api/orgs/[slug]/channels/[channelId]: post_policy (4.2) ───────────

/** The select an edit has always answered with. */
const UPDATED_COLUMNS = "id, name, topic, is_private, pinned, position, created_at, parent_channel_id";
type Kind = "board" | "lounge" | "officers" | "event" | "room" | null;

/** The service's `channels` answers for an edit: the guard's load of the room (its `kind`), then the update. */
function editService(kind: Kind, update?: Answer) {
  const stored = { id: CHANNEL, org_id: ORG, is_private: false, name: "study-group", topic: null, kind };
  return (q: Query): Answer => {
    if (q.table !== "channels") throw new Error(`unexpected service read of ${q.table}`);
    if (label(q) !== "service:channels.update") return { data: stored };
    if (update) return update;
    const full = { ...stored, pinned: false, position: 100, created_at: T, parent_channel_id: null, post_policy: "everyone", ...(q.calls[0][1] as object) };
    return { data: project(full, selectOf(q)) };
  };
}
const edit = async (body: unknown) =>
  read(
    await room.PATCH(
      new Request("http://vibe.test/", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ slug: SLUG, channelId: CHANNEL }) },
    ),
  );
const updates = (state: State) => of(state, "service:channels.update");

for (const kind of ["lounge", "board", "officers", "event", null] as const) {
  test(`edit: post_policy on kind ${String(kind)} -> 409 room_locked, nothing written`, async () => {
    for (const value of ["officers", "everyone", "mods"]) {
      const state = setup({ service: editService(kind) });
      assert.deepEqual(await edit({ topic: "New topic", post_policy: value }), { status: 409, body: ROOM_LOCKED }, value);
      assert.equal(updates(state).length, 0);
    }
  });
}

test("edit: a post_policy outside the three on an extra room is 400, nothing written", async () => {
  for (const bad of ["mods", "", null, 1]) {
    const state = setup({ service: editService("room") });
    assert.deepEqual(await edit({ post_policy: bad }), { status: 400, body: { ok: false, error: "Invalid post_policy" } }, JSON.stringify(bad));
    assert.equal(updates(state).length, 0);
  }
});

for (const policy of ["officers", "listed", "everyone"] as const) {
  test(`edit: post_policy ${policy} on an extra room is written and read back`, async () => {
    const state = setup({ service: editService("room") });
    const res = await edit({ topic: "Rush week", post_policy: policy });
    assert.equal(res.status, 200);
    const [update, ...rest] = updates(state);
    assert.equal(rest.length, 0);
    assert.deepEqual(update.calls[0], ["update", { topic: "Rush week", post_policy: policy }]);
    assert.equal(argOf(update, "eq", "id"), CHANNEL);
    assert.equal(selectOf(update), `${UPDATED_COLUMNS}, post_policy`);
    assert.equal((res.body.channel as Record<string, unknown>).post_policy, policy);
    assert.deepEqual(state.events, ["rateLimit", "requireNotRestricted", ...GUARD, "service:channels.select", "service:channels.update"]);
    assert.deepEqual(state.rateArgs, [`budget-orgOfficer:${ME}`, { limit: 300, windowSec: 600 }]);
  });
}

/**
 * A database without the column: a write or a returning select that names
 * `post_policy` fails with `missing`; the rest is answered as `editService`
 * does, or with `retry` when the test says how the update from before ends.
 */
function editServiceWithoutColumn(missing: NonNullable<Answer["error"]>, retry?: Answer) {
  const base = editService("room");
  return (q: Query): Answer => {
    if (label(q) !== "service:channels.update") return base(q);
    if ("post_policy" in (q.calls[0][1] as object) || selectOf(q).includes("post_policy")) return { error: missing };
    return retry ?? base(q);
  };
}

for (const missing of [NOT_IN_CACHE, MISSING_COLUMN]) {
  test(`edit: a rule on a database without the column (${missing.code}) -> 503 try_again, not 500`, async () => {
    for (const policy of ["officers", "listed"]) {
      const state = setup({ service: editServiceWithoutColumn(missing) });
      assert.deepEqual(await edit({ name: "exec-only", post_policy: policy }), { status: 503, body: TRY_AGAIN }, policy);
      assert.equal(updates(state).length, 1, "no retry without the rule: the name is not written either");
    }
  });

  test(`edit: everyone on a database without the column (${missing.code}) -> the rest is saved by today's update, once`, async () => {
    const state = setup({ service: editServiceWithoutColumn(missing) });
    const res = await edit({ topic: "Rush week", is_private: false, post_policy: "everyone" });
    assert.equal(res.status, 200);
    const [first, second, ...rest] = updates(state);
    assert.equal(rest.length, 0, "one retry, no more");
    assert.deepEqual(first.calls[0], ["update", { topic: "Rush week", is_private: false, post_policy: "everyone" }]);
    assert.equal(selectOf(first), `${UPDATED_COLUMNS}, post_policy`);
    assert.deepEqual(second.calls[0], ["update", { topic: "Rush week", is_private: false }], "today's patch: no post_policy key");
    assert.equal(argOf(second, "eq", "id"), CHANNEL);
    assert.equal(selectOf(second), UPDATED_COLUMNS);
    const channel = res.body.channel as Record<string, unknown>;
    assert.equal(channel.topic, "Rush week");
    assert.equal(channel.post_policy, "everyone", "a missing column means everyone");
    assert.deepEqual(state.events, ["rateLimit", "requireNotRestricted", ...GUARD, "service:channels.select", "service:channels.update", "service:channels.update"]);
  });
}

test("edit: everyone alone on a database without the column writes nothing and reads the room back", async () => {
  const state = setup({ service: editServiceWithoutColumn(MISSING_COLUMN) });
  const res = await edit({ post_policy: "everyone" });
  assert.equal(res.status, 200);
  assert.equal(updates(state).length, 1, "the update that failed; no empty update after it");
  const [, readBack, ...rest] = of(state, "service:channels.select"); // the first is the guard's load of the room
  assert.equal(rest.length, 0);
  assert.equal(selectOf(readBack), UPDATED_COLUMNS);
  assert.equal(argOf(readBack, "eq", "id"), CHANNEL);
  const channel = res.body.channel as Record<string, unknown>;
  assert.equal(channel.id, CHANNEL);
  assert.equal(channel.post_policy, "everyone");
});

test("edit: everyone on a database without the column, and the update from before fails too -> today's 500, no third try", async () => {
  for (const retry of [BOOM, MISSING_COLUMN]) {
    const state = setup({ service: editServiceWithoutColumn(MISSING_COLUMN, { error: retry }) });
    assert.deepEqual(
      await edit({ topic: "Rush week", post_policy: "everyone" }),
      { status: 500, body: { ok: false, error: "Failed to update channel" } },
      retry.code,
    );
    assert.equal(updates(state).length, 2);
  }
});

test("edit: any other failure of an update with post_policy is today's 500", async () => {
  setup({ service: editService("room", { error: BOOM }) });
  assert.deepEqual(await edit({ post_policy: "officers" }), { status: 500, body: { ok: false, error: "Failed to update channel" } });
});

test("edit: a body without post_policy runs today's code: today's patch, today's select, today's 500", async () => {
  for (const kind of ["room", "lounge", null] as const) {
    const state = setup({ service: editService(kind) });
    const res = await edit({ topic: "New topic", pinned: true });
    assert.equal(res.status, 200, String(kind));
    const [update] = updates(state);
    assert.deepEqual(update.calls[0], ["update", { topic: "New topic", pinned: true }]);
    assert.equal(selectOf(update), UPDATED_COLUMNS);
    assert.ok(!("post_policy" in (res.body.channel as Record<string, unknown>)));
  }
  setup({ service: editService("room", { error: MISSING_COLUMN }) });
  assert.deepEqual(await edit({ topic: "New topic" }), { status: 500, body: { ok: false, error: "Failed to update channel" } }, "a missing schema without post_policy in the patch is not a 503");
});

test("edit: the gates before the room (401, the limiter, the restriction gate, the officer guard)", async () => {
  const out = setup({ user: null });
  assert.deepEqual(await edit({ post_policy: "officers" }), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.deepEqual(out.events, []);
  const restricted = setup({ restricted: true, service: editService("room") });
  assert.deepEqual(await edit({ post_policy: "officers" }), { status: 403, body: { ok: false, error: "restricted" } });
  assert.deepEqual(restricted.events, ["rateLimit", "requireNotRestricted"]);
  const member = setup({ role: "member", service: editService("room") });
  assert.deepEqual(await edit({ post_policy: "officers" }), { status: 403, body: { ok: false, error: "Admin only" } });
  assert.equal(updates(member).length, 0);
});

// ── GET /api/orgs/[slug]/members: ?visible=1 (4.2, 1.3 K4) ───────────────────

const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T10:00:00+00:00`;
const memberRow = (user_id: string, role: string, joined_at: string, name: string) => ({
  user_id, role, joined_at, users: { id: user_id, name, handle: name.toLowerCase(), avatar_url: null, school_verified: name !== "Cat" },
});
/** As the database sends them: in no useful order. Ben is blocked by the viewer; Cat has blocked the viewer. */
const ROSTER = [
  memberRow(CAT, "member", day(9), "Cat"),
  memberRow(BEN, "member", day(5), "Ben"),
  memberRow(ME, "owner", day(1), "Me"),
  memberRow(ANN, "admin", day(3), "Ann"),
];
const rosterService = (q: Query): Answer => {
  if (q.table === "org_members") return { data: ROSTER };
  throw new Error(`unexpected service read of ${q.table}`);
};
const blockRows = (): Answer => ({ data: [{ blocker_id: ME, blocked_id: BEN }, { blocker_id: CAT, blocked_id: ME }] });
const getRoster = async (query = "") =>
  read(await roster.GET(new Request(`http://vibe.test/api/orgs/${SLUG}/members${query}`), { params: Promise.resolve({ slug: SLUG }) }));
const ids = (res: { body: Record<string, unknown> }) => (res.body.members as { user_id: string }[]).map((m) => m.user_id);
const blockReads = (state: State) => of(state, "cookie:blocks.select");

test("roster: without visible it is today's list, everyone in it, and no block read is made", async () => {
  // The cookie fake throws on any read: the blocks table is never asked.
  const state = setup({ role: "member", service: rosterService });
  const res = await getRoster();
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), [ME, ANN, BEN, CAT], "owner, admin, then members by the day they joined");
  assert.deepEqual((res.body.members as unknown[])[3], {
    user_id: CAT, role: "member", joined_at: day(9), name: "Cat", handle: "cat", avatar_url: null, school_verified: false,
  });
  assert.equal(blockReads(state).length, 0);
});

test("roster: visible=1 leaves out the people in a block with the viewer, either way", async () => {
  const state = setup({ role: "member", service: rosterService, cookie: blockRows });
  const res = await getRoster("?visible=1");
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), [ME, ANN], "Ben (blocked by me) and Cat (who blocked me) are gone; I am not");
  assert.deepEqual((res.body.members as unknown[])[1], {
    user_id: ANN, role: "admin", joined_at: day(3), name: "Ann", handle: "ann", avatar_url: null, school_verified: true,
  }, "the row shape does not change");
  const [blocks, ...rest] = blockReads(state);
  assert.equal(rest.length, 0, "one block read, on the viewer's own client");
  assert.deepEqual(blocks.calls, [["select", "blocker_id, blocked_id"], ["or", `blocker_id.eq.${ME},blocked_id.eq.${ME}`]]);
});

test("roster: visible=1 with no block is the whole list", async () => {
  setup({ role: "member", service: rosterService, cookie: () => ({ data: [] }) });
  assert.deepEqual(ids(await getRoster("?visible=1")), [ME, ANN, BEN, CAT]);
});

test("roster: visible=1 and a failed block read -> 503 try_again, never the unfiltered list", async () => {
  setup({ role: "member", service: rosterService, cookie: () => ({ error: BOOM }) });
  assert.deepEqual(await getRoster("?visible=1"), { status: 503, body: TRY_AGAIN });
});

test("roster: only the value 1 filters", async () => {
  for (const query of ["?visible=0", "?visible=true", "?visible=", "?visible=11", "?other=1"]) {
    const state = setup({ role: "member", service: rosterService });
    assert.deepEqual(ids(await getRoster(query)), [ME, ANN, BEN, CAT], query);
    assert.equal(blockReads(state).length, 0, query);
  }
});

test("roster: the gates are today's with visible=1 too (401, 403 members_only, no block read)", async () => {
  setup({ user: null });
  assert.deepEqual(await getRoster("?visible=1"), { status: 401, body: { ok: false, error: "Unauthorized", code: "unauthorized" } });
  const state = setup({ role: null, service: rosterService });
  assert.deepEqual(await getRoster("?visible=1"), { status: 403, body: { ok: false, error: "Members only", code: "members_only" } });
  assert.equal(blockReads(state).length, 0);
});
