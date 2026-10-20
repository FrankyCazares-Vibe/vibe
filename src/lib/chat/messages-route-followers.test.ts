/**
 * The club model's send refusal in `POST /api/me/threads/[id]/messages`
 * (batch 1B; adopted from the session scratchpad by the wave-1 repair,
 * review finding 12): only members type, so a reader without a club role (a
 * follower on the Board) is refused 403 `members_only` before anything is
 * written, and a failed role read is 503, never a guess; the GET gives a
 * follower on the Board the follower viewer (no composer), whatever the
 * database's may-post said.
 *
 * Run with:
 *   node --test src/lib/chat/messages-route-followers.test.ts
 *
 * It lives here because a path with `[id]` in it never matches `node --test`'s
 * globs. The route's imports resolve to small data: modules (STUBS below);
 * `message-read.ts` stays real where named.
 */
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (h: { resolve: (s: string, c: unknown, n: NextResolve) => unknown }) => void };
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const REAL_READ = new URL("lib/chat/message-read.ts", SRC_ROOT).href;
const G = "globalThis.__t";
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule("export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };"),
  "@/lib/supabase/server": dataModule(`export async function createSupabaseServerClient() { return ${G}.cookie; }`),
  "@/lib/supabase/service": dataModule(`export function createSupabaseServiceClient() { return ${G}.service; }\nexport function isSupabaseServiceConfigured() { return true; }`),
  "@/lib/chat/blocks": dataModule(`export async function blockedIdsFor() { return new Set(); }`),
  "@/lib/chat/message-read": dataModule(
    `export { MESSAGE_SELECT, MESSAGE_SELECT_BEFORE_ROOMS, VIEWER_OUTSIDE_ROOMS, cleanAfterParam, clampReadLimit, followerInRoom, viewerInRoom } from ${JSON.stringify(REAL_READ)};\n` +
    `export async function readChatMessages(...a) { return ${G}.read(...a); }\n` +
    `export async function describeRoom(...a) { return ${G}.describe(...a); }\n` +
    `export async function roomOf(...a) { return ${G}.roomOf(...a); }\n` +
    `export async function toChatMessages(...a) { return ${G}.toChat(...a); }`),
  "@/lib/chat/rooms": dataModule(
    `export async function canPostAnswer(...a) { ${G}.gateAsked = (${G}.gateAsked || 0) + 1; return ${G}.gate(...a); }\n` +
    `export async function clubRoleAnswer(...a) { return ${G}.role(...a); }\n` +
    `export async function filterRoomReaders(...a) { ${G}.filterArgs = a; return []; }\n` +
    `export async function loadRoom() { return null; }\nexport async function clubRole() { return null; }`),
  "@/lib/mentions": dataModule(`export function extractMentionHandles(t) { return (t.match(/@\\w+/g) || []).map((h) => h.slice(1)); }\nexport async function resolveMentionedUserIds() { return ["dddddddd-0000-4000-8000-000000000009"]; }\nexport async function insertMentionNotifications() { return { inserted: 0 }; }`),
  "@/lib/messages/channel-access": dataModule(`export async function ensureMember() { return ${G}.access; }\nexport function isChannelMessageMediaKey() { return false; }\nexport function messageMediaProxyUrl(c, m) { return "/m/" + c + "/" + m; }`),
  "@/lib/push/dispatch": dataModule(`export function enqueueMessagePush() {}\nexport function kickPushDrain() {}`),
  "@/lib/moderation/access": dataModule(`export async function requireCanPublish() { return null; }\nexport function contentBlockedResponse() { return { status: 400, body: {} }; }`),
  "@/lib/moderation/text-filter": dataModule(`export function checkText() { return { ok: true }; }`),
  "@/lib/rate-limit": dataModule(`export async function rateLimit() { return { allowed: true }; }\nexport function tooManyRequests() { return { status: 429, body: {} }; }`),
  "@/lib/safety/pair-block": dataModule(`export async function dmSendBlocked() { return { ok: true, blocked: false }; }`),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try { return nextResolve(specifier, context); } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});
const route = (await import(new URL("app/api/me/threads/%5Bid%5D/messages/route.ts", SRC_ROOT).href)) as {
  GET: (r: Request, c: unknown) => Promise<{ status: number; body: Body }>;
  POST: (r: Request, c: unknown) => Promise<{ status: number; body: Body }>;
};
/** What the stubbed NextResponse hands back: the route's own JSON. */
type Body = { viewer?: unknown; code?: string } & Record<string, unknown>;
/** The world the data: modules answer from (`globalThis.__t`). */
type World = Record<string, unknown> & { gateAsked: number };
const t: World = { gateAsked: 0 };
(globalThis as unknown as { __t: World }).__t = t;
const VIEWER = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const CH = "cccccccc-0000-4000-8000-000000000001";
const BOARD = { id: CH, kind: "board", name: "Board", org_id: ORG, event: null, post_policy: "everyone" };
const LOUNGE = { ...BOARD, kind: "lounge", name: "Lounge" };
const ACCESS = { ok: true, isOrgChannel: true, orgId: ORG, accepted_at: null, cleared_at: null, kind: "board", eventId: null };
const ctx = { params: Promise.resolve({ id: CH }) };
const THREAD_ROOM = { id: CH, kind: "board", name: "Board", org: { id: ORG, handle: "sae", name: "SAE", logo_url: null, banner_url: null, verified: false }, event: null };
function world(room: typeof BOARD, standing: "member" | "follower", role: string | null) {
  t.cookie = { auth: { getUser: async () => ({ data: { user: { id: VIEWER } }, error: null }) } };
  t.access = ACCESS;
  t.roomOf = async () => ({ room, failed: false });
  t.read = async () => ({ ok: true, messages: [], room, viewerRole: role, viewerStanding: standing });
  t.describe = async () => ({ room: { ...THREAD_ROOM, kind: room.kind }, mayPost: true });
  t.gate = async () => "no";
  t.gateAsked = 0;
  t.role = async () => role;
}

test("GET: a follower on the Board gets the follower viewer even when the database's may-post said yes", async () => {
  world(BOARD, "follower", null);
  const res = await route.GET(new Request("http://x/api/me/threads/x/messages"), ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.viewer, { role: null, can_post: false, can_reply: false, can_moderate: false, standing: "follower" });
  world(LOUNGE, "follower", null);
  assert.equal((await route.GET(new Request("http://x/"), ctx)).status, 503, "no role outside the Board: 503");
  world(BOARD, "member", "admin");
  const member = await route.GET(new Request("http://x/"), ctx);
  assert.deepEqual(member.body.viewer, { role: "admin", can_post: true, can_reply: true, can_moderate: true });
});

const send = (body: unknown) => new Request("http://x/", { method: "POST", body: JSON.stringify(body) });

test("POST: a follower is refused members_only before the gate; a failed role read is 503; a member's refusal keeps its code", async () => {
  world(BOARD, "follower", null);
  assert.deepEqual(await route.POST(send({ content: "hi @someone" }), ctx), { status: 403, body: { ok: false, error: "Members only.", code: "members_only" } });
  assert.equal(t.gateAsked, 0);
  world(BOARD, "follower", null);
  assert.deepEqual((await route.POST(send({ content: "reply", thread_root_id: CH }), ctx)).body.code, "members_only");
  world(BOARD, "member", null);
  t.role = async () => "failed";
  assert.deepEqual((await route.POST(send({ content: "hi" }), ctx)).body.code, "try_again");
  world(BOARD, "member", "member");
  assert.deepEqual(await route.POST(send({ content: "hi" }), ctx), { status: 403, body: { ok: false, error: "Only officers post here.", code: "board_officers_only" } });
  assert.equal(t.gateAsked, 1);
});

// ── No new reply under a deleted Board post (Oct 20, 2026) ──────────────────

const POST = "eeeeeeee-0000-4000-8000-000000000001";
/** The sender's own client: the Board post read (`maybeSingle`) answers `post`; an insert stops the send with a 500, so a case that gets past the check is seen. */
function cookieWith(post: { data?: unknown; error?: unknown }) {
  const reads: unknown[][] = [];
  let inserts = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: VIEWER } }, error: null }) },
    from(table: string) {
      const calls: unknown[] = [table];
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = (...a: unknown[]) => { calls.push([m, ...a]); return b; };
      b.maybeSingle = async () => { reads.push(calls); return { data: post.data ?? null, error: post.error ?? null }; };
      b.insert = () => { inserts += 1; return { select: () => ({ single: async () => ({ data: null, error: { code: "XX000", message: "stop here" } }) }) }; };
      return b;
    },
  };
  return { client, reads, inserted: () => inserts };
}
function replyWorld(post: { data?: unknown; error?: unknown }) {
  world(BOARD, "member", "member");
  t.gate = async () => "yes";
  const cookie = cookieWith(post);
  t.cookie = cookie.client;
  return cookie;
}
const reply = () => send({ content: "count me in", thread_root_id: POST });

test("POST: a reply under a Board post its sender deleted is refused board_post_missing, before any insert", async (t2) => {
  t2.mock.method(console, "error", () => {});
  const deleted = replyWorld({ data: { id: POST, deleted_at: "2026-10-19T20:00:00Z" } });
  assert.deepEqual(await route.POST(reply(), ctx), { status: 409, body: { ok: false, error: "That post is no longer there.", code: "board_post_missing" } });
  assert.equal(deleted.inserted(), 0);
  assert.deepEqual(deleted.reads, [["messages", ["select", "id, deleted_at"], ["eq", "id", POST], ["eq", "channel_id", CH]]]);

  const gone = replyWorld({ data: null });
  assert.equal((await route.POST(reply(), ctx)).body.code, "board_post_missing", "gone whole since the gate");
  assert.equal(gone.inserted(), 0);

  const failed = replyWorld({ error: { code: "XX000", message: "boom" } });
  assert.deepEqual((await route.POST(reply(), ctx)), { status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } });
  assert.equal(failed.inserted(), 0);
});

test("POST: a reply under a live post, or on a database without deleted_at, goes on to the insert; a send without a root never reads the post", async (t2) => {
  t2.mock.method(console, "error", () => {});
  const live = replyWorld({ data: { id: POST, deleted_at: null } });
  assert.equal((await route.POST(reply(), ctx)).status, 500, "past the check: the fake insert stops it");
  assert.equal(live.inserted(), 1);

  const old = replyWorld({ error: { code: "42703", message: "column messages.deleted_at does not exist" } });
  assert.equal((await route.POST(reply(), ctx)).status, 500);
  assert.equal(old.inserted(), 1, "no notes on such a database");

  world(LOUNGE, "member", "member");
  t.gate = async () => "yes";
  const lounge = cookieWith({ data: { id: POST, deleted_at: "2026-10-19T20:00:00Z" } });
  t.cookie = lounge.client;
  t.roomOf = async () => ({ room: LOUNGE, failed: false });
  assert.equal((await route.POST(send({ content: "hi" }), ctx)).status, 500);
  assert.deepEqual(lounge.reads, [], "only a Board reply reads its post");
});
