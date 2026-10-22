/**
 * The club model's FOLLOWER read path in `message-read.ts` (batch 1B, Franky's
 * calls of Oct 16; adopted from the session scratchpad by the wave-1 repair,
 * review finding 12), against fakes of the two clients:
 *   - a follower's Board page comes from the service role, top-level live
 *     posts by current owners and admins only (repair of finding 1), shown
 *     as the club's (no author, no id, no role), counts only on cards and
 *     reactions, no reply counts, `?root=` refused 403 `members_only`;
 *   - a member's page is unchanged; unreadable roles are 503;
 *   - `followerInRoom`, `readThreadRoom`, `describeRoom`, `filterRoomReaders`
 *     (members only) and `clubRoleAnswer`.
 *
 * Run with:
 *   node --test src/lib/chat/message-read-followers.test.ts
 *
 * WHY THE RESOLVE HOOK: the module's imports reach "server-only" and
 * "@/lib/supabase/service" (the `profile/handle-change.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("message-read.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const SERVICE_STUB_URL = `data:text/javascript,${encodeURIComponent(
  "export function createSupabaseServiceClient() { return globalThis.__vibeFakeServiceClient; }\n" +
    "export function isSupabaseServiceConfigured() { return globalThis.__vibeFakeServiceClient !== undefined; }",
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "@/lib/supabase/service") return { url: SERVICE_STUB_URL, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = new URL("lib/chat/message-read.ts", SRC_ROOT).href;
const { describeRoom, followerInRoom, readChatMessages, readThreadRoom, viewerInRoom } = (await import(specifier)) as typeof import("./message-read");
// The same rooms.ts that message-read.ts loads ("./rooms").
const roomsModule = new URL("lib/chat/rooms.ts", SRC_ROOT).href;
type MessageRow = import("./message-read").MessageRow;
type ReadKnown = import("./message-read").ReadKnown;
type Room = import("./types").Room;
type PollCard = import("./types").PollCard;
type Client = Parameters<typeof readChatMessages>[0];

// ── A fake PostgREST client ──────────────────────────────────────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown; count?: number | null };
type Logged = { table: string; calls: Call[] };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq", "gte", "lt", "gt"] as const;

function fakeClient(answer: (table: string, calls: Call[]) => Answer) {
  const log: Logged[] = [];
  const settle = (table: string, calls: Call[]) => {
    const a = answer(table, calls);
    return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (table: string, calls: Call[]) => {
    const builder: Record<string, unknown> = {};
    for (const m of METHODS) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(() => settle(table, calls)).then(resolve, reject);
    builder.maybeSingle = () =>
      Promise.resolve().then(() => {
        const r = settle(table, calls);
        const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
        return { data: rows[0] ?? null, error: r.error };
      });
    return builder;
  };
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      return chain(table, calls);
    },
    rpc(fn: string, args: unknown) {
      const calls: Call[] = [["rpc", args]];
      log.push({ table: `rpc:${fn}`, calls });
      return chain(`rpc:${fn}`, calls);
    },
  };
  return { client, log };
}

function installService(answer: (table: string, calls: Call[]) => Answer) {
  const fake = fakeClient(answer);
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = fake.client;
  return fake;
}

const arg = (calls: Call[], method: string, column: string): unknown => calls.find((c) => c[0] === method && c[1] === column)?.[2];
const has = (calls: Call[], method: string, column: string): boolean => calls.some((c) => c[0] === method && c[1] === column);

// ── Fixtures ────────────────────────────────────────────────────────────────

// ── Followers (batch 1B scratch checks) ─────────────────────────────────────

const uuid = (n: number, tail = "0") => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VIEWER = uuid(1, "a"); // a follower: no role
const OFFICER = uuid(4, "a");
const MEMBER = uuid(5, "a");
const ORG = uuid(1, "d");
const CHANNEL = uuid(1, "c");
const BOARD: Room = { id: CHANNEL, kind: "board", name: "Board", org_id: ORG, event: null };
const LOUNGE: Room = { ...BOARD, kind: "lounge", name: "Lounge" };
const ACCESS = { ok: true as const, isOrgChannel: true as const, orgId: ORG, accepted_at: null, cleared_at: null, kind: "board" as const };
const ROLES: Record<string, string> = { [OFFICER]: "owner", [MEMBER]: "member" };
const person = (id: string, name: string) => ({ id, handle: name.toLowerCase(), name, avatar_url: null });
const at = (n: number) => `2026-10-08T20:${String(n).padStart(2, "0")}:00+00:00`;
function row(n: number, user: string, over: Partial<MessageRow> = {}): MessageRow {
  return { id: uuid(n, "b"), content: `m${n}`, created_at: at(n), user_id: user, users: person(user, `U${n}`), kind: "text", thread_root_id: null, ...over };
}
const POST = row(1, OFFICER);
const POLL = row(2, OFFICER, { kind: "poll" });
const PAGE = [POST, POLL];
/** What the Board holds for the service read: PAGE plus a legacy post by a plain member. */
const LEGACY = row(3, MEMBER);
const SERVICE_PAGE = [POST, POLL, LEGACY];
const OPT = uuid(9, "e");

function cookieClient(page: MessageRow[], over?: (table: string, calls: Call[]) => Answer | undefined) {
  return fakeClient((table, calls) => {
    const o = over?.(table, calls);
    if (o) return o;
    if (table === "blocks") return { data: [] };
    if (table === "messages") {
      if (has(calls, "in", "id")) return { data: [] };
      if (has(calls, "eq", "id")) return { data: [{ id: page[0].id, channel_id: CHANNEL, thread_root_id: null, removed_at: null }] };
      return { data: page.map((r) => ({ ...r })) };
    }
    // The database shows a non-member only their own reaction rows: none.
    if (table === "message_reactions") return { data: [] };
    if (table === "users") throw new Error("a follower's page must never read a voter");
    if (table === "orgs") return { data: [] }; // a private club: RLS hides its row from a follower
    if (table === "rpc:can_post_org_channel") return { data: false };
    throw new Error(`unexpected cookie read of ${table}`);
  });
}

function serviceAnswers(table: string, calls: Call[]): Answer {
  if (table === "org_members") {
    // The Board posters (follower-board.ts): the club's CURRENT owners and admins.
    const roles = arg(calls, "in", "role") as string[] | undefined;
    if (roles) return { data: Object.entries(ROLES).filter(([, r]) => roles.includes(r)).map(([id]) => ({ org_id: ORG, user_id: id })) };
    const one = arg(calls, "eq", "user_id") as string | undefined;
    const ids = one ? [one] : ((arg(calls, "in", "user_id") as string[]) ?? []);
    return { data: ids.filter((id) => ROLES[id]).map((id) => ({ user_id: id, role: ROLES[id] })) };
  }
  if (table === "messages") {
    // A follower's page (repair of review finding 1): with the service role,
    // top-level, live, by the club's current owners and admins only.
    assert.ok(calls.some((c) => c[0] === "is" && c[1] === "thread_root_id" && c[2] === null), "top-level only");
    assert.ok(calls.some((c) => c[0] === "is" && c[1] === "removed_at" && c[2] === null), "live only");
    assert.equal(arg(calls, "eq", "channel_id"), CHANNEL);
    const authors = (arg(calls, "in", "user_id") as string[]) ?? [];
    return { data: SERVICE_PAGE.filter((r) => authors.includes(r.user_id)).map((r) => ({ ...r })) };
  }
  if (table === "rpc:chat_reply_counts") return { data: [{ root: POST.id, n: 4 }] };
  if (table === "chat_polls") return { data: [{ message_id: POLL.id, mode: "signup", question: "Who brings snacks?", anonymous: false, multi: false, closes_at: null }] };
  if (table === "chat_poll_options") return { data: [{ id: OPT, poll_id: POLL.id, position: 0, label: "Me", capacity: 3 }] };
  if (table === "chat_poll_votes") return { data: [{ option_id: OPT, poll_id: POLL.id, user_id: MEMBER }, { option_id: OPT, poll_id: POLL.id, user_id: OFFICER }] };
  if (table === "chat_event_cards") return { data: [] };
  if (table === "events") return { data: [] };
  if (table === "message_reactions") return { data: [
    { message_id: POST.id, emoji: "🔥", user_id: MEMBER },
    { message_id: POST.id, emoji: "🔥", user_id: OFFICER },
  ] };
  if (table === "orgs") {
    assert.ok(calls.some((c) => c[0] === "is" && c[1] === "hidden_at" && c[2] === null), "the service fallback leaves a hidden club out");
    return { data: [{ id: ORG, handle: "sae", name: "SAE", logo_url: null, banner_url: null, verified: false }] };
  }
  throw new Error(`unexpected service read of ${table}`);
}

const known = (over: Partial<ReadKnown> = {}): ReadKnown => ({ viewerId: VIEWER, access: ACCESS, room: BOARD, blocked: new Set(), ...over });

test("a follower's Board page: standing follower, counts only on the sign-up, reactions counted by the service, no reply count", async () => {
  const service = installService(serviceAnswers);
  const cookie = cookieClient(PAGE);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.viewerStanding, "follower");
  assert.equal(read.viewerRole, null);
  const post = read.messages.find((m) => m.id === POST.id)!;
  const poll = read.messages.find((m) => m.id === POLL.id)!;
  assert.equal(post.reply_count, null, "a follower reads posts, not replies");
  assert.equal(post.author_role, null, "the post is the club's");
  assert.equal(post.users, null);
  assert.equal(post.user_id, "");
  assert.deepEqual(post.reactions.map((r) => [r.emoji, r.count, r.viewer_reacted]), [["🔥", 2, false]]);
  const card = poll.card as PollCard;
  assert.equal(card.type, "signup");
  assert.equal(card.options[0].count, 2);
  assert.deepEqual(card.options[0].voters, []);
  assert.equal(card.options[0].voters_more, 0);
  assert.equal(card.total_voters, 2);
  assert.equal(card.options[0].mine, false);
  assert.ok(service.log.some((l) => l.table === "message_reactions"), "reactions read with the service role");
  assert.deepEqual(read.messages.map((m) => m.id).sort(), [POST.id, POLL.id].sort(), "a plain member's legacy post never reaches a follower");
  assert.ok(!cookie.log.some((l) => l.table === "messages"), "no message row on the follower's own client: the database shows none");
  assert.ok(!JSON.stringify(read).includes(OFFICER) && !JSON.stringify(read).includes(MEMBER), "no member's id anywhere");
  // The viewer's own read is made first (a member's page waits for nothing new); the follower's counts replace it.
  // The viewer rode on the authors' roles read.
  const roleIds = service.log.filter((l) => l.table === "org_members").flatMap((l) => arg(l.calls, "in", "user_id") as string[]);
  assert.ok(roleIds.includes(VIEWER));
});

test("a follower's ?root= is 403 members_only; a member's page is unchanged (names, cookie reactions, reply counts)", async () => {
  installService(serviceAnswers);
  const root = await readChatMessages(cookieClient(PAGE).client as unknown as Client, CHANNEL, { root: POST.id, limit: 50 }, known());
  assert.deepEqual(root, { ok: false, status: 403, body: { ok: false, error: "Members only.", code: "members_only" } });

  ROLES[VIEWER] = "member";
  try {
    const service = installService(serviceAnswers);
    const cookie = cookieClient(PAGE, (table, calls) =>
      table === "users" ? { data: ((arg(calls, "in", "id") as string[]) ?? []).map((id) => person(id, "Named")) } : undefined);
    const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
    assert.ok(read.ok);
    assert.equal(read.viewerStanding, "member");
    assert.equal(read.messages.find((m) => m.id === POST.id)!.users?.id, OFFICER, "a member sees the author");
    assert.equal(read.messages.find((m) => m.id === POST.id)!.author_role, "owner");
    assert.equal(read.messages.find((m) => m.id === POST.id)!.reply_count, 4);
    assert.equal((read.messages.find((m) => m.id === POLL.id)!.card as PollCard).options[0].voters.length, 2, "a member sees who signed up");
    assert.ok(cookie.log.some((l) => l.table === "message_reactions"));
    assert.ok(!service.log.some((l) => l.table === "message_reactions"));
  } finally {
    delete ROLES[VIEWER];
  }
});

test("roles unreadable: 503, and no card hydrated on a guess", async () => {
  const service = installService((table, calls) => (table === "org_members" ? { error: { code: "57014", message: "canceling" } } : serviceAnswers(table, calls)));
  const read = await readChatMessages(cookieClient(PAGE).client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.deepEqual(read, { ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } });
  assert.ok(!service.log.some((l) => l.table === "chat_polls"));
});

test("followerInRoom: the Board only; readThreadRoom gives a follower the follower viewer and the club from the service", async () => {
  assert.deepEqual(followerInRoom(BOARD), { role: null, can_post: false, can_reply: false, can_moderate: false, standing: "follower" });
  assert.equal(followerInRoom(LOUNGE), null);
  assert.equal(viewerInRoom(BOARD, null, true), null);
  const service = installService((table, calls) => (table === "org_members" ? { data: [] } : serviceAnswers(table, calls)));
  const read = await readThreadRoom(cookieClient([]).client as unknown as Client, BOARD, VIEWER);
  assert.ok(read);
  assert.deepEqual(read.viewer, { role: null, can_post: false, can_reply: false, can_moderate: false, standing: "follower" });
  assert.equal(read.room.org.handle, "sae");
  assert.ok(service.log.some((l) => l.table === "orgs"));
  const lounge = await readThreadRoom(cookieClient([]).client as unknown as Client, LOUNGE, VIEWER);
  assert.equal(lounge, null, "no role outside the Board: 503");
  installService((table, calls) => (table === "org_members" ? { error: { code: "57014", message: "x" } } : serviceAnswers(table, calls)));
  assert.equal(await readThreadRoom(cookieClient([]).client as unknown as Client, BOARD, VIEWER), null, "a failed role read is not a follower");
});

test("describeRoom: a hidden club's row from the service is no club (null)", async () => {
  installService((table, calls) => (table === "orgs" ? { data: [] } : serviceAnswers(table, calls)));
  assert.equal(await describeRoom(cookieClient([]).client as unknown as Client, BOARD, VIEWER, new Set()), null);
});

const roomsApi = (await import(roomsModule)) as typeof import("./rooms");

test("filterRoomReaders: members only, in the order given; a follower the room lets read is never mentioned", async () => {
  const FOLLOWER = uuid(7, "a");
  const viewAsked: string[] = [];
  const service = installService((table, calls) => {
    if (table === "org_members") {
      assert.equal(arg(calls, "eq", "org_id"), ORG);
      const ids = (arg(calls, "in", "user_id") as string[]) ?? [];
      return { data: ids.filter((id) => id !== FOLLOWER).map((id) => ({ user_id: id, role: "member" })) };
    }
    if (table === "rpc:can_view_org_channel") {
      const { uid } = calls[0][1] as { uid: string };
      viewAsked.push(uid);
      return { data: true };
    }
    if (table === "channels") return { data: [{ org_id: ORG }] };
    throw new Error(`unexpected ${table}`);
  });
  assert.deepEqual(await roomsApi.filterRoomReaders(CHANNEL, [MEMBER, FOLLOWER, OFFICER, MEMBER], ORG), [MEMBER, OFFICER]);
  assert.deepEqual(viewAsked, [MEMBER, OFFICER], "the follower is not even asked about");
  assert.ok(!service.log.some((l) => l.table === "channels"), "the club given is not read again");
  assert.deepEqual(await roomsApi.filterRoomReaders(CHANNEL, [FOLLOWER, MEMBER]), [MEMBER], "no club given: read from the room");
  installService((table) => (table === "org_members" ? { error: { code: "XX000", message: "boom" } } : { data: [{ org_id: ORG }] }));
  assert.deepEqual(await roomsApi.filterRoomReaders(CHANNEL, [MEMBER], ORG), [], "a failed read mentions nobody");
});

test("clubRoleAnswer tells not-a-member from a failed read; clubRole folds a failure to null", async () => {
  installService(() => ({ data: [] }));
  assert.equal(await roomsApi.clubRoleAnswer(ORG, VIEWER), null);
  installService(() => ({ data: [{ role: "admin" }] }));
  assert.equal(await roomsApi.clubRoleAnswer(ORG, VIEWER), "admin");
  installService(() => ({ error: { code: "XX000", message: "boom2" } }));
  assert.equal(await roomsApi.clubRoleAnswer(ORG, VIEWER), "failed");
  assert.equal(await roomsApi.clubRole(ORG, VIEWER), null);
});

test("a follower whose service reaction read fails gets no reactions, never their own rows as the counts", async () => {
  installService((table, calls) => (table === "message_reactions" ? { error: { code: "XX000", message: "boom" } } : serviceAnswers(table, calls)));
  const cookie = cookieClient(PAGE, (table) => (table === "message_reactions" ? { data: [{ message_id: POST.id, emoji: "🔥", user_id: VIEWER }] } : undefined));
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok);
  assert.deepEqual(read.messages.find((m) => m.id === POST.id)!.reactions, []);
});

test("a follower's shared posts come from their own login: one the posts rules hide is null, and the service read embeds no post or user", async () => {
  const HIDDEN = uuid(7, "f"); // a draft, a removed post, or one by someone who blocked the follower
  const SHOWN = uuid(8, "f");
  const sharing = [
    row(4, OFFICER, { attachment_id: HIDDEN, attachment_kind: "post" }),
    row(5, OFFICER, { attachment_id: SHOWN, attachment_kind: "post" }),
  ];
  const service = installService((table, calls) => {
    if (table === "messages") {
      const select = String(calls.find((c) => c[0] === "select")?.[1] ?? "");
      assert.ok(!select.includes("posts!") && !select.includes("users!"), `no embed on the service read: ${select}`);
      // What a service read with the old embed would have carried: never sent.
      return { data: sharing.map((r) => ({ ...r, attachment: { id: r.attachment_id, type: "text", content: "secret", media_url: null, media_thumbnail_url: null, user_id: MEMBER, author: person(MEMBER, "Hidden") } })) };
    }
    return serviceAnswers(table, calls);
  });
  const postsAsked: string[][] = [];
  const cookie = cookieClient([], (table, calls) => {
    if (table !== "posts") return undefined;
    const ids = (arg(calls, "in", "id") as string[]) ?? [];
    postsAsked.push(ids);
    // RLS: only SHOWN is visible on the follower's login.
    return { data: ids.filter((id) => id === SHOWN).map((id) => ({ id, type: "text", content: "hello", media_url: null, media_thumbnail_url: null, user_id: OFFICER, author: person(OFFICER, "Officer") })) };
  });
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(postsAsked.flat().sort(), [HIDDEN, SHOWN].sort());
  assert.equal(read.messages.find((m) => m.id === sharing[0].id)!.attachment, null, "a post the follower can't see goes out as null");
  assert.equal(read.messages.find((m) => m.id === sharing[1].id)!.attachment?.content, "hello");
  assert.ok(!JSON.stringify(read).includes("secret"));
  assert.ok(service.log.some((l) => l.table === "messages"));

  // The posts read failing is a 503, never the service's copy.
  installService((table, calls) => (table === "messages" ? { data: sharing.map((r) => ({ ...r })) } : serviceAnswers(table, calls)));
  const failed = await readChatMessages(
    cookieClient([], (table) => (table === "posts" ? { error: { code: "XX000", message: "boom" } } : undefined)).client as unknown as Client,
    CHANNEL,
    { limit: 50 },
    known(),
  );
  assert.equal(failed.ok, false);
});

// ── Deleted posts (decision 8, Oct 19, 2026; B7 review findings 4 and 7) ────

test("a follower's Board leaves a deleted post out IN THE READ, so a full page stays full and Earlier stays reachable", async () => {
  // The Board as the database holds it: 50 live posts by the officer and one
  // the officer deleted, newest first; the service read honours `deleted_at is null`.
  const live = Array.from({ length: 50 }, (_, i) => row(100 + i, OFFICER, { created_at: at(i) }));
  const note = row(99, OFFICER, { content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null });
  const service = installService((table, calls) => {
    if (table !== "messages") return serviceAnswers(table, calls);
    const liveOnly = calls.some((c) => c[0] === "is" && c[1] === "deleted_at" && c[2] === null);
    const board = liveOnly ? live : [note, ...live];
    const limit = calls.find((c) => c[0] === "limit")?.[1] as number;
    return { data: board.slice(0, limit).map((r) => ({ ...r })) };
  });
  const cookie = cookieClient([]);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(read.messages.length, 50, "the page is full: use-room-poll keeps Earlier (hasEarlier = length >= 50)");
  assert.ok(!read.messages.some((m) => m.id === note.id));
  const page = service.log.find((l) => l.table === "messages")!;
  assert.ok(page.calls.some((c) => c[0] === "is" && c[1] === "deleted_at" && c[2] === null), "the read itself leaves deleted posts out");
  assert.ok(!cookie.log.some((l) => l.table === "messages"), "no deleted_at read on the follower's own client");
});

test("a follower never sees a deleted post's note, even when the read could not filter (no deleted_at yet, or a row of that shape)", async () => {
  const note = row(98, OFFICER, { content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null });
  const noColumn = { error: { code: "42703", message: "column messages.deleted_at does not exist" } };
  const service = installService((table, calls) => {
    if (table !== "messages") return serviceAnswers(table, calls);
    if (calls.some((c) => c[0] === "is" && c[1] === "deleted_at")) return noColumn;
    return { data: [note, POST, POLL].map((r) => ({ ...r })) };
  });
  const cookie = cookieClient([]);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(read.messages.map((m) => m.id).sort(), [POST.id, POLL.id].sort(), "nothing in its place for a follower");
  assert.ok(!JSON.stringify(read).includes("Post deleted") && !JSON.stringify(read).includes("Message deleted"));
  assert.equal(service.log.filter((l) => l.table === "messages").length, 2, "asked with the filter, then again without it");
  assert.ok(!cookie.log.some((l) => l.table === "messages" && has(l.calls, "in", "id")), "no deleted_at read for a follower");
});

// ── Members-only events on a follower's Board (Oct 22, 2026) ────────────────
// The Event card of a members-only event never reaches a follower, and the
// page stays full: it asks for `limit` + the number of such cards in the room
// and keeps the first `limit` after dropping them (a page cut short reads as
// the oldest one; review of Oct 19, 2026).
const EV_MEMBERS = uuid(20, "e");
const MEMBERS_CARD = row(6, OFFICER, { kind: "event_card", card_event_id: EV_MEMBERS });

function membersOnlyService(over?: { eventsError?: boolean; cardsError?: boolean }) {
  const asked: number[] = [];
  const service = installService((table, calls) => {
    if (table === "events" && arg(calls, "eq", "visibility") === "members") {
      assert.equal(arg(calls, "eq", "org_id"), ORG);
      return over?.eventsError ? { error: { code: "57014", message: "canceling" } } : { data: [{ id: EV_MEMBERS }] };
    }
    if (table === "messages" && has(calls, "in", "card_event_id")) {
      assert.equal(arg(calls, "eq", "channel_id"), CHANNEL);
      assert.deepEqual(arg(calls, "in", "card_event_id"), [EV_MEMBERS]);
      return over?.cardsError ? { error: { code: "57014", message: "canceling" } } : { data: [{ id: MEMBERS_CARD.id }] };
    }
    if (table === "messages") {
      // The page read, newest first, cut at the limit asked.
      const limit = calls.find((c) => c[0] === "limit")?.[1];
      asked.push(Number(limit));
      const newestFirst = [MEMBERS_CARD, POLL, POST].map((r) => ({ ...r }));
      return { data: newestFirst.slice(0, Number(limit)) };
    }
    return serviceAnswers(table, calls);
  });
  return { service, asked };
}

test("a follower's Board: a members-only event's card is left out, and a full page is still full", async () => {
  const { asked, service } = membersOnlyService();
  const read = await readChatMessages(cookieClient(PAGE).client as unknown as Client, CHANNEL, { limit: 2 }, known());
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(asked, [3], "limit + the one members-only card");
  assert.deepEqual(read.messages.map((m) => m.id), [POST.id, POLL.id], "two posts, oldest first; the card gone");
  assert.equal(JSON.stringify(read).includes(EV_MEMBERS), false, "the event is never named");
  assert.equal(service.log.some((l) => l.table === "chat_event_cards"), false, "its card is never hydrated");
});

test("a follower's Board: the members-only lookups failing is 503, never a page with the card on a guess", async () => {
  for (const over of [{ eventsError: true }, { cardsError: true }]) {
    membersOnlyService(over);
    const read = await readChatMessages(cookieClient(PAGE).client as unknown as Client, CHANNEL, { limit: 2 }, known());
    assert.deepEqual(read, { ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } }, JSON.stringify(over));
  }
});

test("a club with no members-only event: one small read, the page asked at its own limit", async () => {
  const asked: number[] = [];
  installService((table, calls) => {
    if (table === "events" && arg(calls, "eq", "visibility") === "members") return { data: [] };
    if (table === "messages") asked.push(Number(calls.find((c) => c[0] === "limit")?.[1]));
    return serviceAnswers(table, calls);
  });
  const read = await readChatMessages(cookieClient(PAGE).client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok);
  assert.deepEqual(asked, [50]);
});
