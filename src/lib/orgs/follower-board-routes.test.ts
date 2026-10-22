/**
 * Batch 1C of the club model (Franky's calls of Oct 16: followers READ a
 * club's Announcement Board, only members type), run for real on stand-ins:
 *   - the follower answer of the thread routes (`../_lib/club-follower.ts`):
 *     thread pin, reaction, vote and card answer 403 `members_only` to a
 *     follower reading the Board, and nothing is written;
 *   - removing a follower writes the Board bar (`org_board_bars`) BEFORE the
 *     follow goes, never for someone who doesn't follow, never on a failed bar;
 *   - the club setting `followers_read_board`: officers only, a boolean, and
 *     GET reads it (null on a database without the column);
 *   - GET /api/me/club-boards: the Boards I read as a follower, decided by
 *     the database (the channels read on MY client), never a member's name.
 *
 * Run with:
 *   node --test src/lib/orgs/follower-board-routes.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments
 * as globs, so a path with `[id]` in it never matches.
 *
 * WHY THE RESOLVE HOOK (the cards/routes.test.ts pattern): the routes import
 * `next/server` (resolvable under Node only as `next/server.js`), the two
 * Supabase clients and server-only helpers. Those resolve to small data:
 * modules that answer from one `globalThis.__fb` world; the pure modules
 * (types, reads, stub, latest-per-room, blocks, following) are the real files.
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
if (typeof registerHooks !== "function") throw new Error("follower-board-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__fb";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie; }`),
  "@/lib/supabase/service": stub(
    `export function createSupabaseServiceClient() { return ${W}.service; }\n` +
      `export function isSupabaseServiceConfigured() { return ${W}.service !== undefined; }`,
  ),
  "@/lib/chat/flag-server": stub(`export async function chatV2For() { return ${W}.flag; }`),
  "@/lib/rate-limit": stub(
    `export async function rateLimit(key) { ${W}.log.push(['rateLimit', key]); return { allowed: true, retryAfterSec: 0 }; }\n` +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/moderation/access": stub(
    "export async function requireCanPublish() { return null; }\nexport async function requireNotRestricted() { return null; }\n" +
      "export function contentBlockedResponse() { return new Response('{}', { status: 422 }); }",
  ),
  "@/lib/messages/channel-access": stub(`export async function ensureMember() { return ${W}.member; }`),
  "@/lib/chat/message-read": stub(
    `export async function roomOf() { return ${W}.roomOf; }\nexport async function readChatMessage() { return null; }`,
  ),
  "@/lib/chat/rooms": stub(
    `export async function clubRole(orgId, userId) { ${W}.log.push(['clubRole', userId]); return ${W}.roles[userId] ?? null; }\n` +
      // The cards route asks it only for a members-only event (Oct 22, 2026).
      `export async function clubRoleAnswer(orgId, userId) { ${W}.log.push(['clubRoleAnswer', userId]); return ${W}.roles[userId] ?? null; }`,
  ),
  "@/lib/chat/cards/hydrate": stub("export async function hydrateCards() { return new Map(); }"),
  "@/lib/orgs/membership": stub(`export async function loadViewerOrgContext() { return ${W}.orgCtx; }`),
  "@/lib/posts/delete-media-store": stub("export async function purgeDeletedClubMedia() {}"),
  "@/lib/safety/hidden-users": stub("export async function loadHiddenUsers() { return { ok: true, hidden: { ids: [] } }; }"),
  "@/app/api/admin/images/_lib/removed-picture-store": stub("export async function checkRemovedPicture() { return 'ok'; }"),
  "@/lib/iu/community-scope": stub("export function campusScopeError() { return { status: 403, body: { ok: false } }; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
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

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq", "not", "update", "insert", "upsert", "delete"];

type World = {
  user: { id: string } | null;
  flag: boolean;
  queries: Query[];
  log: Call[];
  answer: (q: Query) => Answer;
  cookie: unknown;
  service: unknown;
  member: unknown;
  roomOf: { room: unknown; failed: boolean };
  roles: Record<string, string>;
  orgCtx: unknown;
};

function fakeClient(kind: Query["client"], world: World) {
  const settle = (q: Query, single: boolean) => {
    const a = world.answer(q);
    const data = single && Array.isArray(a.data) ? (a.data[0] ?? null) : (a.data ?? null);
    return { data, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (q: Query) => {
    const builder: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(() => settle(q, false)).then(ok, bad),
      maybeSingle: () => (q.calls.push(["maybeSingle"]), Promise.resolve().then(() => settle(q, true))),
      single: () => (q.calls.push(["single"]), Promise.resolve().then(() => settle(q, true))),
    };
    for (const name of METHODS) {
      builder[name] = (...args: unknown[]) => (q.calls.push([name, ...args]), builder);
    }
    return builder;
  };
  return {
    auth: { getUser: async () => ({ data: { user: world.user }, error: null }) },
    from(table: string) {
      const q: Query = { client: kind, table, calls: [] };
      world.queries.push(q);
      return chain(q);
    },
    rpc(fn: string, args: unknown) {
      const q: Query = { client: kind, table: `rpc:${fn}`, calls: [["rpc", args]] };
      world.queries.push(q);
      return chain(q);
    },
  };
}

const uuid = (n: number, tail: string) => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(1, "a");
const OFFICER = uuid(2, "a");
const AUTHOR = uuid(3, "a");
const ORG = uuid(1, "d");
const ORG_B = uuid(2, "d");
const BOARD_ID = uuid(1, "c");
const BOARD_B = uuid(2, "c");
const MESSAGE = uuid(1, "b");

function install(answer: (q: Query) => Answer, opts: Partial<Omit<World, "answer">> = {}): World {
  const world = {
    user: { id: ME },
    flag: true,
    queries: [],
    log: [],
    member: { ok: true, isOrgChannel: true, orgId: ORG, kind: "board", eventId: null, accepted_at: null, cleared_at: null },
    roomOf: { room: { id: BOARD_ID, kind: "board", name: "Board", org_id: ORG, event: null }, failed: false },
    roles: {},
    orgCtx: null,
    ...opts,
    answer,
  } as World;
  world.cookie = fakeClient("cookie", world);
  world.service = "service" in opts ? opts.service : fakeClient("service", world);
  (globalThis as unknown as { __fb: World }).__fb = world;
  return world;
}

/** A call that names a column filter: `eq <column> <value>`. */
const has = (q: Query, method: string, ...args: unknown[]) =>
  q.calls.some((c) => c[0] === method && args.every((a, i) => c[i + 1] === a));
const tables = (w: World) => w.queries.map((q) => `${q.client}:${q.table}`);
const MEMBERS_ONLY = { ok: false, error: "Members only.", code: "members_only" };

async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
function req(method: string, body?: unknown) {
  return new Request("https://vibe.test/", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ── The helper ───────────────────────────────────────────────────────────────

const HELPER = "../../app/api/me/threads/[id]/_lib/club-follower.ts";
const helper = (await import(HELPER)) as typeof import("../../app/api/me/threads/[id]/_lib/club-follower");
type Cookie = Parameters<typeof helper.standingInRoom>[0];
const cookieOf = (w: World) => w.cookie as Cookie;

test("membersOnly: 403 with the chat's own `members_only` body, the one the read path gives a follower", async () => {
  assert.deepEqual(await json(helper.membersOnly()), { status: 403, body: MEMBERS_ONLY });
});

test("standingInRoom: a club room on MY client, then my own membership row; anything else is not a club", async () => {
  const cases: [string, Answer, Answer, string, number][] = [
    ["a room I can't read", { data: null }, { data: null }, "not_club", 1],
    ["a dm or a group", { data: { org_id: null } }, { data: null }, "not_club", 1],
    ["a club room, my row", { data: { org_id: ORG } }, { data: { org_id: ORG } }, "member", 2],
    ["a club room, no row: a follower reading the Board", { data: { org_id: ORG } }, { data: null }, "follower", 2],
    ["the room read fails", { error: { code: "57014", message: "timeout" } }, { data: null }, "failed", 1],
    ["the membership read fails", { data: { org_id: ORG } }, { error: { code: "57014", message: "timeout" } }, "failed", 2],
  ];
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const [name, room, row, want, reads] of cases) {
      const w = install((q) => (q.table === "channels" ? room : row));
      assert.equal(await helper.standingInRoom(cookieOf(w), BOARD_ID, ME), want, name);
      assert.equal(w.queries.length, reads, name);
      assert.ok(w.queries.every((q) => q.client === "cookie"), `${name}: the viewer's client only`);
      if (reads === 2) assert.ok(has(w.queries[1], "eq", "org_id", ORG) && has(w.queries[1], "eq", "user_id", ME), name);
    }
  } finally {
    console.error = quiet;
  }
  const w = install(() => ({ data: null }));
  assert.equal(await helper.standingInRoom(cookieOf(w), "not-a-uuid", ME), "not_club");
  assert.equal(w.queries.length, 0, "a malformed id is never sent");
});

// ── POST /api/me/threads/[id]/pin (pin a chat to the top of MY list) ────────

const PIN = "../../app/api/me/threads/[id]/pin/route.ts";
const pinRoute = (await import(PIN)) as typeof import("../../app/api/me/threads/[id]/pin/route");
const pin = () => pinRoute.POST(req("POST", { pinned: true }), { params: Promise.resolve({ id: BOARD_ID }) });

test("thread pin: a follower reading the Board → 403 members_only, nothing written", async () => {
  const w = install((q) => (q.table === "channels" ? { data: { org_id: ORG } } : { data: null }));
  assert.deepEqual(await json(await pin()), { status: 403, body: MEMBERS_ONLY });
  assert.deepEqual(tables(w), ["cookie:channel_members", "cookie:channels", "cookie:org_members"]);
  assert.ok(!w.queries.some((q) => has(q, "update")), "no update");
});

test("thread pin: no row in a dm or a room I can't read → today's 403 Not a member; my own row → pinned", async () => {
  install(() => ({ data: null }));
  assert.deepEqual(await json(await pin()), { status: 403, body: { ok: false, error: "Not a member" } });
  const w = install((q) => (q.table === "channel_members" ? { data: { pinned_at: null } } : { data: null }));
  assert.deepEqual(await json(await pin()), { status: 200, body: { ok: true, pinned: true } });
  assert.deepEqual(tables(w), ["cookie:channel_members", "cookie:channel_members"], "a member's pin asks nothing more");
});

// ── POST / DELETE /api/me/threads/[id]/messages/[messageId]/react ───────────

const REACT = "../../app/api/me/threads/[id]/messages/[messageId]/react/route.ts";
const reactRoute = (await import(REACT)) as typeof import("../../app/api/me/threads/[id]/messages/[messageId]/react/route");
const EMOJI_FILE = "../messages/reaction-emoji.ts";
const { ALLOWED_EMOJIS } = (await import(EMOJI_FILE)) as typeof import("../messages/reaction-emoji");
const reactCtx = { params: Promise.resolve({ id: BOARD_ID, messageId: MESSAGE }) };
const react = (method: "POST" | "DELETE") => reactRoute[method](req(method, { emoji: ALLOWED_EMOJIS[0] }), reactCtx);

function reactWorld(orgId: string | null, membership: Answer) {
  return install((q) => {
    if (q.table === "messages") return { data: { user_id: OFFICER, channels: { org_id: orgId } } };
    if (q.table === "org_members") return membership;
    return { data: [] };
  });
}

test("react: a follower, as the database answers since M2 (no club message on their client) → 404, nothing more read or stored", async () => {
  // Wave-3 review, finding 10: messages_select_org_member shows a follower no
  // club message, so the route's first read finds nothing.
  const w = install((q) => (q.table === "messages" ? { data: null } : { data: [] }));
  assert.deepEqual(await json(await react("POST")), { status: 404, body: { ok: false, error: "That message is no longer there." } });
  assert.deepEqual(tables(w), ["cookie:messages"]);
});

test("react BACKSTOP: should a follower ever read the message, 403 members_only before the block read; no reaction stored", async () => {
  const w = reactWorld(ORG, { data: null });
  assert.deepEqual(await json(await react("POST")), { status: 403, body: MEMBERS_ONLY });
  assert.deepEqual(tables(w), ["cookie:messages", "cookie:org_members"]);
  assert.ok(
    has(w.queries[0], "select", "user_id, content, kind, media_url, media_kind, attachment_id, attachment_kind, card_event_id, channels:channels!messages_channel_id_fkey(org_id)"),
    "the club rides on the message read, with the note's shape",
  );
});

test("react: a message its sender deleted (its \"Message deleted\" note) takes no reaction → 404, nothing more read or stored (review of Oct 19, 2026)", async () => {
  const note = { user_id: OFFICER, content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null, channels: { org_id: null } };
  const w = install((q) => (q.table === "messages" ? { data: note } : { data: [] }));
  assert.deepEqual(await json(await react("POST")), { status: 404, body: { ok: false, error: "That message is no longer there." } });
  assert.deepEqual(tables(w), ["cookie:messages"]);
  // A shared post with no words keeps its kind: it is not a note.
  const shared = install((q) => (q.table === "messages" ? { data: { ...note, attachment_kind: "post" } } : { data: [] }));
  assert.notEqual((await react("POST")).status, 404);
  assert.ok(shared.queries.length > 1);
});

test("react: a member reacts as before; a dm asks no membership; a failed membership read → 503, nothing stored", async () => {
  const member = reactWorld(ORG, { data: { org_id: ORG } });
  assert.equal((await react("POST")).status, 200);
  assert.deepEqual(tables(member), ["cookie:messages", "cookie:org_members", "cookie:blocks", "cookie:message_reactions"]);
  const dm = reactWorld(null, { data: null });
  assert.equal((await react("POST")).status, 200);
  assert.deepEqual(tables(dm), ["cookie:messages", "cookie:blocks", "cookie:message_reactions"]);
  const quiet = console.error;
  console.error = () => {};
  try {
    const failed = reactWorld(ORG, { error: { code: "57014", message: "timeout" } });
    assert.deepEqual(await json(await react("POST")), { status: 503, body: { ok: false, error: "Try again in a moment." } });
    assert.ok(!tables(failed).includes("cookie:message_reactions"));
  } finally {
    console.error = quiet;
  }
});

test("react: taking a reaction back is never refused to a follower (one left while a member)", async () => {
  const w = reactWorld(ORG, { data: null });
  assert.equal((await react("DELETE")).status, 200);
  assert.deepEqual(tables(w), ["cookie:message_reactions"]);
});

// ── PUT .../cards/[messageId]/vote and POST .../cards ───────────────────────

const VOTE = "../../app/api/me/threads/[id]/cards/[messageId]/vote/route.ts";
const voteRoute = (await import(VOTE)) as typeof import("../../app/api/me/threads/[id]/cards/[messageId]/vote/route");
const CARDS = "../../app/api/me/threads/[id]/cards/route.ts";
const cardsRoute = (await import(CARDS)) as typeof import("../../app/api/me/threads/[id]/cards/route");
const OPTION = uuid(1, "f");
const vote = () =>
  voteRoute.PUT(req("PUT", { option_id: OPTION, on: true }), { params: Promise.resolve({ id: BOARD_ID, messageId: MESSAGE }) });
const card = () =>
  cardsRoute.POST(req("POST", { type: "poll", question: "Pizza or tacos?", options: [{ label: "Pizza" }, { label: "Tacos" }] }), {
    params: Promise.resolve({ id: BOARD_ID }),
  });

/** The database refuses with `code`; the poll row is a live poll on the Board. */
function cardWorld(code: string, roles: Record<string, string>) {
  return install(
    (q) => {
      if (q.table === "messages") return { data: [{ id: MESSAGE, kind: "poll", user_id: OFFICER, card_event_id: null, removed_at: null }] };
      if (q.table === "blocks") return { data: [] };
      if (q.table.startsWith("rpc:")) return { error: { code, message: "refused" } };
      throw new Error(`unexpected read of ${q.table}`);
    },
    { roles },
  );
}
const roleReads = (w: World) => w.log.filter((c) => c[0] === "clubRole").length;
const POLL_CLOSED = { ok: false, error: "This one is closed.", code: "poll_closed" };
const OFFICERS_ONLY = { ok: false, error: "Only officers post here.", code: "board_officers_only" };

test("vote: a follower, as the database answers since M2 (no club message on their client) → 404 not_found, no vote cast", async () => {
  // Wave-3 review, finding 10: step 9's read finds nothing for a follower.
  const w = install((q) => {
    if (q.table === "messages") return { data: [] };
    throw new Error(`unexpected read of ${q.table}`);
  });
  const res = await json(await vote());
  assert.equal(res.status, 404);
  assert.equal((res.body as { code?: unknown }).code, "not_found");
  assert.deepEqual(tables(w), ["cookie:messages"]);
  assert.equal(roleReads(w), 0);
});

test("vote BACKSTOP: should a follower (no role) ever read the poll, refused as closed (P0C25) or can't take part (P0C21) → 403 members_only, one role read", async () => {
  for (const code of ["P0C25", "P0C21"]) {
    const w = cardWorld(code, {});
    assert.deepEqual(await json(await vote()), { status: 403, body: MEMBERS_ONLY }, code);
    assert.equal(roleReads(w), 1, code);
  }
});

test("vote: a member keeps the database's own answer, and the role is read once", async () => {
  const closed = cardWorld("P0C25", { [ME]: "member" });
  assert.deepEqual(await json(await vote()), { status: 409, body: POLL_CLOSED });
  assert.equal(roleReads(closed), 1);
  const board = cardWorld("P0C21", { [ME]: "member" });
  assert.deepEqual(await json(await vote()), { status: 403, body: OFFICERS_ONLY });
  assert.equal(roleReads(board), 1, "rpcRefusal reuses the role read for the follower check");
  const full = cardWorld("P0C26", {});
  assert.equal((await vote()).status, 409, "any other refusal never asks the role");
  assert.equal(roleReads(full), 0);
});

test("card: a follower posting a poll on the Board → 403 members_only; a member → Only officers post here", async () => {
  const follower = cardWorld("P0C21", {});
  assert.deepEqual(await json(await card()), { status: 403, body: MEMBERS_ONLY });
  assert.equal(roleReads(follower), 1);
  const member = cardWorld("P0C21", { [ME]: "member" });
  assert.deepEqual(await json(await card()), { status: 403, body: OFFICERS_ONLY });
  assert.equal(roleReads(member), 1);
  const closed = cardWorld("P0C25", {});
  assert.deepEqual(await json(await card()), { status: 409, body: POLL_CLOSED }, "a card's P0C25 is the table's");
  assert.equal(roleReads(closed), 0);
});

// ── DELETE /api/orgs/[slug]/followers/[userId]: the Board bar ───────────────

const REMOVE = "../../app/api/orgs/[slug]/followers/[userId]/route.ts";
const removeRoute = (await import(REMOVE)) as typeof import("../../app/api/orgs/[slug]/followers/[userId]/route");
const removeFollower = () => removeRoute.DELETE(req("DELETE"), { params: Promise.resolve({ slug: "sae", userId: AUTHOR }) });

type RemoveSetup = { viewerRole?: string; targetRole?: string | null; follows?: boolean; bar?: Answer };
function removeWorld(s: RemoveSetup = {}) {
  return install(
    (q) => {
      if (q.table === "orgs") return { data: { id: ORG, hidden_at: null } };
      if (q.table === "org_members") {
        const role = has(q, "eq", "user_id", OFFICER) ? (s.viewerRole ?? "admin") : (s.targetRole ?? null);
        return { data: role ? { role } : null };
      }
      if (q.table === "org_board_bars") return s.bar ?? { data: null };
      if (q.table === "org_followers" && has(q, "delete")) return { count: 1 };
      if (q.table === "org_followers" && has(q, "select", "user_id")) return { data: s.follows === false ? null : { user_id: AUTHOR } };
      if (q.table === "org_followers") return { count: 4 };
      throw new Error(`unexpected read of ${q.table}`);
    },
    { user: { id: OFFICER } },
  );
}
const ops = (w: World) =>
  w.queries.filter((q) => q.client === "service").map((q) => `${q.table}:${String((q.calls.find((c) => ["upsert", "delete"].includes(String(c[0]))) ?? q.calls[0])[0])}`);

test("remove follower: the bar is written FIRST (who and when, one row per club and person), then the follow goes", async () => {
  const w = removeWorld();
  assert.deepEqual(await json(await removeFollower()), { status: 200, body: { ok: true, removed: true, follower_count: 4 } });
  assert.deepEqual(ops(w), [
    "orgs:select", "org_members:select", "org_members:select", "org_followers:select",
    "org_board_bars:upsert", "org_followers:delete", "org_followers:select",
  ]);
  const upsert = w.queries.find((q) => q.table === "org_board_bars")!.calls[0];
  const row = upsert[1] as Record<string, unknown>;
  assert.deepEqual([row.org_id, row.user_id, row.barred_by], [ORG, AUTHOR, OFFICER]);
  assert.ok(typeof row.barred_at === "string" && !Number.isNaN(Date.parse(row.barred_at)), "barred_at is sent: a second removal refreshes it");
  assert.deepEqual(upsert[2], { onConflict: "org_id,user_id" });
  assert.ok(w.queries.every((q) => q.client === "service" || q.table !== "org_board_bars"), "the bar is service-role only");
});

test("remove follower: someone who doesn't follow is never barred (removed: false, as before)", async () => {
  const w = removeWorld({ follows: false });
  assert.deepEqual(await json(await removeFollower()), { status: 200, body: { ok: true, removed: false, follower_count: 4 } });
  assert.ok(!ops(w).some((op) => op.startsWith("org_board_bars") || op === "org_followers:delete"));
});

test("remove follower: a bar that fails leaves the follow in place (500); a database without the table still removes", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const failed = removeWorld({ bar: { error: { code: "57014", message: "timeout" } } });
    const res = await json(await removeFollower());
    assert.deepEqual([res.status, res.body.code], [500, "remove_failed"]);
    assert.ok(!ops(failed).includes("org_followers:delete"), "never a removal they could undo by following again");
    for (const code of ["42P01", "PGRST205"]) {
      const before = removeWorld({ bar: { error: { code, message: "relation does not exist" } } });
      assert.equal((await removeFollower()).status, 200, code);
      assert.ok(ops(before).includes("org_followers:delete"), code);
    }
  } finally {
    console.error = quiet;
  }
});

test("remove follower: a member (409) and a plain member asking (403) write no bar", async () => {
  const member = removeWorld({ targetRole: "member" });
  assert.equal((await json(await removeFollower())).body.code, "member_follows");
  const asker = removeWorld({ viewerRole: "member" });
  assert.equal((await json(await removeFollower())).body.code, "officers_only");
  for (const w of [member, asker]) assert.ok(!ops(w).some((op) => op.startsWith("org_board_bars")));
});

// ── /api/orgs/[slug]: the club setting `followers_read_board` ───────────────

const ORG_ROUTE = "../../app/api/orgs/[slug]/route.ts";
const orgRoute = (await import(ORG_ROUTE)) as typeof import("../../app/api/orgs/[slug]/route");
const patchOrg = (body: unknown) => orgRoute.PATCH(req("PATCH", body), { params: Promise.resolve({ slug: "sae" }) });
const getOrg = () => orgRoute.GET(req("GET"), { params: Promise.resolve({ slug: "sae" }) });
const OWNER = uuid(9, "a");
const STORED = { id: ORG, handle: "sae", owner_id: OWNER, name: "SAE", description: "", philanthropy: "", links: [], join_policy: "invite", audience: "both", campus_id: null };

type PatchSetup = { role?: string; hidden?: boolean; updateError?: Answer["error"] };
function patchWorld(s: PatchSetup = {}) {
  return install(
    (q) => {
      if (q.table === "orgs" && has(q, "update")) {
        if (s.updateError) return { error: s.updateError };
        const sent = q.calls.find((c) => c[0] === "update")![1] as Record<string, unknown>;
        return { data: { id: ORG, handle: "sae", logo_url: null, banner_url: null, ...sent } };
      }
      if (q.table === "orgs") return { data: { ...STORED, hidden_at: s.hidden ? "2026-10-10T00:00:00Z" : null } };
      if (q.table === "org_members") return { data: { role: s.role ?? "admin" } };
      throw new Error(`unexpected read of ${q.table}`);
    },
    { user: { id: OFFICER } },
  );
}
const updateOf = (w: World) => w.queries.find((q) => q.table === "orgs" && has(q, "update"));

test("PATCH: an owner or admin turns the Board off for followers; the save reads the setting back", async () => {
  for (const role of ["admin", "owner"]) {
    const w = patchWorld({ role });
    const res = await json(await patchOrg({ followers_read_board: false }));
    assert.equal(res.status, 200, role);
    assert.equal((res.body.org as Record<string, unknown>).followers_read_board, false, role);
    const update = updateOf(w)!;
    const patch = update.calls.find((c) => c[0] === "update")![1] as Record<string, unknown>;
    assert.deepEqual(Object.keys(patch).sort(), ["followers_read_board", "updated_at"], role);
    assert.ok(String(update.calls.find((c) => c[0] === "select")![1]).endsWith(", followers_read_board"), role);
  }
  const hidden = patchWorld({ hidden: true });
  assert.equal((await patchOrg({ followers_read_board: true })).status, 200, "stored on a hidden club too: it opens nothing there");
  assert.ok(updateOf(hidden));
});

test("PATCH: a member can't change it (403); anything but a boolean is 400; nothing is written", async () => {
  for (const role of ["member"]) {
    const w = patchWorld({ role });
    assert.deepEqual((await json(await patchOrg({ followers_read_board: false }))).body.code, "settings_officers_only", role);
    assert.equal(updateOf(w), undefined, role);
  }
  for (const value of ["no", 0, null, {}]) {
    const w = patchWorld();
    const res = await json(await patchOrg({ followers_read_board: value }));
    assert.deepEqual([res.status, res.body.code], [400, "invalid_followers_read_board"], JSON.stringify(value));
    assert.equal(updateOf(w), undefined);
  }
});

test("PATCH: every other save reads what it always did (no setting column), and a database without the column says so", async () => {
  const other = patchWorld();
  assert.equal((await patchOrg({ backdrop_preset: "forest" })).status, 200);
  assert.ok(!String(updateOf(other)!.calls.find((c) => c[0] === "select")![1]).includes("followers_read_board"));
  const quiet = console.error;
  console.error = () => {};
  try {
    patchWorld({ updateError: { code: "PGRST204", message: "Could not find the 'followers_read_board' column of 'orgs' in the schema cache" } });
    assert.deepEqual((await json(await patchOrg({ followers_read_board: false }))).body.code, "board_setting_unavailable");
  } finally {
    console.error = quiet;
  }
});

type GetSetup = { role?: string | null; canView?: boolean | "error"; board?: boolean };
function getWorld(missingColumn: boolean, g: GetSetup = {}) {
  const role = g.role === undefined ? "member" : g.role;
  return install(
    (q) => {
      if (q.table === "channels") {
        assert.equal(q.client, "service", "the Board's id is a fact about the club");
        assert.ok(has(q, "eq", "kind", "board"));
        return { data: g.board === false ? [] : [{ id: BOARD_ID }] };
      }
      if (q.table === "rpc:can_view_org_channel") {
        assert.equal(q.client, "cookie", "asked as the viewer");
        assert.deepEqual(q.calls[0][1], { cid: BOARD_ID, uid: ME });
        return g.canView === "error" ? { error: { code: "XX000", message: "boom" } } : { data: g.canView ?? true };
      }
      if (q.table === "orgs") {
        const asked = String(q.calls.find((c) => c[0] === "select")![1]).includes("followers_read_board");
        if (asked && missingColumn) return { error: { code: "42703", message: "column orgs.followers_read_board does not exist" } };
        return { data: { ...STORED, hidden_at: null, created_at: "2026-09-01T00:00:00Z", logo_url: null, banner_url: null, ...(asked ? { followers_read_board: true } : {}) } };
      }
      if (q.table === "org_members") return { count: 3 };
      if (q.table === "org_followers" && has(q, "select", "source, created_at, first_followed_at")) return { data: null };
      if (q.table === "org_followers") return { count: 2 };
      throw new Error(`unexpected read of ${q.table}`);
    },
    { orgCtx: { ok: true, role, pendingInvite: null, pendingRequest: null, removed: false, viewer: { school_system: "iu", campus_id: null, is_platform_admin: false } } },
  );
}

test("GET: the club carries `followers_read_board`; a database without the column reads the club as before, the setting null", async () => {
  const w = getWorld(false);
  const res = await json(await getOrg());
  assert.equal((res.body.org as Record<string, unknown>).followers_read_board, true);
  assert.equal(w.queries.filter((q) => q.table === "orgs").length, 1, "one read when the column is there");
  const old = getWorld(true);
  const before = await json(await getOrg());
  assert.equal(before.status, 200);
  assert.equal((before.body.org as Record<string, unknown>).followers_read_board, null);
  assert.equal(old.queries.filter((q) => q.table === "orgs").length, 2);
});

test("GET: `board_readable` is the database's answer for THIS viewer; a barred follower reads like a club with it off", async () => {
  const org = async () => (await json(await getOrg())).body.org as Record<string, unknown>;
  getWorld(false);
  assert.equal((await org()).board_readable, true, "a member");
  getWorld(false, { role: null, canView: false });
  const barred = await org();
  assert.equal(barred.board_readable, false, "removed, blocked or barred: the database says no");
  assert.equal(barred.followers_read_board, null, "the club's switch never reaches a non-member: next to board_readable false it would tell them they were barred");
  getWorld(false, { role: null, canView: true });
  assert.equal((await org()).followers_read_board, null, "a follower who reads it doesn't get the switch either");
  for (const role of ["member", "admin", "owner"]) {
    getWorld(false, { role });
    assert.equal((await org()).followers_read_board, true, role);
  }
  getWorld(false, { role: null, board: false });
  assert.equal((await org()).board_readable, false, "no Board, no read");
  const quiet = console.error;
  console.error = () => {};
  try {
    getWorld(false, { role: null, canView: "error" });
    assert.equal((await org()).board_readable, null, "unknown, never a guess");
  } finally {
    console.error = quiet;
  }
});

test("GET: the member count is exact for a member and null below 5 for anyone outside the club", async () => {
  getWorld(false);
  assert.equal(((await json(await getOrg())).body.org as Record<string, unknown>).member_count, 3);
  getWorld(false, { role: null });
  assert.equal(((await json(await getOrg())).body.org as Record<string, unknown>).member_count, null);
});

// ── GET /api/me/club-boards ──────────────────────────────────────────────────

const BOARDS = "../../app/api/me/club-boards/route.ts";
const boardsRoute = (await import(BOARDS)) as typeof import("../../app/api/me/club-boards/route");
const listBoards = () => boardsRoute.GET();
const ORG_MEMBER = uuid(3, "d");
const ORG_HIDDEN = uuid(4, "d");
const ORG_BARRED = uuid(5, "d");
const ref = (id: string, name: string) => ({ id, handle: name.toLowerCase(), name, logo_url: null, banner_url: null, verified: false });
const row = (id: number, channel: string, user: string, at: string) =>
  ({ id: uuid(id, "e"), channel_id: channel, content: `post ${id}`, created_at: at, user_id: user, kind: "text", thread_root_id: null });

type BoardsSetup = { follows?: string[]; rows?: unknown[]; fail?: string; schemaMissing?: boolean; membersOnly?: string[] };
const MEMBERS = [
  { org_id: ORG, user_id: OFFICER, role: "admin" },
  { org_id: ORG_B, user_id: AUTHOR, role: "member" },
  { org_id: ORG_B, user_id: ME, role: "owner" },
];
function boardsWorld(s: BoardsSetup = {}) {
  const follows = s.follows ?? [ORG, ORG_B, ORG_MEMBER, ORG_HIDDEN, ORG_BARRED];
  return install((q) => {
    if (s.fail === `${q.client}:${q.table}`) return { error: { code: "57014", message: "timeout" } };
    if (q.client === "cookie") {
      if (q.table === "org_followers") return { data: follows.map((org_id, i) => ({ org_id, created_at: `2026-10-0${i + 1}T00:00:00Z` })) };
      if (q.table === "org_members") return { data: [{ org_id: ORG_MEMBER }] };
      if (q.table === "channels" && s.schemaMissing) return { error: { code: "42703", message: "column channels.kind does not exist" } };
      // The database's rule: the barred club's Board is not readable, so not returned.
      if (q.table === "channels") return { data: [ORG, ORG_B, ORG_MEMBER, ORG_HIDDEN].map((org_id, i) => ({ id: [BOARD_ID, BOARD_B, uuid(3, "c"), uuid(4, "c")][i], org_id, name: "Board" })) };
    }
    if (q.client === "service") {
      if (q.table === "orgs") return { data: [ref(ORG, "SAE"), ref(ORG_B, "Chess"), ref(ORG_MEMBER, "Mine"), ref(ORG_BARRED, "Barred")] };
      if (q.table === "org_members") {
        const roles = (q.calls.find((c) => c[0] === "in" && c[1] === "role")?.[2] ?? []) as string[];
        return { data: MEMBERS.filter((m) => roles.includes(m.role)) };
      }
      if (q.table === "rpc:chat_latest_per_channel") return { data: s.rows ?? [] };
      // The previews' Event cards' events (Oct 22, 2026): the members-only ones among those asked.
      if (q.table === "events") {
        assert.ok(has(q, "eq", "visibility", "members"));
        const asked = (q.calls.find((c) => c[0] === "in" && c[1] === "id")?.[2] ?? []) as string[];
        return { data: (s.membersOnly ?? []).filter((id) => asked.includes(id)).map((id) => ({ id })) };
      }
      // The shared window a refused function falls back to (latest-per-room.ts).
      if (q.table === "messages") return { data: [] };
    }
    throw new Error(`unexpected ${q.client} read of ${q.table}`);
  });
}
type Listed = { org: { id: string; name: string }; room_id: string; latest: Record<string, unknown> | null };
const boardsOf = async () => {
  const res = await json(await listBoards());
  assert.equal(res.status, 200);
  return res.body.boards as Listed[];
};

test("club-boards: signed out 401; the chat flag off 404; no follows → an empty list after one read", async () => {
  install(() => ({ data: null }), { user: null });
  assert.equal((await listBoards()).status, 401);
  install(() => ({ data: null }), { flag: false });
  assert.deepEqual(await json(await listBoards()), { status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" } });
  const w = boardsWorld({ follows: [] });
  assert.deepEqual(await boardsOf(), []);
  assert.deepEqual(tables(w), ["cookie:org_followers"]);
  const follows = w.queries[0];
  assert.ok(has(follows, "eq", "user_id", ME) && has(follows, "limit", 50), "my own follows only, bounded");
});

test("club-boards: a club I follow, am not in, not hidden, whose Board the database lets me read", async () => {
  const w = boardsWorld();
  const boards = await boardsOf();
  assert.deepEqual(boards.map((b) => [b.org.name, b.room_id]).sort(), [["Chess", BOARD_B], ["SAE", BOARD_ID]]);
  const channels = w.queries.find((q) => q.table === "channels")!;
  assert.equal(channels.client, "cookie", "the Boards on MY client: the policy is can_view_org_channel itself");
  assert.ok(has(channels, "eq", "kind", "board"));
  const orgs = w.queries.find((q) => q.table === "orgs")!;
  assert.ok(orgs.client === "service" && has(orgs, "is", "hidden_at", null));
  assert.ok(!w.queries.some((q) => q.client === "service" && ["messages", "channels", "org_followers"].includes(q.table)));
});

test("club-boards: previews with the service role (no message row reaches a follower), live top-level, no author's name", async () => {
  const w = boardsWorld({ rows: [row(1, BOARD_B, ME, "2026-10-12T00:00:00Z"), row(2, BOARD_ID, OFFICER, "2026-10-14T00:00:00Z")] });
  const boards = await boardsOf();
  assert.deepEqual(boards.map((b) => b.org.name), ["SAE", "Chess"]);
  assert.deepEqual(boards[0].latest, { id: uuid(2, "e"), text: "post 2", author_name: "", created_at: "2026-10-14T00:00:00Z", kind: "text" });
  const rpc = w.queries.find((q) => q.table === "rpc:chat_latest_per_channel")!;
  assert.equal(rpc.client, "service");
  assert.deepEqual(rpc.calls[0][1], { p_channels: [BOARD_ID, BOARD_B], p_per: 5, p_top_level_only: true, p_live_only: true });
  assert.ok(!String(rpc.calls[1][1]).includes("users"), "no author embed");
  assert.ok(!w.queries.some((q) => q.client === "cookie" && (q.table === "messages" || q.table.startsWith("rpc:"))));
  const posters = w.queries.find((q) => q.table === "org_members" && q.client === "service")!;
  assert.deepEqual(posters.calls.find((c) => c[0] === "in" && c[1] === "role")![2], ["owner", "admin"]);
  boardsWorld();
  assert.deepEqual((await boardsOf()).map((b) => b.org.name), ["Chess", "SAE"], "no previews: by name");
});

test("club-boards: only a CURRENT owner's or admin's post previews; a member's, a legacy or a demoted officer's never", async () => {
  // OFFICER is an admin of SAE only; AUTHOR a plain member of Chess; ME owns
  // Chess's other seat in the stand-in (any current owner counts).
  const rows = [
    row(1, BOARD_ID, OFFICER, "2026-10-14T00:00:00Z"),
    row(2, BOARD_B, AUTHOR, "2026-10-13T00:00:00Z"),
    row(3, BOARD_B, OFFICER, "2026-10-12T00:00:00Z"),
    row(4, BOARD_B, uuid(4, "a"), "2026-10-11T00:00:00Z"),
  ];
  boardsWorld({ rows });
  const latest = Object.fromEntries((await boardsOf()).map((b) => [b.org.name, b.latest?.text ?? null]));
  assert.deepEqual(latest, { SAE: "post 1", Chess: null }, "Chess's member, SAE's admin in Chess, and a stranger: none");
});

test("club-boards: a post its officer deleted never previews to a follower; the post before it does (review of Oct 19, 2026)", async () => {
  const note = { ...row(1, BOARD_ID, OFFICER, "2026-10-14T00:00:00Z"), content: "", attachment_kind: null };
  const w = boardsWorld({ rows: [note, row(2, BOARD_ID, OFFICER, "2026-10-13T00:00:00Z")] });
  const sae = (await boardsOf()).find((b) => b.org.name === "SAE")!;
  assert.equal(sae.latest?.id, uuid(2, "e"));
  assert.equal(sae.latest?.text, "post 2");
  assert.equal(sae.latest?.created_at, "2026-10-13T00:00:00Z", "the dot is decided by the post before it, not the deleted one");
  const rpc = w.queries.find((q) => q.table === "rpc:chat_latest_per_channel")!;
  assert.ok(String(rpc.calls[1][1]).includes("attachment_kind"), "the select can tell a shared post from a note");
  // A shared post with no words is not a note: it previews.
  boardsWorld({ rows: [{ ...note, attachment_kind: "post" }] });
  assert.equal((await boardsOf()).find((b) => b.org.name === "SAE")!.latest?.id, uuid(1, "e"));
});

test("club-boards: a read that decides the list fails → 500; a database without rooms → empty", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const fail of ["cookie:org_followers", "cookie:org_members", "cookie:channels", "service:orgs", "service:org_members"]) {
      boardsWorld({ fail });
      assert.deepEqual(await json(await listBoards()), { status: 500, body: { ok: false, error: "Request failed" } }, fail);
    }
    const fallback = boardsWorld({ fail: "service:rpc:chat_latest_per_channel" });
    assert.ok((await boardsOf()).every((b) => b.latest === null), "a failed preview read keeps the list, without previews");
    assert.ok(fallback.queries.some((q) => q.client === "service" && q.table === "messages"), "the shared window, service role too");
  } finally {
    console.error = quiet;
  }
  boardsWorld({ schemaMissing: true });
  assert.deepEqual(await boardsOf(), []);
});

test("club-boards: nobody's id or name in the answer, only the clubs'", async () => {
  boardsWorld({ rows: [row(1, BOARD_ID, OFFICER, "2026-10-14T00:00:00Z")] });
  const text = JSON.stringify(await listBoards().then((r) => r.json()));
  for (const id of [ME, OFFICER, AUTHOR]) assert.ok(!text.includes(id), id);
  assert.ok(!text.includes("user_id") && !text.includes("users"));
});

// Oct 22, 2026 ("Members only" events): the Event card of a members-only
// event never previews to a follower (their Board leaves it out too); the
// post before it does. An Everyone event's card previews as before. The
// events unreadable: every Event card is left out, the list still stands.
test("club-boards: a members-only event's card never previews; an Everyone one does; its events unreadable → no card previews", async () => {
  const EV_MEMBERS = uuid(30, "e");
  const EV_EVERYONE = uuid(31, "e");
  const card = (id: number, eventId: string, at: string) => ({ ...row(id, BOARD_ID, OFFICER, at), kind: "event_card", content: "Event: Chapter", card_event_id: eventId });
  const rows = [card(1, EV_MEMBERS, "2026-10-14T00:00:00Z"), row(2, BOARD_ID, OFFICER, "2026-10-13T00:00:00Z")];
  const w = boardsWorld({ rows, membersOnly: [EV_MEMBERS] });
  const sae = (await boardsOf()).find((b) => b.org.name === "SAE")!;
  assert.equal(sae.latest?.id, uuid(2, "e"), "the post before the card");
  const rpc = w.queries.find((q) => q.table === "rpc:chat_latest_per_channel")!;
  assert.ok(String(rpc.calls[1][1]).includes("card_event_id"), "the select names the card's event");
  const events = w.queries.find((q) => q.table === "events")!;
  assert.equal(events.client, "service");

  boardsWorld({ rows: [card(1, EV_EVERYONE, "2026-10-14T00:00:00Z")], membersOnly: [EV_MEMBERS] });
  assert.equal((await boardsOf()).find((b) => b.org.name === "SAE")!.latest?.id, uuid(1, "e"), "an Everyone event's card previews");

  const quiet = console.error;
  console.error = () => {};
  try {
    boardsWorld({ rows: [card(1, EV_EVERYONE, "2026-10-14T00:00:00Z"), row(2, BOARD_ID, OFFICER, "2026-10-13T00:00:00Z")], fail: "service:events" });
    assert.equal((await boardsOf()).find((b) => b.org.name === "SAE")!.latest?.id, uuid(2, "e"), "never a card on a guess");
  } finally {
    console.error = quiet;
  }
});
