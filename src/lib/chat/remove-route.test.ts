/**
 * The decision table of `DELETE /api/me/threads/[id]/messages/[messageId]`
 * (handoffs/chat-redesign/wave-2-contracts.md 6.1, the ten gates in order)
 * against fakes: the cookie and service clients, the rate limit, the
 * restriction gate, `ensureMember`, `roomOf` and `clubRole` all answer from
 * one `state` object, so every row of the table is one small case. The
 * S71 amendment (F02) adds the last step: the mark writes `removed_by: null`
 * and the remover goes to the service-only `chat_removals` table.
 *
 * Run with:
 *   node --test src/lib/chat/remove-route.test.ts
 *
 * It lives here, not next to the route: `node --test` reads its arguments as
 * globs, so a path with `[id]` in it never matches (the rpc-refusal.test.ts
 * placement).
 *
 * WHY THE RESOLVE HOOK: the route imports `next/server` (resolvable under
 * Node only as `next/server.js`), the cookie client (`next/headers`), the
 * service client and four server-only helpers (the `message-read.test.ts`
 * pattern; the helpers are replaced whole, the pure ones — `room-rules`,
 * `types`, `missing-column`, `pgrest` — are the real files).
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
if (typeof registerHooks !== "function") throw new Error("remove-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__b3.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__b3.service; }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__b3.service !== undefined; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit(key, opts) { globalThis.__b3.log.push(['rateLimit', key, opts]); " +
      "return globalThis.__b3.rateAllowed ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: 600 }; }\n" +
      "export function tooManyRequests(r) { return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), " +
      "{ status: 429, headers: { 'retry-after': String(r.retryAfterSec) } }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireNotRestricted(id) { globalThis.__b3.log.push(['requireNotRestricted', id]); " +
      "return globalThis.__b3.restricted ? new Response(JSON.stringify({ ok: false, error: 'restricted' }), { status: 403 }) : null; }",
  ),
  "@/lib/messages/channel-access": stub(
    "export async function ensureMember(client, channelId, userId) { globalThis.__b3.log.push(['ensureMember', channelId, userId]); return globalThis.__b3.member; }",
  ),
  "@/lib/chat/message-read": stub(
    "export async function roomOf(channelId, access) { globalThis.__b3.log.push(['roomOf', channelId]); return globalThis.__b3.roomOf; }",
  ),
  "@/lib/chat/rooms": stub(
    "export async function clubRole(orgId, userId) { globalThis.__b3.log.push(['clubRole', orgId, userId]); return globalThis.__b3.roles[userId] ?? null; }",
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

const specifier = "../../app/api/me/threads/[id]/messages/[messageId]/route.ts";
const { DELETE } = (await import(specifier)) as typeof import("../../app/api/me/threads/[id]/messages/[messageId]/route");
const rulesSpecifier = "./room-rules.ts";
const { OFFICER_REMOVED_REASON } = (await import(rulesSpecifier)) as typeof import("./room-rules");

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Query = { table: string; calls: Call[]; who: "cookie" | "service" };

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
      for (const method of ["select", "eq", "is", "limit", "maybeSingle", "delete", "update", "upsert"]) {
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
const MESSAGE = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const AUTHOR = "22222222-0000-4000-8000-000000000002";
const ROOM = { id: CHANNEL, kind: "lounge", name: "Lounge", org_id: ORG, event: null };
const CLUB_MEMBER = { ok: true, isOrgChannel: true, orgId: ORG, kind: "lounge", eventId: null };
const DM_MEMBER = { ok: true, isOrgChannel: false, orgId: null };

type State = {
  user: { id: string } | null;
  cookie: ReturnType<typeof fakeClient>;
  service: ReturnType<typeof fakeClient> | undefined;
  member: unknown;
  roomOf: { room: unknown; failed: boolean };
  roles: Record<string, string>;
  rateAllowed: boolean;
  restricted: boolean;
  log: Call[];
};

type Setup = {
  user?: { id: string } | null;
  /** The cookie read's row (null: no row) or its error. */
  cookieRow?: { id: string; user_id: string; channel_id: string } | null;
  cookieError?: { code: string; message: string };
  deleteError?: { code: string; message: string };
  member?: unknown;
  roomOf?: { room: unknown; failed: boolean };
  roles?: Record<string, string>;
  rateAllowed?: boolean;
  restricted?: boolean;
  service?: false;
  serviceRow?: { id: string; user_id: string; removed_at: string | null } | null;
  serviceReadError?: { code: string; message: string };
  reports?: "none" | "open" | "missing-status" | "fail";
  updateRows?: { id: string }[];
  updateError?: { code: string; message: string };
  /** The `chat_removals` upsert fails with this error (a missing table included). */
  removalsError?: { code: string; message: string };
  /** The `chat_removals` upsert throws instead of answering. */
  removalsThrows?: boolean;
};

function setup(s: Setup) {
  const queries: Query[] = [];
  let reportReads = 0;
  const cookie = Object.assign(
    fakeClient((q) => {
      const method = q.calls[0]?.[0];
      if (q.table === "messages" && method === "delete") return { data: null, error: s.deleteError ?? null };
      if (q.table === "messages") return s.cookieError ? { data: null, error: s.cookieError } : { data: s.cookieRow ?? null, error: null };
      throw new Error(`unexpected cookie read of ${q.table}`);
    }, queries, "cookie"),
    { auth: { getUser: async () => ({ data: { user: s.user === undefined ? { id: ME } : s.user }, error: null }) } },
  );
  const service =
    s.service === false
      ? undefined
      : fakeClient((q) => {
          const method = q.calls[0]?.[0];
          if (q.table === "messages" && method === "update") return { data: s.updateRows ?? [{ id: MESSAGE }], error: s.updateError ?? null };
          if (q.table === "messages") return s.serviceReadError ? { data: null, error: s.serviceReadError } : { data: s.serviceRow ?? null, error: null };
          if (q.table === "chat_removals") {
            if (s.removalsThrows) throw new Error("socket hang up");
            return { data: null, error: s.removalsError ?? null };
          }
          if (q.table === "reports") {
            reportReads += 1;
            const mode = s.reports ?? "none";
            if (mode === "fail") return { data: null, error: { code: "XX000", message: "boom" } };
            if (mode === "missing-status" && reportReads === 1) {
              return { data: null, error: { code: "42703", message: "column reports.status does not exist" } };
            }
            if (mode === "missing-status") return { data: [{ id: "r1" }], error: null };
            return { data: mode === "open" ? [{ id: "r1" }] : [], error: null };
          }
          throw new Error(`unexpected service read of ${q.table}`);
        }, queries, "service");
  const state: State = {
    user: s.user === undefined ? { id: ME } : s.user,
    cookie,
    service,
    member: s.member ?? CLUB_MEMBER,
    roomOf: s.roomOf ?? { room: ROOM, failed: false },
    roles: s.roles ?? { [ME]: "mod" },
    rateAllowed: s.rateAllowed ?? true,
    restricted: s.restricted ?? false,
    log: [],
  };
  (globalThis as unknown as { __b3: State }).__b3 = state;
  return { state, queries };
}

async function call(channelId = CHANNEL, messageId = MESSAGE) {
  const res = await DELETE(new Request("http://vibe.test/"), { params: Promise.resolve({ id: channelId, messageId }) });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

const OTHERS_ROW = { id: MESSAGE, user_id: AUTHOR, channel_id: CHANNEL };
const MY_ROW = { id: MESSAGE, user_id: ME, channel_id: CHANNEL };
const names = (log: Call[]) => log.map((c) => c[0]);

// ── 1, 1b, 2: auth, the id, the sender ──────────────────────────────────────

test("1: no user → 401 Unauthorized, nothing read", async () => {
  const { queries } = setup({ user: null });
  assert.deepEqual(await call(), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.equal(queries.length, 0);
});

test("1b: a non-uuid [messageId] → 404 not_found after auth, before any read", async () => {
  const { queries, state } = setup({});
  const r = await call(CHANNEL, "not-a-uuid");
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { ok: false, error: "That's not there anymore.", code: "not_found" });
  assert.equal(queries.length, 0);
  assert.deepEqual(state.log, []);
});

test("1b: a non-uuid [id] falls through to ensureMember → 403 Not a member (no cookie read)", async () => {
  const { queries, state } = setup({ member: { ok: false, status: 403 } });
  assert.deepEqual(await call("abc"), { status: 403, body: { ok: false, error: "Not a member" } });
  assert.equal(queries.length, 0);
  assert.deepEqual(state.log, [["ensureMember", "abc", ME]]);
});

test("2: the sender's own row → the hard delete as today, { ok: true }, no other gate", async () => {
  const { queries, state } = setup({ cookieRow: MY_ROW });
  assert.deepEqual(await call(), { status: 200, body: { ok: true } });
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].calls, [["select", "id, user_id, channel_id"], ["eq", "id", MESSAGE], ["eq", "channel_id", CHANNEL], ["maybeSingle"]]);
  assert.deepEqual(queries[1].calls, [["delete"], ["eq", "id", MESSAGE], ["eq", "user_id", ME]]);
  assert.deepEqual(state.log, []);
});

test("2: the sender's delete that fails → 500 Request failed", async () => {
  setup({ cookieRow: MY_ROW, deleteError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await call(), { status: 500, body: { ok: false, error: "Request failed" } });
});

test("2: a cookie read that fails → 500 Request failed", async () => {
  setup({ cookieError: { code: "XX000", message: "boom" } });
  assert.deepEqual(await call(), { status: 500, body: { ok: false, error: "Request failed" } });
});

// ── 3, 4: membership, a club room, the two gates after the sender's path ────

test("3: someone else's row, not a member → the ensureMember status and Not a member", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW, member: { ok: false, status: 500 } });
  assert.deepEqual(await call(), { status: 500, body: { ok: false, error: "Not a member" } });
  assert.deepEqual(names(state.log), ["ensureMember"]);
});

test("3: someone else's row in a dm or a group → 403 not_allowed, before the rate limit", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW, member: DM_MEMBER });
  const r = await call();
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { ok: false, error: "You can't remove this message.", code: "not_allowed" });
  assert.deepEqual(names(state.log), ["ensureMember"]);
});

test("3: no row in a dm → 403 not_allowed too", async () => {
  setup({ cookieRow: null, member: DM_MEMBER });
  assert.equal((await call()).status, 403);
});

test("4: the remove bucket message-remove:<uid> 30/600 → 429, after ensureMember", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW, rateAllowed: false });
  const r = await call();
  assert.equal(r.status, 429);
  assert.deepEqual(state.log, [
    ["ensureMember", CHANNEL, ME],
    ["rateLimit", `message-remove:${ME}`, { limit: 30, windowSec: 600 }],
  ]);
});

test("4: a restricted caller → the gate's response, after the rate limit", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW, restricted: true });
  const r = await call();
  assert.deepEqual(r, { status: 403, body: { ok: false, error: "restricted" } });
  assert.deepEqual(names(state.log), ["ensureMember", "rateLimit", "requireNotRestricted"]);
});

// ── 5, 6: the room and the caller's role ────────────────────────────────────

test("5: roomOf failed → 503 try_again", async () => {
  setup({ cookieRow: OTHERS_ROW, roomOf: { room: null, failed: true } });
  const r = await call();
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "try_again");
});

test("5: no room (no chat schema) → 404 not_found", async () => {
  setup({ cookieRow: OTHERS_ROW, roomOf: { room: null, failed: false } });
  const r = await call();
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "not_found");
});

test("6: a member, or someone who left → 403 not_allowed before any service read", async () => {
  for (const roles of [{ [ME]: "member" }, {}] as Record<string, string>[]) {
    const { queries, state } = setup({ cookieRow: OTHERS_ROW, roles });
    const r = await call();
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "not_allowed");
    assert.equal(queries.length, 1, "only the cookie read");
    assert.deepEqual(names(state.log), ["ensureMember", "rateLimit", "requireNotRestricted", "roomOf", "clubRole"]);
  }
});

test("6: the service role not configured → 503 try_again", async () => {
  setup({ cookieRow: OTHERS_ROW, service: false });
  assert.equal((await call()).body.code, "try_again");
});

// ── 7: no cookie row, the service read ──────────────────────────────────────

test("7: no row anywhere → 404 not_found", async () => {
  const { queries } = setup({ cookieRow: null, serviceRow: null });
  const r = await call();
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "not_found");
  assert.deepEqual(queries[1].calls, [["select", "id, user_id, removed_at"], ["eq", "id", MESSAGE], ["eq", "channel_id", CHANNEL], ["maybeSingle"]]);
});

test("7: a row removed already → 200 { ok, removed, already }, no update", async () => {
  const { queries } = setup({ cookieRow: null, serviceRow: { id: MESSAGE, user_id: AUTHOR, removed_at: "2026-09-30T00:00:00+00:00" } });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true, already: true } });
  assert.equal(queries.length, 2);
});

test("7: a live row the caller cannot read → 404 not_found", async () => {
  const { queries } = setup({ cookieRow: null, serviceRow: { id: MESSAGE, user_id: AUTHOR, removed_at: null } });
  assert.equal((await call()).body.code, "not_found");
  assert.equal(queries.length, 2);
});

test("7: a service read that fails → 503 try_again", async () => {
  setup({ cookieRow: null, serviceReadError: { code: "XX000", message: "boom" } });
  assert.equal((await call()).body.code, "try_again");
});

// ── 8: the rank ─────────────────────────────────────────────────────────────

test("8: outranked → 403 not_allowed; equal rank and a departed author pass", async () => {
  const cases: [string, string | undefined, number][] = [
    ["mod", "admin", 403],
    ["mod", "owner", 403],
    ["admin", "owner", 403],
    ["mod", "mod", 200],
    ["admin", "admin", 200],
    ["owner", "owner", 200],
    ["mod", "member", 200],
    ["mod", undefined, 200],
    ["owner", "mod", 200],
  ];
  for (const [caller, author, status] of cases) {
    const roles: Record<string, string> = { [ME]: caller };
    if (author) roles[AUTHOR] = author;
    const { state } = setup({ cookieRow: OTHERS_ROW, roles });
    const r = await call();
    assert.equal(r.status, status, `${caller} removes ${author ?? "gone"}`);
    if (status === 403) assert.equal(r.body.code, "not_allowed");
    assert.deepEqual(state.log.filter((c) => c[0] === "clubRole"), [["clubRole", ORG, ME], ["clubRole", ORG, AUTHOR]]);
  }
});

// ── 9, 10: the open report and the mark ─────────────────────────────────────

test("9: an open report → 409 report_open; the read is the openReportCount shape with limit 1", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, reports: "open" });
  const r = await call();
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { ok: false, error: "This message has an open report. Vibe's moderators will handle it.", code: "report_open" });
  const reports = queries.filter((q) => q.table === "reports");
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0].calls, [
    ["select", "id"],
    ["eq", "target_type", "message"],
    ["eq", "target_id", MESSAGE],
    ["eq", "status", "open"],
    ["limit", 1],
  ]);
  assert.equal(queries.filter((q) => q.calls[0]?.[0] === "update").length, 0, "no update over an open report");
});

test("9: no reports.status column → every row is open: the read is repeated without it", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, reports: "missing-status" });
  assert.equal((await call()).body.code, "report_open");
  const reports = queries.filter((q) => q.table === "reports");
  assert.equal(reports.length, 2);
  assert.ok(!reports[1].calls.some((c) => c[0] === "eq" && c[1] === "status"));
});

test("9: a reports read that fails → 503 try_again, no update", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, reports: "fail" });
  assert.equal((await call()).body.code, "try_again");
  assert.equal(queries.filter((q) => q.calls[0]?.[0] === "update").length, 0);
});

test("10: the mark: service update with the officer marker where removed_at is null → { ok, removed }", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, roles: { [ME]: "admin", [AUTHOR]: "member" } });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true } });
  const update = queries.find((q) => q.calls[0]?.[0] === "update");
  assert.ok(update);
  const [[, payload], ...rest] = update.calls as [[string, Record<string, unknown>], ...Call[]];
  assert.equal(payload.removed_by, null, "who removed it is never written on the message (S71 F02)");
  assert.equal(payload.removed_reason, OFFICER_REMOVED_REASON);
  assert.equal(payload.removed_reason, "Removed by a club officer.");
  assert.ok(typeof payload.removed_at === "string" && !Number.isNaN(Date.parse(payload.removed_at)));
  assert.deepEqual(rest, [["eq", "id", MESSAGE], ["eq", "channel_id", CHANNEL], ["is", "removed_at", null], ["select", "id"]]);
  assert.equal(queries.filter((q) => q.calls[0]?.[0] === "delete").length, 0, "never a hard delete");
});

test("10: 0 rows updated (removed a moment ago) → { ok, removed, already }", async () => {
  setup({ cookieRow: OTHERS_ROW, updateRows: [] });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true, already: true } });
});

test("10: an update that fails → 503 try_again", async () => {
  setup({ cookieRow: OTHERS_ROW, updateError: { code: "XX000", message: "boom" } });
  assert.equal((await call()).body.code, "try_again");
});

test("the order of the gates for a stranger's row: ensureMember, rateLimit, requireNotRestricted, roomOf, clubRole x2", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW });
  await call();
  assert.deepEqual(names(state.log), ["ensureMember", "rateLimit", "requireNotRestricted", "roomOf", "clubRole", "clubRole"]);
});

// ── 11: who removed it, `chat_removals` (S71 amendment A3 / A5) ─────────────

const removalUpserts = (queries: Query[]) => queries.filter((q) => q.table === "chat_removals");
const messageUpdates = (queries: Query[]) => queries.filter((q) => q.table === "messages" && q.calls[0]?.[0] === "update");

test("11: a removal that marked one row upserts chat_removals with the caller's id and club role, on message_id", async () => {
  const roleCases: [string, string][] = [
    ["mod", "member"],
    ["admin", "mod"],
    ["owner", "admin"],
  ];
  for (const [role, authorRole] of roleCases) {
    const { queries } = setup({ cookieRow: OTHERS_ROW, roles: { [ME]: role, [AUTHOR]: authorRole } });
    assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true } }, role);
    const upserts = removalUpserts(queries);
    assert.equal(upserts.length, 1, `${role}: exactly one upsert`);
    // the instant of the mark: the same string goes to both writes (see the next test)
    const [[, markPayload]] = messageUpdates(queries)[0].calls as [[string, { removed_at: string }]];
    assert.deepEqual(
      upserts[0].calls,
      [
        [
          "upsert",
          { message_id: MESSAGE, removed_by: ME, removed_role: role, removed_at: markPayload.removed_at },
          { onConflict: "message_id" },
        ],
      ],
      role,
    );
  }
});

test("11: removed_at is in the upsert payload and is the very string the mark wrote (a re-removal must not keep the first time)", async () => {
  // PostgREST's ON CONFLICT DO UPDATE sets only the columns it is sent; without removed_at here
  // a second removal (after a restore) would overwrite who and which role but keep the old time.
  const { queries } = setup({ cookieRow: OTHERS_ROW, roles: { [ME]: "owner", [AUTHOR]: "member" } });
  await call();
  const [[, markPayload]] = messageUpdates(queries)[0].calls as [[string, { removed_at: unknown }]];
  const [[, upsertPayload]] = removalUpserts(queries)[0].calls as [[string, { removed_at: unknown }]];
  assert.equal(typeof markPayload.removed_at, "string");
  assert.ok(!Number.isNaN(Date.parse(markPayload.removed_at as string)));
  assert.equal(upsertPayload.removed_at, markPayload.removed_at, "one instant, sent to both writes");
});

test("11: the upsert comes after the mark, on the service client (the cookie client never sees chat_removals)", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, roles: { [ME]: "admin", [AUTHOR]: "member" } });
  await call();
  const order = queries.map((q) => `${q.table}:${String(q.calls[0]?.[0])}`);
  assert.deepEqual(order.slice(-2), ["messages:update", "chat_removals:upsert"]);
  assert.deepEqual(removalUpserts(queries).map((q) => q.who), ["service"], "never on the viewer's client");
});

test("11: the mark never carries the caller's id; only chat_removals does", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, roles: { [ME]: "mod", [AUTHOR]: "member" } });
  await call();
  const [update] = messageUpdates(queries);
  assert.ok(!JSON.stringify(update.calls).includes(ME), "no caller id anywhere in the message update");
});

test("11: an upsert that fails still answers the success answer, and logs the code and message but not the caller's id", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void errors.push(args));
  const { queries } = setup({
    cookieRow: OTHERS_ROW,
    roles: { [ME]: "mod", [AUTHOR]: "member" },
    removalsError: { code: "XX000", message: "boom" },
  });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true } });
  assert.equal(messageUpdates(queries).length, 1, "the message is removed either way");
  assert.equal(removalUpserts(queries).length, 1);
  assert.equal(errors.length, 1);
  assert.ok(String(errors[0][0]).includes("chat_removals"));
  assert.deepEqual(errors[0].slice(1), ["XX000", "boom"]);
  assert.ok(!JSON.stringify(errors).includes(ME), "the log never names the caller");
});

test("11: a missing table (a database without migration B) is tolerated: the same answer", async (t) => {
  for (const code of ["42P01", "PGRST205"]) {
    const errors: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => void errors.push(args));
    setup({
      cookieRow: OTHERS_ROW,
      roles: { [ME]: "admin", [AUTHOR]: "member" },
      removalsError: { code, message: `relation "public.chat_removals" does not exist` },
    });
    assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true } }, code);
    assert.equal(errors.length, 1, code);
    assert.ok(String(errors[0][0]).includes("not in this database yet"), code);
    assert.equal(errors[0][1], code);
    t.mock.restoreAll();
  }
});

test("11: an upsert that throws is swallowed too: the same answer", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void errors.push(args));
  setup({ cookieRow: OTHERS_ROW, roles: { [ME]: "mod", [AUTHOR]: "member" }, removalsThrows: true });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true } });
  assert.equal(errors.length, 1);
  assert.ok(!JSON.stringify(errors).includes(ME));
});

test("11: the mark touched 0 rows (removed a moment ago) → the 'already' answer and no chat_removals write", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, updateRows: [] });
  assert.deepEqual(await call(), { status: 200, body: { ok: true, removed: true, already: true } });
  assert.equal(removalUpserts(queries).length, 0);
});

test("11: an update that fails (503) writes no chat_removals row", async () => {
  const { queries } = setup({ cookieRow: OTHERS_ROW, updateError: { code: "XX000", message: "boom" } });
  assert.equal((await call()).body.code, "try_again");
  assert.equal(removalUpserts(queries).length, 0);
});

test("11: every refusal and the 'removed already' answer write no chat_removals row", async () => {
  const runs: [string, Setup][] = [
    ["outranked", { cookieRow: OTHERS_ROW, roles: { [ME]: "mod", [AUTHOR]: "admin" } }],
    ["a member", { cookieRow: OTHERS_ROW, roles: { [ME]: "member" } }],
    ["an open report", { cookieRow: OTHERS_ROW, reports: "open" }],
    ["a dm", { cookieRow: OTHERS_ROW, member: DM_MEMBER }],
    ["removed already", { cookieRow: null, serviceRow: { id: MESSAGE, user_id: AUTHOR, removed_at: "2026-09-30T00:00:00+00:00" } }],
    ["the sender's own delete", { cookieRow: MY_ROW }],
  ];
  for (const [what, s] of runs) {
    const { queries } = setup(s);
    await call();
    assert.equal(removalUpserts(queries).length, 0, what);
  }
});

test("11: the order of the gates is unchanged by the new write (no extra gate before the mark)", async () => {
  const { state } = setup({ cookieRow: OTHERS_ROW });
  await call();
  assert.deepEqual(names(state.log), ["ensureMember", "rateLimit", "requireNotRestricted", "roomOf", "clubRole", "clubRole"]);
});
