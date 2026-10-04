/**
 * Tests for the wave-2 parts of `message-read.ts`
 * (handoffs/chat-redesign/wave-2-contracts.md 8.3, 9.1, 9.2, 9.4) against
 * fakes of the two clients: the block set read once (or handed down), the
 * stubs of 8.1 and the Board exception, the quote of a blocked person
 * nulled, the cards hydrated into the page, `invalid_after`, the grouped
 * reply count with the wave-1 walk as its fallback (3.10), and the people
 * going with blocked ids left out.
 *
 * Run with:
 *   node --test src/lib/chat/message-read.test.ts
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

const specifier = "./message-read.ts";
const { describeRoom, readChatMessages, readThreadRoom, toChatMessages, viewerInRoom } = (await import(specifier)) as typeof import("./message-read");
// The same rooms.ts that message-read.ts loads ("./rooms"): one memory of a missing `post_policy` column.
const roomsModule = "./rooms.ts";
const { forgetPostPolicyColumnMissing, loadRoom, postPolicyColumnMissing } = (await import(roomsModule)) as typeof import("./rooms");
const stubModule = "./stub.ts";
const { asStub } = (await import(stubModule)) as typeof import("./stub");
const rulesModule = "./room-rules.ts";
const { OFFICER_REMOVED_REASON } = (await import(rulesModule)) as typeof import("./room-rules");
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

const uuid = (n: number, tail = "0") => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VIEWER = uuid(1, "a");
const OTHER = uuid(2, "a"); // in the viewer's block set
const FRIEND = uuid(3, "a");
const OFFICER = uuid(4, "a"); // blocked, and an owner of the club
const EX = uuid(5, "a"); // blocked, once an officer, a member now
const ORG = uuid(1, "d");
const CHANNEL = uuid(1, "c");
const LOUNGE: Room = { id: CHANNEL, kind: "lounge", name: "Lounge", org_id: ORG, event: null };
const BOARD: Room = { id: CHANNEL, kind: "board", name: "Board", org_id: ORG, event: null };
const ACCESS = { ok: true as const, isOrgChannel: true as const, orgId: ORG, accepted_at: null, cleared_at: null, kind: "lounge" as const };
const DM_ACCESS = { ok: true as const, isOrgChannel: false as const, orgId: null, accepted_at: "2026-01-01T00:00:00+00:00", cleared_at: null };
const ROLES: Record<string, string> = { [VIEWER]: "member", [OTHER]: "member", [FRIEND]: "mod", [OFFICER]: "owner", [EX]: "member" };

const person = (id: string, name: string) => ({ id, handle: name.toLowerCase(), name, avatar_url: null });
const at = (n: number) => `2026-10-08T20:${String(n).padStart(2, "0")}:00+00:00`;
function row(n: number, user: string, over: Partial<MessageRow> = {}): MessageRow {
  return { id: uuid(n, "b"), content: `m${n}`, created_at: at(n), user_id: user, users: person(user, `U${user.slice(-1)}`), kind: "text", thread_root_id: null, ...over };
}
const R1 = row(1, VIEWER);
const R2 = row(2, OTHER);
const R3 = row(3, FRIEND, { parent_message_id: R2.id });
const R4 = row(4, FRIEND, { parent_message_id: R1.id });
const R5 = row(5, OTHER, { kind: "poll" });
const R6 = row(6, FRIEND, { kind: "poll" });
const PAGE = [R1, R2, R3, R4, R5, R6];
const OPT = uuid(1, "e");

/** The viewer's client: the blocks, the page, the quoted parents, the reactions and the people. */
function cookieClient(page: MessageRow[], over?: (table: string, calls: Call[]) => Answer | undefined) {
  return fakeClient((table, calls) => {
    const o = over?.(table, calls);
    if (o) return o;
    if (table === "blocks") return { data: [{ blocker_id: VIEWER, blocked_id: OTHER }, { blocker_id: OFFICER, blocked_id: VIEWER }, { blocker_id: EX, blocked_id: VIEWER }] };
    if (table === "messages") {
      if (has(calls, "in", "id")) {
        const ids = arg(calls, "in", "id") as string[];
        return { data: page.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, content: r.content, user_id: r.user_id, media_kind: null, attachment_kind: null, author: r.users })) };
      }
      // The page read: newest first when the read asked so (the read reverses it), as the database would.
      const desc = calls.some((c) => c[0] === "order" && (c[2] as { ascending?: boolean } | undefined)?.ascending === false);
      const rows = page.map((r) => ({ ...r }));
      return { data: desc ? rows.reverse() : rows };
    }
    if (table === "message_reactions") return { data: [] };
    if (table === "users") return { data: ((arg(calls, "in", "id") as string[]) ?? []).map((id) => person(id, `U${id.slice(-1)}`)) };
    if (table === "orgs") return { data: [{ id: ORG, handle: "salsa", name: "Salsa Club", logo_url: null, banner_url: null, verified: true }] };
    if (table === "rpc:can_post_org_channel") return { data: true };
    throw new Error(`unexpected cookie read of ${table}`);
  });
}

/** The service: the roles, the reply counts, one poll's side tables. */
function serviceAnswers(table: string, calls: Call[]): Answer {
  if (table === "org_members") return { data: ((arg(calls, "in", "user_id") as string[]) ?? []).map((id) => ({ user_id: id, role: ROLES[id] ?? "member" })) };
  if (table === "rpc:chat_reply_counts") return { data: [] };
  if (table === "chat_polls") return { data: ((arg(calls, "in", "message_id") as string[]) ?? []).map((id) => ({ message_id: id, mode: "poll", question: "Q?", anonymous: false, multi: false, closes_at: null })) };
  if (table === "chat_poll_options") return { data: ((arg(calls, "in", "poll_id") as string[]) ?? []).map((id, i) => ({ id: `${OPT.slice(0, -1)}${i}`, poll_id: id, position: 0, label: "A", capacity: null })) };
  if (table === "chat_poll_votes") return { data: [] };
  if (table === "chat_event_cards") return { data: [] };
  if (table === "events") return { data: [] };
  throw new Error(`unexpected service read of ${table}`);
}

const known = (over: Partial<ReadKnown> = {}): ReadKnown => ({ viewerId: VIEWER, access: ACCESS, room: LOUNGE, ...over });

// ── 9.2 ─────────────────────────────────────────────────────────────────────

test("?after= that is not a timestamp: 400 invalid_after with the sentence, nothing read", async () => {
  installService(serviceAnswers);
  const cookie = cookieClient(PAGE);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { after: "yesterday", limit: 50 }, known());
  assert.deepEqual(read, { ok: false, status: 400, body: { ok: false, error: "Reload to catch up.", code: "invalid_after" } });
  assert.equal(cookie.log.length, 0);
});

// ── 9.1, 8.3 ────────────────────────────────────────────────────────────────

test("a club room page: the block set read once when no caller passed it; stubs, quotes and cards by the rules", async () => {
  const service = installService(serviceAnswers);
  const cookie = cookieClient(PAGE);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok);
  assert.equal(cookie.log.filter((l) => l.table === "blocks").length, 1, "one blocks read for the request");
  assert.equal(read.viewerRole, "member");
  const [m1, m2, m3, m4, m5, m6] = read.messages;
  assert.equal(m1.hidden, false);
  assert.equal(m1.user_id, VIEWER);
  // The blocked person's text: the exact stub of 8.1.
  assert.deepEqual(m2, asStub(R2));
  assert.deepEqual(m2, {
    id: R2.id, created_at: R2.created_at, thread_root_id: null, kind: "text", hidden: true, content: "", user_id: "",
    users: null, card: null, reactions: [], attachment: null, attachment_id: null, attachment_kind: null, media_url: null,
    media_kind: null, parent_message_id: null, parent_preview: null, reply_count: null, author_role: null, removed: null,
  });
  // A quote of the blocked person is nulled; the id stays as sent. A quote of anyone else stays.
  assert.equal(m3.parent_message_id, R2.id);
  assert.equal(m3.parent_preview, null);
  assert.equal(m4.parent_message_id, R1.id);
  assert.equal(m4.parent_preview?.user_id, VIEWER);
  // The blocked person's poll is a stub with kind "text" and no card; the friend's poll carries its card.
  assert.equal(m5.hidden, true);
  assert.equal(m5.kind, "text");
  assert.equal(m5.card, null);
  assert.equal(m6.hidden, false);
  assert.equal(m6.kind, "poll");
  assert.equal((m6.card as PollCard).type, "poll");
  assert.equal((m6.card as PollCard).question, "Q?");
  // The cards were read for the page's card rows (the stubbed one included: the rows are viewer-scoped).
  assert.deepEqual((arg(service.log.find((l) => l.table === "chat_polls")!.calls, "in", "message_id") as string[]).sort(), [R5.id, R6.id]);
});

test("the viewer's own removed poll: removed set, card null, never given to hydrateCards (5.2, 6.2)", async () => {
  const service = installService(serviceAnswers);
  const removed = row(7, VIEWER, { kind: "poll", removed_at: at(30), removed_reason: OFFICER_REMOVED_REASON });
  const read = await readChatMessages(cookieClient([R1, removed, R6]).client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok);
  const mine = read.messages[1];
  assert.equal(mine.id, removed.id);
  assert.equal(mine.kind, "poll");
  assert.deepEqual(mine.removed, { by: "officer", at: at(30), reason: null });
  assert.equal(mine.card, null);
  assert.equal(mine.hidden, false);
  assert.equal((read.messages[2].card as PollCard).type, "poll", "the live poll beside it carries its card");
  assert.deepEqual(arg(service.log.find((l) => l.table === "chat_polls")!.calls, "in", "message_id"), [R6.id], "the removed row is not asked for");
});

test("a block set handed down is used and never read again", async () => {
  installService(serviceAnswers);
  const cookie = cookieClient(PAGE);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known({ blocked: new Set([FRIEND]) }));
  assert.ok(read.ok);
  assert.equal(cookie.log.filter((l) => l.table === "blocks").length, 0);
  assert.equal(read.messages[1].hidden, false, "OTHER is not in the set given");
  assert.equal(read.messages[2].hidden, true, "FRIEND is");
});

test("a dm or a group: nothing hidden, no blocks read, no cards read, a set handed down ignored (8.5)", async () => {
  const service = installService(serviceAnswers);
  const cookie = cookieClient([R1, R2, R3]);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, { viewerId: VIEWER, access: DM_ACCESS, room: null, blocked: new Set([OTHER]) });
  assert.ok(read.ok);
  assert.equal(cookie.log.filter((l) => l.table === "blocks").length, 0);
  assert.ok(read.messages.every((m) => m.hidden === false));
  assert.equal(read.messages[2].parent_preview?.user_id, OTHER, "the quote of a blocked member stays in a group");
  assert.equal(service.log.length, 0, "no roles, no cards for a dm");
});

test("a failed blocks read: the page answers 503 try_again; the send's answer keeps the row, hides nothing, quotes nothing", async () => {
  installService(serviceAnswers);
  const failing = (table: string) => (table === "blocks" ? { error: { code: "57014", message: "canceling statement" } } : undefined);
  const cookie = cookieClient(PAGE, failing);
  const read = await readChatMessages(cookie.client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.deepEqual(read, { ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } });
  const sent = await toChatMessages(cookieClient(PAGE, failing).client as unknown as Client, [R4], { channelId: CHANNEL, viewerId: FRIEND, room: LOUNGE, skipReplyCounts: true, skipReactions: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].hidden, false);
  assert.equal(sent[0].parent_message_id, R1.id);
  assert.equal(sent[0].parent_preview, null);
});

test("the Board exception: a current officer's top-level post shows; their reply and a demoted officer's post are stubs", async () => {
  installService(serviceAnswers);
  const post = row(10, OFFICER);
  const reply = row(11, OFFICER, { thread_root_id: post.id });
  const old = row(12, EX);
  const quoteOfOfficer = row(13, FRIEND, { parent_message_id: post.id });
  const rows = [post, reply, old, quoteOfOfficer];
  const cookie = cookieClient(rows);
  const messages = await toChatMessages(cookie.client as unknown as Client, rows, { channelId: CHANNEL, viewerId: VIEWER, room: BOARD, blocked: new Set([OFFICER, EX]) });
  assert.equal(messages[0].hidden, false, "the officer's post");
  assert.equal(messages[0].author_role, "owner");
  assert.equal(messages[0].reply_count, 0);
  assert.deepEqual(messages[1], asStub(reply));
  assert.equal(messages[1].thread_root_id, post.id, "a reply stub keeps its root");
  assert.deepEqual(messages[2], asStub(old));
  assert.equal(messages[3].parent_preview, null, "no Board exception for a quote");
});

// ── 9.4 ─────────────────────────────────────────────────────────────────────

const posts = Array.from({ length: 150 }, (_, i) => row(100 + i, FRIEND));
const boardKnown = (): ReadKnown => ({ viewerId: VIEWER, access: { ...ACCESS, kind: "board" }, room: BOARD, blocked: new Set() });

test("reply counts come from chat_reply_counts per chunk of 100; a root with no row is 0", async () => {
  const service = installService((table, calls) => {
    if (table === "rpc:chat_reply_counts") {
      const args = calls[0][1] as { p_channel: string; p_roots: string[]; p_viewer: string };
      assert.equal(args.p_channel, CHANNEL);
      assert.equal(args.p_viewer, VIEWER);
      return { data: args.p_roots.includes(posts[0].id) ? [{ root: posts[0].id, n: 3 }, { root: posts[1].id, n: 1 }] : [{ root: posts[149].id, n: 7 }] };
    }
    return serviceAnswers(table, calls);
  });
  const read = await readChatMessages(cookieClient(posts).client as unknown as Client, CHANNEL, { limit: 200 }, boardKnown());
  assert.ok(read.ok);
  const rpcs = service.log.filter((l) => l.table === "rpc:chat_reply_counts");
  assert.deepEqual(rpcs.map((l) => (l.calls[0][1] as { p_roots: string[] }).p_roots.length), [100, 50]);
  assert.equal(read.messages[0].reply_count, 3);
  assert.equal(read.messages[1].reply_count, 1);
  assert.equal(read.messages[2].reply_count, 0);
  assert.equal(read.messages[149].reply_count, 7);
  assert.ok(!service.log.some((l) => l.table === "messages"), "no walk when the function answers");
});

for (const code of ["PGRST202", "42883"]) {
  test(`a database without chat_reply_counts (${code}) walks messages as wave 1 did (3.10)`, async () => {
    const service = installService((table, calls) => {
      if (table === "rpc:chat_reply_counts") return { error: { code, message: "function missing" } };
      if (table === "messages") {
        const roots = arg(calls, "in", "thread_root_id") as string[];
        assert.equal(arg(calls, "eq", "channel_id"), CHANNEL);
        assert.equal(arg(calls, "or", `removed_at.is.null,user_id.eq.${VIEWER}`), undefined, "or() takes one argument");
        assert.ok(calls.some((c) => c[0] === "or" && c[1] === `removed_at.is.null,user_id.eq.${VIEWER}`));
        const rows = roots.includes(posts[0].id)
          ? [{ thread_root_id: posts[0].id }, { thread_root_id: posts[0].id }, { thread_root_id: posts[3].id }]
          : [];
        return { data: rows, count: rows.length };
      }
      return serviceAnswers(table, calls);
    });
    const read = await readChatMessages(cookieClient(posts).client as unknown as Client, CHANNEL, { limit: 200 }, boardKnown());
    assert.ok(read.ok);
    assert.equal(read.messages[0].reply_count, 2);
    assert.equal(read.messages[3].reply_count, 1);
    assert.equal(read.messages[1].reply_count, 0);
    assert.equal(service.log.filter((l) => l.table === "messages").length, 2, "one walk read per chunk");
  });
}

test("any other error of chat_reply_counts: null, and the caller answers as it does today (reply_count null, no 503; see B2-notes STOPPED)", async () => {
  installService((table, calls) => (table === "rpc:chat_reply_counts" ? { error: { code: "57014", message: "canceling statement" } } : serviceAnswers(table, calls)));
  const read = await readChatMessages(cookieClient(posts.slice(0, 2)).client as unknown as Client, CHANNEL, { limit: 50 }, boardKnown());
  assert.ok(read.ok);
  assert.deepEqual(read.messages.map((m) => m.reply_count), [null, null]);
});

// ── 5.2 in the page ─────────────────────────────────────────────────────────

test("a failed hydrateCards answers 503; a database without migration B answers the page with card null", async () => {
  installService((table, calls) => (table === "chat_polls" ? { error: { code: "57014", message: "canceling statement" } } : serviceAnswers(table, calls)));
  const failed = await readChatMessages(cookieClient([R6]).client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.deepEqual(failed, { ok: false, status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } });

  installService((table, calls) => (table === "chat_polls" ? { error: { code: "42P01", message: "relation does not exist" } } : serviceAnswers(table, calls)));
  const read = await readChatMessages(cookieClient([R6]).client as unknown as Client, CHANNEL, { limit: 50 }, known());
  assert.ok(read.ok);
  assert.equal(read.messages[0].kind, "poll");
  assert.equal(read.messages[0].card, null);
});

// ── 8.3: the people going ───────────────────────────────────────────────────

test("describeRoom hands the block set down: a blocked person going is left out and the next room member takes their place", async () => {
  const EVENT = uuid(1, "f");
  const going = Array.from({ length: 10 }, (_, i) => uuid(200 + i, "a"));
  const eventRoom: Room = { id: CHANNEL, kind: "event", name: "Fall Formal", org_id: ORG, event: { id: EVENT, title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", ends_at: "2026-10-09T03:00:00+00:00" } };
  const service = installService((table, calls) => {
    if (table === "events") return { data: [{ location: "Alumni Hall" }] };
    if (table === "rsvps") return { data: going.map((id) => ({ user_id: id, status: "going" })), count: 10 };
    if (table === "channel_members") return { data: ((arg(calls, "in", "user_id") as string[]) ?? []).map((id) => ({ user_id: id })) };
    return serviceAnswers(table, calls);
  });
  const cookie = cookieClient([]);
  const described = await describeRoom(cookie.client as unknown as Client, eventRoom, VIEWER, new Set([going[1]]));
  assert.ok(described);
  const event = described.room.event!;
  assert.equal(event.going_count, 10, "counts never change");
  assert.deepEqual(event.going.map((p) => p.id), [going[0], ...going.slice(2, 9)], "the first 8 visible");
  assert.equal(event.location, "Alumni Hall");
  assert.equal(event.state, "soon");
  assert.equal(described.mayPost, true);
  assert.deepEqual(described.room.org.handle, "salsa");
  // The people were asked on the viewer's client for the candidates only (never the blocked id).
  const asked = cookie.log.filter((l) => l.table === "users").flatMap((l) => arg(l.calls, "in", "id") as string[]);
  assert.ok(!asked.includes(going[1]));
  assert.ok(service.log.some((l) => l.table === "channel_members"));
});

// ── Wave 3: who can post in an extra room (wave-3-desktop/contract.md 4c.3) ──

const OFFICERS_LINE = "Only officers post here.";
const LISTED_LINE = "Only officers and people they picked post here.";
const extraRoom = (post_policy?: Room["post_policy"]): Room => ({ id: CHANNEL, kind: "room", name: "exec-only", org_id: ORG, event: null, ...(post_policy ? { post_policy } : {}) });

test("viewerInRoom: post_line only for an extra room whose rule the viewer fails; the key is absent everywhere else", () => {
  assert.equal(viewerInRoom(LOUNGE, null, true), null, "no role: the route answers 503");
  // Every room of before the column: the four keys, as they were.
  assert.deepEqual(viewerInRoom(LOUNGE, "member", true), { role: "member", can_post: true, can_reply: false, can_moderate: false });
  assert.deepEqual(viewerInRoom(BOARD, "member", false), { role: "member", can_post: false, can_reply: true, can_moderate: false });
  assert.deepEqual(viewerInRoom(BOARD, "owner", true), { role: "owner", can_post: true, can_reply: true, can_moderate: true });
  const closedEvent: Room = { id: CHANNEL, kind: "event", name: "Formal", org_id: ORG, event: { id: uuid(1, "f"), title: "Formal", starts_at: at(1), ends_at: at(2) } };
  assert.deepEqual(viewerInRoom(closedEvent, "member", false), { role: "member", can_post: false, can_reply: false, can_moderate: false });
  // An extra room the viewer cannot post in, but not by a rule: a Room written by hand (no post_policy), and `everyone`.
  assert.deepEqual(viewerInRoom(extraRoom(), "member", false), { role: "member", can_post: false, can_reply: false, can_moderate: false });
  assert.deepEqual(viewerInRoom(extraRoom("everyone"), "member", false), { role: "member", can_post: false, can_reply: false, can_moderate: false });
  // The rule keeps the viewer out: the sentence.
  assert.deepEqual(viewerInRoom(extraRoom("officers"), "member", false), { role: "member", can_post: false, can_reply: false, can_moderate: false, post_line: OFFICERS_LINE });
  assert.deepEqual(viewerInRoom(extraRoom("officers"), "mod", false), { role: "mod", can_post: false, can_reply: false, can_moderate: true, post_line: OFFICERS_LINE });
  assert.deepEqual(viewerInRoom(extraRoom("listed"), "member", false), { role: "member", can_post: false, can_reply: false, can_moderate: false, post_line: LISTED_LINE });
  // The rule lets the viewer in (an officer, or someone on the list): no line.
  for (const viewer of [viewerInRoom(extraRoom("officers"), "admin", true), viewerInRoom(extraRoom("listed"), "member", true), viewerInRoom(extraRoom("listed"), "owner", true)]) {
    assert.ok(viewer);
    assert.equal("post_line" in viewer, false);
    assert.equal(viewer.can_post, true);
  }
  // Only `room` carries a rule: a value on another kind (the database refuses it) is never printed.
  assert.equal("post_line" in viewerInRoom({ ...LOUNGE, post_policy: "officers" }, "member", false)!, false);
  assert.equal("post_line" in viewerInRoom({ ...BOARD, post_policy: "listed" }, "member", false)!, false);
});

test("readThreadRoom: the database's no in an `officers` room reaches the viewer as can_post false with the sentence", async () => {
  installService((table, calls) => (table === "org_members" ? { data: [{ role: "member" }] } : serviceAnswers(table, calls)));
  const refused = (table: string) => (table === "rpc:can_post_org_channel" ? { data: false } : undefined);
  const read = await readThreadRoom(cookieClient([], refused).client as unknown as Client, extraRoom("officers"), VIEWER);
  assert.ok(read);
  assert.deepEqual(read.viewer, { role: "member", can_post: false, can_reply: false, can_moderate: false, post_line: OFFICERS_LINE });
  assert.equal(read.room.kind, "room");
  const allowed = await readThreadRoom(cookieClient([]).client as unknown as Client, extraRoom("officers"), VIEWER);
  assert.ok(allowed);
  assert.deepEqual(allowed.viewer, { role: "member", can_post: true, can_reply: false, can_moderate: false });
});

// ── Wave 3: loadRoom and a database without `channels.post_policy` (4.2, 4c.3) ──

const ROOM_SELECT = "id, kind, name, org_id, event_id, post_policy";
const ROOM_SELECT_BEFORE = "id, kind, name, org_id, event_id";
const selectsOf = (log: Logged[]) => log.filter((l) => l.table === "channels").map((l) => String(l.calls.find((c) => c[0] === "select")?.[1]));
const channelRow = (over: Record<string, unknown> = {}) => ({ id: CHANNEL, kind: "room", name: "exec-only", org_id: ORG, event_id: null, ...over });

test("loadRoom: the select names post_policy and the room always carries one (`everyone` for anything else the column holds)", async () => {
  forgetPostPolicyColumnMissing();
  for (const [stored, expected] of [["officers", "officers"], ["listed", "listed"], ["everyone", "everyone"], ["mods", "everyone"], [null, "everyone"]] as const) {
    const service = installService((table) => (table === "channels" ? { data: [channelRow({ post_policy: stored })] } : {}));
    assert.deepEqual(await loadRoom(CHANNEL), { id: CHANNEL, kind: "room", name: "exec-only", org_id: ORG, event: null, post_policy: expected });
    assert.deepEqual(selectsOf(service.log), [ROOM_SELECT]);
    assert.equal(arg(service.log[0].calls, "eq", "id"), CHANNEL);
  }
  installService((table) => (table === "channels" ? { data: [channelRow({ kind: "lounge", name: "Lounge", post_policy: "everyone" })] } : {}));
  assert.deepEqual(await loadRoom(CHANNEL), { ...LOUNGE, post_policy: "everyone" });
  assert.equal(postPolicyColumnMissing(), false);
});

test("loadRoom: a missing post_policy column is never \"the read failed\" — one retry with today's select, then remembered", async () => {
  forgetPostPolicyColumnMissing();
  const missing = { code: "42703", message: "column channels.post_policy does not exist" };
  const withoutColumn = (table: string, calls: Call[]): Answer => {
    if (table !== "channels") return {};
    return String(calls.find((c) => c[0] === "select")?.[1]).includes("post_policy") ? { error: missing } : { data: [channelRow()] };
  };
  const service = installService(withoutColumn);
  const expected = { id: CHANNEL, kind: "room", name: "exec-only", org_id: ORG, event: null, post_policy: "everyone" };
  assert.deepEqual(await loadRoom(CHANNEL), expected, "a room, not null (null here is 503 on every club room)");
  assert.deepEqual(selectsOf(service.log), [ROOM_SELECT, ROOM_SELECT_BEFORE]);
  assert.equal(postPolicyColumnMissing(), true);
  // The next read goes straight to today's select: one read, not two.
  assert.deepEqual(await loadRoom(CHANNEL), expected);
  assert.deepEqual(selectsOf(service.log), [ROOM_SELECT, ROOM_SELECT_BEFORE, ROOM_SELECT_BEFORE]);
  // Five minutes on (or a new instance) it asks for the column again.
  forgetPostPolicyColumnMissing();
  assert.deepEqual(await loadRoom(CHANNEL), expected);
  assert.deepEqual(selectsOf(service.log).slice(3), [ROOM_SELECT, ROOM_SELECT_BEFORE]);
});

test("loadRoom: a database without channels.kind fails both selects (null, as today); any other failure is not asked again", async () => {
  forgetPostPolicyColumnMissing();
  const noKind = installService(() => ({ error: { code: "42703", message: "column channels.kind does not exist" } }));
  assert.equal(await loadRoom(CHANNEL), null);
  assert.deepEqual(selectsOf(noKind.log), [ROOM_SELECT, ROOM_SELECT_BEFORE]);
  forgetPostPolicyColumnMissing();
  const broken = installService(() => ({ error: { code: "57014", message: "canceling statement" } }));
  assert.equal(await loadRoom(CHANNEL), null);
  assert.deepEqual(selectsOf(broken.log), [ROOM_SELECT]);
  assert.equal(postPolicyColumnMissing(), false, "a failure that is not a missing schema is not remembered as one");
  // A dm (no club, no kind) is still not a room.
  const dm = installService(() => ({ data: [{ id: CHANNEL, kind: null, name: null, org_id: null, event_id: null, post_policy: "everyone" }] }));
  assert.equal(await loadRoom(CHANNEL), null);
  assert.deepEqual(selectsOf(dm.log), [ROOM_SELECT]);
  forgetPostPolicyColumnMissing();
});
