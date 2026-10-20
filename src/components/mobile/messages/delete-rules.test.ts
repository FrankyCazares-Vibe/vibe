/**
 * Deleting your own message (Oct 19, 2026; batch B7, decisions 8 and 9):
 * who sees Delete, what the confirm says, what a list does with the answer,
 * and the "Message deleted" note's shape (src/lib/chat/deleted-note.ts).
 *
 * Run with:
 *   node --test src/components/mobile/messages/delete-rules.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

// delete-rules.ts imports "@/lib/chat/deleted-note": the home-rules.test.ts hook.
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("delete-rules.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

type ChatMessage = import("@/lib/chat/types").ChatMessage;

const rulesSpecifier = "./delete-rules.ts";
const noteSpecifier = "@/lib/chat/deleted-note";
const rules = (await import(rulesSpecifier)) as typeof import("./delete-rules");
const note = (await import(noteSpecifier)) as typeof import("@/lib/chat/deleted-note");
const { canDeleteOwn, canDeleteBoardPost, deleteConfirmCopy, leftNote, asDeletedRow, listAfterDelete, DELETE_LABEL } = rules;
const { asDeletedNote, asDeletedQuote, hasDeletedShape, withDeletedQuotes, DELETED_LINE, DELETED_POST_LINE } = note;

const ME = "11111111-0000-4000-8000-000000000001";
const OTHER = "22222222-0000-4000-8000-000000000002";
const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: ID,
  content: "see you at 7",
  created_at: "2026-10-19T17:00:00.000Z",
  user_id: ME,
  attachment_id: null,
  attachment_kind: null,
  media_url: null,
  media_kind: null,
  parent_message_id: null,
  users: { id: ME, handle: "avery", name: "Avery", avatar_url: null },
  attachment: null,
  parent_preview: null,
  reactions: [],
  kind: "text",
  thread_root_id: null,
  card: null,
  reply_count: null,
  author_role: null,
  hidden: false,
  removed: null,
  ...over,
});

// ── who sees Delete ─────────────────────────────────────────────────────────

test("canDeleteOwn: the viewer's own message, poll or event card, and a Board reply", () => {
  assert.equal(canDeleteOwn(message(), ME), true);
  assert.equal(canDeleteOwn(message({ kind: "poll" }), ME), true);
  assert.equal(canDeleteOwn(message({ kind: "event_card" }), ME), true);
  assert.equal(canDeleteOwn(message({ thread_root_id: "bbbbbbbb-0000-4000-8000-000000000001" }), ME), true);
});

test("canDeleteOwn: never someone else's message (an officer included: Remove stays theirs)", () => {
  assert.equal(canDeleteOwn(message({ user_id: OTHER }), ME), false);
  // A follower's page shows posts as the club's: user_id "" matches nobody.
  assert.equal(canDeleteOwn(message({ user_id: "" }), ""), false);
  assert.equal(canDeleteOwn(message({ user_id: "" }), ME), false);
});

test("canDeleteOwn: never before the viewer is known, on a row still sending, a note, a stub or a removed message", () => {
  assert.equal(canDeleteOwn(message(), null), false);
  assert.equal(canDeleteOwn(message(), undefined), false);
  assert.equal(canDeleteOwn(message({ id: "temp_123" }), ME), false);
  assert.equal(canDeleteOwn(message({ deleted: true }), ME), false);
  assert.equal(canDeleteOwn(message({ hidden: true }), ME), false);
  assert.equal(canDeleteOwn(message({ removed: { by: "officer", at: "2026-10-19T17:05:00.000Z", reason: null } }), ME), false);
});

test("canDeleteBoardPost: the viewer's own top-level post only", () => {
  assert.equal(canDeleteBoardPost(message({ author_role: "admin" }), ME), true);
  // A former officer keeps Delete on what they wrote (the server allows the sender always).
  assert.equal(canDeleteBoardPost(message({ author_role: "member" }), ME), true);
  assert.equal(canDeleteBoardPost(message({ user_id: OTHER, author_role: "owner" }), ME), false);
  assert.equal(canDeleteBoardPost(message({ thread_root_id: "bbbbbbbb-0000-4000-8000-000000000001" }), ME), false);
  assert.equal(canDeleteBoardPost(message({ deleted: true }), ME), false);
});

// ── the confirm ─────────────────────────────────────────────────────────────

test("deleteConfirmCopy: a message says the note stays and that notifications already sent may still show it", () => {
  const c = deleteConfirmCopy();
  assert.equal(c.title, "Delete for everyone?");
  assert.equal(c.confirm, "Delete");
  assert.equal(c.confirm, DELETE_LABEL);
  assert.match(c.body, /removed from this chat for everyone/);
  assert.match(c.body, /"Message deleted" note stays in its place/);
  assert.match(c.body, /already got a notification may still see it there\.$/);
  assert.doesNotMatch(c.body, /[Uu]nsend/);
});

test("deleteConfirmCopy: a Board post says its replies stay, with the count", () => {
  assert.match(deleteConfirmCopy({ boardPost: true, replies: 0 }).body, /"Post deleted" note stays in its place\. Anyone/);
  assert.match(deleteConfirmCopy({ boardPost: true, replies: 1 }).body, /Its 1 reply stays\./);
  assert.match(deleteConfirmCopy({ boardPost: true, replies: 3 }).body, /Its 3 replies stay\./);
  assert.match(deleteConfirmCopy({ boardPost: true, replies: null }).body, /note stays in its place\. Anyone/);
  assert.match(deleteConfirmCopy({ boardPost: true }).body, /removed from the Board for everyone/);
});

// ── what the list does with the answer ──────────────────────────────────────

test("leftNote: only an answer that says deleted: true left a note", () => {
  assert.equal(leftNote({ ok: true, deleted: true }), true);
  assert.equal(leftNote({ ok: true, deleted: true, already: true }), true);
  assert.equal(leftNote({ ok: true }), false);
  assert.equal(leftNote(null), false);
  assert.equal(leftNote(undefined), false);
});

test("listAfterDelete: the row turns into the note, or goes when the server took it away whole", () => {
  type Row = { id: string; content: string; user_id: string; created_at: string; media_url?: string | null; media_kind?: string | null; reactions?: unknown[]; deleted?: boolean };
  const rows: Row[] = [
    { id: "a", content: "hi", user_id: ME, created_at: "1", media_url: "/m/a", media_kind: "image", reactions: [{ emoji: "❤️", count: 2, viewer_reacted: true }] },
    { id: "b", content: "yo", user_id: OTHER, created_at: "2" },
  ];
  const noted = listAfterDelete(rows, "a", { ok: true, deleted: true });
  assert.equal(noted.length, 2);
  // Field by field (the B7 review: comparing with asDeletedRow's own output proved nothing).
  assert.equal(noted[0].id, "a");
  assert.equal(noted[0].media_kind, null);
  assert.equal(noted[0].deleted, true);
  assert.equal(noted[0].content, "");
  assert.equal(noted[0].media_url, null);
  assert.deepEqual(noted[0].reactions, []);
  assert.equal(noted[0].user_id, ME, "who sent it stays");
  assert.equal(noted[0].created_at, "1", "when stays");
  assert.equal(noted[1], rows[1], "the other row is the same object");
  assert.deepEqual(listAfterDelete(rows, "a", { ok: true }).map((r) => r.id), ["b"]);
  assert.equal(listAfterDelete(rows, "zzz", { ok: true, deleted: true }), rows, "a row not in the list: the same array");
});

test("asDeletedRow: every written or shared field is emptied, explicitly", () => {
  const row = {
    id: "a", user_id: ME, created_at: "1", content: "see you", media_url: "/m/a", media_kind: "image", attachment_id: "p1", attachment_kind: "post",
    attachment: { id: "p1" }, parent_message_id: "q", parent_preview: { id: "q", content: "earlier", media_kind: null, attachment_kind: null },
    reactions: [{ emoji: "🔥", count: 1, viewer_reacted: false }], removed: null, deleted: false,
  };
  const n = asDeletedRow(row);
  assert.deepEqual(
    [n.content, n.media_url, n.media_kind, n.attachment_id, n.attachment_kind, n.attachment, n.parent_message_id, n.parent_preview, n.reactions, n.removed, n.deleted],
    ["", null, null, null, null, null, null, null, [], null, true],
  );
  assert.deepEqual([n.id, n.user_id, n.created_at], ["a", ME, "1"], "who and when stay");
  assert.equal(row.content, "see you", "the input is not changed");
});

test("listAfterDelete: a reply that quoted it quotes the note, so the words leave every quote at once (B7 review, Oct 19, 2026)", () => {
  type Quote = { id: string; content: string | null; user_id: string; author: null; media_kind?: "image" | "video" | null; attachment_kind?: "post" | "clip" | null; deleted?: boolean };
  type Row = { id: string; content: string; user_id: string; created_at: string; parent_message_id?: string | null; parent_preview?: Quote | null; deleted?: boolean };
  const quote = (id: string, content: string): Quote => ({ id, content, user_id: OTHER, author: null, media_kind: "image", attachment_kind: null });
  const rows: Row[] = [
    { id: "a", content: "dinner at 7?", user_id: OTHER, created_at: "1" },
    { id: "b", content: "yes!", user_id: ME, created_at: "2", parent_message_id: "a", parent_preview: quote("a", "dinner at 7?") },
    { id: "c", content: "and you?", user_id: ME, created_at: "3", parent_message_id: "x", parent_preview: quote("x", "other words") },
  ];
  const noted = listAfterDelete(rows, "a", { ok: true, deleted: true });
  assert.deepEqual(noted[1].parent_preview, { id: "a", content: "Message deleted", user_id: OTHER, author: null, media_kind: null, attachment_kind: null, deleted: true });
  assert.equal(noted[1].parent_message_id, "a", "the reply still points at the note (the server keeps it)");
  assert.equal(noted[1].content, "yes!", "the reply's own words stay");
  assert.equal(noted[2], rows[2], "a quote of another message is untouched");
  assert.ok(!JSON.stringify(noted).includes("dinner at 7?"), "the deleted words are nowhere in the list");
  // A hard delete (no note): the quote goes, as the server's ON DELETE SET NULL does.
  const gone = listAfterDelete(rows, "a", { ok: true });
  assert.deepEqual(gone.map((r) => r.id), ["b", "c"]);
  assert.equal(gone[0].parent_preview, null);
  assert.equal(gone[0].parent_message_id, null);
  // The quoted message is older than the loaded page: its quote still heals.
  const later = listAfterDelete(rows.slice(1), "a", { ok: true, deleted: true });
  assert.equal(later[0].parent_preview?.deleted, true);
  assert.equal(listAfterDelete(rows.slice(2), "a", { ok: true, deleted: true }).length, 1);
});

test("withDeletedQuotes: the same array when nothing quotes it; the deleted row itself is never rewritten as a quote", () => {
  const rows = [{ id: "a", parent_preview: null }, { id: "b", parent_preview: { id: "z", content: "hi" } }];
  assert.equal(withDeletedQuotes(rows, "a", true), rows);
  const self = [{ id: "a", parent_preview: { id: "a", content: "odd" } }];
  assert.equal(withDeletedQuotes(self, "a", true), self);
  assert.deepEqual(asDeletedQuote({ id: "q", content: "words", media_kind: "video", attachment_kind: "post" }), { id: "q", content: "Message deleted", media_kind: null, attachment_kind: null, deleted: true });
});

// ── the note's shape (deleted-note.ts, shared with the server read) ─────────

test("asDeletedNote: who and when, the keys and a Board post's reply count stay; nothing written or shared does", () => {
  const card = { type: "poll" } as unknown as ChatMessage["card"];
  const m = message({
    kind: "poll",
    card,
    content: "Pizza or tacos?",
    media_url: "/api/x",
    media_kind: "image",
    attachment_id: "cccccccc-0000-4000-8000-000000000001",
    attachment_kind: "post",
    parent_message_id: "dddddddd-0000-4000-8000-000000000001",
    reactions: [{ emoji: "🔥", count: 1, viewer_reacted: false }],
    reply_count: 4,
    thread_root_id: null,
    author_role: "admin",
  });
  const n = asDeletedNote(m);
  assert.equal(n.deleted, true);
  assert.equal(n.kind, "text");
  assert.equal(n.content, "");
  assert.equal(n.card, null);
  assert.equal(n.media_url, null);
  assert.equal(n.media_kind, null);
  assert.equal(n.attachment, null);
  assert.equal(n.attachment_id, null);
  assert.equal(n.attachment_kind, null);
  assert.equal(n.parent_message_id, null);
  assert.equal(n.parent_preview, null);
  assert.deepEqual(n.reactions, []);
  assert.equal(n.removed, null);
  assert.deepEqual(n.users, m.users);
  assert.equal(n.user_id, ME);
  assert.equal(n.created_at, m.created_at);
  assert.equal(n.id, m.id);
  assert.equal(n.reply_count, 4);
  assert.equal(n.author_role, "admin");
  assert.equal(n.hidden, false);
  assert.equal(m.content, "Pizza or tacos?", "the input is not changed");
});

test("hasDeletedShape: no words, no file, no shared post, no card (the database's messages_deleted_is_empty)", () => {
  assert.equal(hasDeletedShape({ content: "", kind: "text", media_url: null, media_kind: null, attachment_id: null, attachment_kind: null, card_event_id: null }), true);
  assert.equal(hasDeletedShape({ content: "" }), true, "a select without those columns");
  assert.equal(hasDeletedShape({ content: " " }), false);
  assert.equal(hasDeletedShape({ content: "hi" }), false);
  assert.equal(hasDeletedShape({ content: "", media_kind: "image" }), false, "a photo with no caption");
  assert.equal(hasDeletedShape({ content: "", media_url: "messages/x/y.jpg" }), false);
  assert.equal(hasDeletedShape({ content: "", attachment_kind: "post" }), false, "a shared post whose post is gone keeps its kind");
  assert.equal(hasDeletedShape({ content: "", attachment_id: "cccccccc-0000-4000-8000-000000000001" }), false);
  assert.equal(hasDeletedShape({ content: "", kind: "poll" }), false);
  assert.equal(hasDeletedShape({ content: "", card_event_id: "eeeeeeee-0000-4000-8000-000000000001" }), false);
  assert.equal(hasDeletedShape({ content: null }), false);
});

test("the two lines: a Board post says Post deleted; every other row says Message deleted", () => {
  assert.equal(DELETED_LINE, "Message deleted");
  assert.equal(DELETED_POST_LINE, "Post deleted");
  assert.match(deleteConfirmCopy().body, new RegExp(DELETED_LINE));
  assert.match(deleteConfirmCopy({ boardPost: true }).body, new RegExp(DELETED_POST_LINE));
});
