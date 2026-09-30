/**
 * The by-name allow-list guard of `POST /api/orgs/[slug]/channels/[channelId]/members`
 * (handoffs/chat-redesign/wave-2-contracts.md 6.3, D8): right after
 * `requireChannelStaff`, before the body parse, a Board, a Lounge or an
 * event chat answers 409 `room_locked`; the Officers room, an extra room and
 * a database without `channels.kind` (`kind` null, 3.10) go on as today.
 *
 * Run with:
 *   node --test src/lib/chat/members-guard.test.ts
 *
 * It lives here, not next to the route: `node --test` reads its arguments as
 * globs, so a path with `[slug]` / `[channelId]` in it never matches (the
 * remove-route.test.ts placement).
 *
 * WHY THE RESOLVE HOOK: the route imports `next/server` (resolvable under
 * Node only as `next/server.js`), the cookie client (`next/headers`), the
 * restriction gate and `loadClubOfficer` (server-only, the service role);
 * the three are replaced whole and answer from one `state` object, the pure
 * `types` module is the real file (the remove-route.test.ts pattern).
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
if (typeof registerHooks !== "function") throw new Error("members-guard.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__b3m.cookie; }"),
  "@/lib/moderation/access": stub(
    "export async function requireNotRestricted(id) { globalThis.__b3m.log.push(['requireNotRestricted', id]); " +
      "return globalThis.__b3m.restricted ? new Response(JSON.stringify({ ok: false, error: 'restricted' }), { status: 403 }) : null; }",
  ),
  "@/lib/club-routes/officer-guard": stub(
    "export async function loadClubOfficer(slug, viewerId, opts) { globalThis.__b3m.log.push(['loadClubOfficer', slug, viewerId, opts]); " +
      "return globalThis.__b3m.guard; }",
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

const specifier = "../../app/api/orgs/[slug]/channels/[channelId]/members/route.ts";
const { GET, POST } = (await import(specifier)) as typeof import("../../app/api/orgs/[slug]/channels/[channelId]/members/route");

// ── A fake service client: every chain is recorded and answered whole ───────

type Call = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Query = { table: string; calls: Call[] };

function fakeClient(answer: (q: Query) => Answer, queries: Query[]) {
  return {
    from(table: string) {
      const q: Query = { table, calls: [] };
      queries.push(q);
      const builder: Record<string, unknown> = {
        then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => answer(q))
            .then(resolve, reject);
        },
      };
      for (const method of ["select", "eq", "order", "maybeSingle", "insert"]) {
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
const CHANNEL = "cccccccc-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const ROOM_LOCKED = { ok: false, error: "This room can't be renamed, hidden or deleted.", code: "room_locked" };

type Kind = "board" | "lounge" | "officers" | "event" | "room" | null;

type Setup = {
  user?: { id: string } | null;
  restricted?: boolean;
  /** The guard's answer; a kind builds the ok answer with one channel of that kind. */
  kind?: Kind;
  guard?: unknown;
  /** The service's `org_members` row for the target (default: a member). */
  orgMember?: boolean;
};

type State = {
  cookie: unknown;
  restricted: boolean;
  guard: unknown;
  log: Call[];
};

function setup(s: Setup) {
  const queries: Query[] = [];
  const service = fakeClient((q) => {
    if (q.table === "org_members") return { data: s.orgMember === false ? null : { user_id: ME }, error: null };
    if (q.table === "org_channel_members" && q.calls[0]?.[0] === "insert") return { data: null, error: null };
    if (q.table === "org_channel_members") return { data: q.calls[0]?.[1] === "user_id" ? null : [], error: null };
    throw new Error(`unexpected service read of ${q.table}`);
  }, queries);
  const channel = { id: CHANNEL, org_id: ORG, is_private: true, name: "Board", topic: null, kind: s.kind ?? null };
  const state: State = {
    cookie: { auth: { getUser: async () => ({ data: { user: s.user === undefined ? { id: ME } : s.user }, error: null }) } },
    restricted: s.restricted ?? false,
    guard: s.guard ?? { ok: true, service, org: { id: ORG, hidden_at: null }, role: "owner", channel },
    log: [],
  };
  (globalThis as unknown as { __b3m: State }).__b3m = state;
  return { state, queries };
}

const params = Promise.resolve({ slug: SLUG, channelId: CHANNEL });
async function post(body: string | null = JSON.stringify({ user_id: ME })) {
  const req = new Request("http://vibe.test/", { method: "POST", body, headers: { "content-type": "application/json" } });
  const res = await POST(req, { params });
  assert.ok(res, "the handler answers"); // every branch returns; the inferred type carries an `undefined` the runtime never does
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const names = (log: Call[]) => log.map((c) => c[0]);

// ── The three kinds refused, before the body parse ──────────────────────────

for (const kind of ["board", "lounge", "event"] as const) {
  test(`6.3: kind ${kind} → 409 room_locked, the exact body, no service read`, async () => {
    const { queries, state } = setup({ kind });
    assert.deepEqual(await post(), { status: 409, body: ROOM_LOCKED });
    assert.equal(queries.length, 0);
    assert.deepEqual(names(state.log), ["requireNotRestricted", "loadClubOfficer"]);
    assert.deepEqual(state.log[1], ["loadClubOfficer", SLUG, ME, { channelId: CHANNEL }]);
  });
}

test("6.3: the guard runs before the body parse (a Board with invalid JSON → 409, not 400)", async () => {
  const { queries } = setup({ kind: "board" });
  assert.deepEqual(await post("{not json"), { status: 409, body: ROOM_LOCKED });
  assert.equal(queries.length, 0);
});

// ── The Officers room, an extra room and a null kind go on as today ──────────

for (const kind of ["officers", "room", null] as const) {
  test(`6.3: kind ${String(kind)} → today's path (the grant goes through)`, async () => {
    const { queries } = setup({ kind });
    assert.deepEqual(await post(), { status: 200, body: { ok: true, granted: true } });
    assert.deepEqual(
      queries.map((q) => [q.table, q.calls[0]?.[0]]),
      [["org_members", "select"], ["org_channel_members", "select"], ["org_channel_members", "insert"]],
    );
    assert.deepEqual(queries[2].calls, [["insert", { channel_id: CHANNEL, user_id: ME, added_by: ME }]]);
  });

  test(`6.3: kind ${String(kind)} → today's 400 for an empty body`, async () => {
    const { queries } = setup({ kind });
    assert.deepEqual(await post("{}"), { status: 400, body: { ok: false, error: "Provide user_id or handle" } });
    assert.equal(queries.length, 0);
  });
}

test("6.3: a non-member target on the Officers room → today's 400 (the guard is not in the way)", async () => {
  const { queries } = setup({ kind: "officers", orgMember: false });
  assert.deepEqual(await post(), { status: 400, body: { ok: false, error: "User must join the org first" } });
  assert.equal(queries.length, 1);
});

// ── What comes before the guard is untouched ────────────────────────────────

test("no user → 401 before the guard", async () => {
  const { state } = setup({ user: null, kind: "board" });
  assert.deepEqual(await post(), { status: 401, body: { ok: false, error: "Unauthorized" } });
  assert.deepEqual(state.log, []);
});

test("a restricted officer → the restriction gate's answer before loadClubOfficer", async () => {
  const { state } = setup({ restricted: true, kind: "board" });
  assert.deepEqual(await post(), { status: 403, body: { ok: false, error: "restricted" } });
  assert.deepEqual(names(state.log), ["requireNotRestricted"]);
});

test("loadClubOfficer !ok → its status and sentence (a stranger to a hidden club reads 404)", async () => {
  setup({ guard: { ok: false, status: 404, error: "Not found" } });
  assert.deepEqual(await post(), { status: 404, body: { ok: false, error: "Not found" } });
});

test("no channel on the guard → 404 Channel not found, as today", async () => {
  const { queries } = setup({ kind: "board" });
  const state = (globalThis as unknown as { __b3m: State }).__b3m;
  state.guard = { ...(state.guard as Record<string, unknown>), channel: null };
  assert.deepEqual(await post(), { status: 404, body: { ok: false, error: "Channel not found" } });
  assert.equal(queries.length, 0);
});

test("the GET is untouched: a Board's list still answers (the guard is POST-only)", async () => {
  const { queries } = setup({ kind: "board" });
  const res = await GET(new Request("http://vibe.test/"), { params });
  assert.ok(res, "the handler answers");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, members: [] });
  assert.deepEqual(queries.map((q) => q.table), ["org_channel_members"]);
});
