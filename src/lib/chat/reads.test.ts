/**
 * Tests for `reads.ts` (handoffs/chat-redesign/wave-2-contracts.md section 7,
 * W2-B4): the pure decisions of the inbox and the club space.
 *
 * Run with:
 *   node --test src/lib/chat/reads.test.ts
 *
 * WHY THE RESOLVE HOOK: `reads.ts` imports one runtime value from
 * "./room-rules" with no extension, which Node's type stripping does not
 * resolve (the `stub.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("reads.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
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

const specifier = "./reads.ts";
const {
  firstPerClub,
  groupClubRooms,
  lastShown,
  latestShownPerRoom,
  messageKindOf,
  newestOf,
  notInList,
  orderInboxClubs,
  orderSpaceRooms,
  readSince,
  recentShown,
  refOfRoom,
  spaceCanPost,
  toPreview,
  unreadLeftOut,
} = (await import(specifier)) as typeof import("./reads");
type MembershipRow = import("./reads").MembershipRow;
type PreviewRow = import("./reads").PreviewRow;
type SpaceRoomWithPosition = import("./reads").SpaceRoomWithPosition;
type EventRef = import("./types").EventRef;
type InboxClub = import("./types").InboxClub;
type OrgRef = import("./types").OrgRef;

const T1 = "2026-10-01T10:00:00+00:00";
const T2 = "2026-10-02T10:00:00+00:00";
const T3 = "2026-10-03T10:00:00+00:00";

function row(over: Partial<PreviewRow>): PreviewRow {
  return { id: "m", channel_id: "c", content: "hi", created_at: T1, user_id: "u", kind: "text", thread_root_id: null, users: { name: "Ann" }, ...over };
}

test("toPreview: the five fields; author_name is \"\" without a readable users row; kind falls back to text", () => {
  assert.deepEqual(toPreview(row({ id: "a", content: "Poll: lunch?", kind: "poll" })), { id: "a", text: "Poll: lunch?", author_name: "Ann", created_at: T1, kind: "poll" });
  assert.equal(toPreview(row({ users: null })).author_name, "");
  assert.equal(toPreview(row({ kind: undefined })).kind, "text");
  assert.equal(toPreview(row({ content: null })).text, "");
  assert.equal(messageKindOf("event_card"), "event_card");
  assert.equal(messageKindOf("weird"), "text");
});

test("latestShownPerRoom: the first non-hidden row per channel, newest first; a window of hidden rows has no entry", () => {
  const rows = [
    row({ id: "1", channel_id: "b", created_at: T3, user_id: "blocked" }),
    row({ id: "2", channel_id: "b", created_at: T2, user_id: "ok" }),
    row({ id: "3", channel_id: "l", created_at: T3, user_id: "blocked" }),
    row({ id: "4", channel_id: "b", created_at: T1, user_id: "ok" }),
  ];
  const latest = latestShownPerRoom(rows, (r) => r.user_id === "blocked");
  assert.equal(latest.get("b")?.id, "2");
  assert.equal(latest.has("l"), false);
  assert.equal(latestShownPerRoom(rows, () => false).get("b")?.id, "1");
});

test("readSince and newestOf", () => {
  assert.equal(readSince({ last_read_at: T2, created_at: T1 }), T2);
  assert.equal(readSince({ last_read_at: null, created_at: T1 }), T1);
  assert.equal(newestOf(T1, null, T3, undefined, T2), T3);
  assert.equal(newestOf(null, undefined), null);
  assert.equal(newestOf("not a time"), null);
});

function membership(over: Partial<MembershipRow> & { kind: unknown; org_id: string | null }): MembershipRow {
  const { kind, org_id, ...rest } = over;
  return { channel_id: "x", created_at: T1, last_read_at: null, pinned_at: null, muted_until: null, channels: { id: "x", org_id, kind, name: "" }, ...rest };
}

test("groupClubRooms: a club needs a board and a lounge row; event rooms ride along; no club → left out", () => {
  const rows = [
    membership({ channel_id: "b1", kind: "board", org_id: "o1" }),
    membership({ channel_id: "e1", kind: "event", org_id: "o1" }),
    membership({ channel_id: "l1", kind: "lounge", org_id: "o1" }),
    membership({ channel_id: "b2", kind: "board", org_id: "o2" }),
    membership({ channel_id: "d", kind: null, org_id: null }),
    membership({ channel_id: "e2", kind: "event", org_id: "o1" }),
  ];
  const clubs = groupClubRooms(rows);
  assert.equal(clubs.length, 1);
  assert.equal(clubs[0].orgId, "o1");
  assert.equal(clubs[0].board.channel_id, "b1");
  assert.equal(clubs[0].lounge.channel_id, "l1");
  assert.deepEqual(clubs[0].eventRooms.map((r) => r.channel_id), ["e1", "e2"]);
});

test("firstPerClub keeps the first row per org of an asc list", () => {
  const first = firstPerClub([{ id: "a", org_id: "o1" }, { id: "b", org_id: "o1" }, { id: "c", org_id: null }, { id: "d", org_id: "o2" }]);
  assert.deepEqual([...first.keys()], ["o1", "o2"]);
  assert.equal(first.get("o1")?.id, "a");
});

const ORG: OrgRef = { id: "o", handle: "h", name: "Club", logo_url: null, banner_url: null, verified: false };
function club(name: string, pinned_at: string | null, last_activity_at: string | null): InboxClub {
  return {
    org: { ...ORG, name },
    viewer_role: "member",
    board: { room_id: "b", latest: null, unread: false },
    lounge: { room_id: "l", latest: null, unread_count: 0 },
    next_event: null,
    last_activity_at,
    pinned_at,
    muted_until: null,
  };
}

test("orderInboxClubs: pinned first (newest pin first), then last_activity desc (nulls last), then name", () => {
  const ordered = orderInboxClubs([
    club("Zeta", null, T3),
    club("Beta", null, null),
    club("Alpha", null, null),
    club("Old pin", T1, T1),
    club("New pin", T2, null),
    club("Mid", null, T1),
  ]);
  assert.deepEqual(ordered.map((c) => c.org.name), ["New pin", "Old pin", "Zeta", "Mid", "Alpha", "Beta"]);
});

test("spaceCanPost: board by role, event by state, others always", () => {
  assert.equal(spaceCanPost("board", "admin", null), true);
  assert.equal(spaceCanPost("board", "mod", null), false);
  assert.equal(spaceCanPost("board", null, null), false);
  assert.equal(spaceCanPost("event", "member", "closed"), false);
  assert.equal(spaceCanPost("event", "member", "after"), true);
  assert.equal(spaceCanPost("lounge", "member", null), true);
  assert.equal(spaceCanPost("officers", "owner", null), true);
});

test("spaceCanPost: an extra room by its post_policy (wave 3, 4c.2); every other kind ignores the policy", () => {
  // No policy given: the rule before the column, everyone who sees it posts.
  assert.equal(spaceCanPost("room", "member", null), true);
  assert.equal(spaceCanPost("room", "member", null, "everyone"), true);
  assert.equal(spaceCanPost("room", "member", null, "everyone", true), true);
  // officers: owner and admin; a mod is not an officer here; the room's list changes nothing.
  assert.equal(spaceCanPost("room", "member", null, "officers"), false);
  assert.equal(spaceCanPost("room", "member", null, "officers", true), false);
  assert.equal(spaceCanPost("room", "mod", null, "officers"), false);
  assert.equal(spaceCanPost("room", "admin", null, "officers"), true);
  assert.equal(spaceCanPost("room", "owner", null, "officers"), true);
  assert.equal(spaceCanPost("room", null, null, "officers"), false);
  // listed: owner, admin, and anyone on the room's list.
  assert.equal(spaceCanPost("room", "member", null, "listed"), false);
  assert.equal(spaceCanPost("room", "member", null, "listed", true), true);
  assert.equal(spaceCanPost("room", "mod", null, "listed", false), false);
  assert.equal(spaceCanPost("room", "admin", null, "listed"), true);
  assert.equal(spaceCanPost("room", "owner", null, "listed", false), true);
  // The fixed rooms and event chats keep their own rule whatever is passed.
  assert.equal(spaceCanPost("lounge", "member", null, "officers"), true);
  assert.equal(spaceCanPost("officers", "member", null, "officers"), true);
  assert.equal(spaceCanPost("board", "member", null, "listed", true), false);
  assert.equal(spaceCanPost("board", "admin", null, "officers"), true);
  assert.equal(spaceCanPost("event", "member", "live", "officers"), true);
  assert.equal(spaceCanPost("event", "owner", "closed", "everyone", true), false);
});

function ref(id: string, starts_at: string, state: EventRef["state"]): EventRef {
  return { id, title: id, starts_at, ends_at: starts_at, location: "", state, room_id: null, viewer_status: null, going_count: 0, maybe_count: 0 };
}
function sroom(over: Partial<SpaceRoomWithPosition> & { kind: SpaceRoomWithPosition["kind"] }): SpaceRoomWithPosition {
  return { id: over.kind, name: over.kind, unread: false, can_post: true, event: null, locked: false, post_policy: "everyone", position: null, state: null, starts_at: null, ...over };
}
/** An event room as the route fills it: `state` and `starts_at` from the ref, or from the event row when the ref is missing. */
function eroom(id: string, name: string, event: EventRef | null, state: SpaceRoomWithPosition["state"], starts_at: string | null): SpaceRoomWithPosition {
  return sroom({ kind: "event", id, name, event, state, starts_at });
}

test("orderSpaceRooms: lounge, board, officers, open event rooms by starts_at, rooms by position then name; closed event rooms out", () => {
  const T2b = "2026-10-02T12:00:00+00:00";
  const ordered = orderSpaceRooms([
    sroom({ kind: "room", id: "r2", name: "zeta", position: 1 }),
    eroom("e-late", "late", ref("e-late", T3, "soon"), "soon", T3),
    sroom({ kind: "room", id: "r1", name: "alpha", position: 1 }),
    eroom("e-closed", "closed", ref("e-closed", T1, "closed"), "closed", T1),
    sroom({ kind: "board", id: "b" }),
    sroom({ kind: "room", id: "r0", name: "first", position: 0 }),
    eroom("e-noref", "noref", null, null, null),
    eroom("e-rowclosed", "rowclosed", null, "closed", T1), // no ref; the event row says closed → out
    eroom("e-rowsoon", "rowsoon", null, "soon", T2b), // no ref; the event row says soon → in its place by starts_at
    eroom("e-early", "early", ref("e-early", T2, "live"), "live", T2),
    sroom({ kind: "officers", id: "o" }),
    sroom({ kind: "lounge", id: "l" }),
  ]);
  assert.deepEqual(ordered.map((r) => r.id), ["l", "b", "o", "e-early", "e-rowsoon", "e-late", "e-noref", "r0", "r1", "r2"]);
  assert.equal("position" in ordered[0], false);
  assert.equal("state" in ordered[3], false);
  assert.equal("starts_at" in ordered[3], false);
  assert.equal(ordered[4].event, null);
});

test("orderSpaceRooms keeps locked and post_policy; a room's keys are exactly the eight of SpaceRoom", () => {
  const ordered = orderSpaceRooms([
    sroom({ kind: "room", id: "r-listed", name: "b", post_policy: "listed", can_post: false }),
    sroom({ kind: "room", id: "r-private", name: "a", locked: true, post_policy: "officers" }),
    sroom({ kind: "officers", id: "o", locked: true }),
    sroom({ kind: "lounge", id: "l" }),
  ]);
  assert.deepEqual(ordered.map((r) => [r.id, r.locked, r.post_policy]), [
    ["l", false, "everyone"],
    ["o", true, "everyone"],
    ["r-private", true, "officers"],
    ["r-listed", false, "listed"],
  ]);
  for (const room of ordered) {
    assert.deepEqual(Object.keys(room).sort(), ["can_post", "event", "id", "kind", "locked", "name", "post_policy", "unread"]);
  }
});

test("lastShown: the last non-hidden, non-removed of an oldest-first page; refOfRoom", () => {
  assert.equal(lastShown([{ id: 1, hidden: false, removed: null }, { id: 2, hidden: false, removed: null }, { id: 3, hidden: true, removed: null }])?.id, 2);
  // 7.2.4: the viewer's own removed row (RLS shows it to its author) is never `board_latest` (INT-ADJUDICATE-9).
  assert.equal(lastShown([{ id: 1, hidden: false, removed: null }, { id: 2, hidden: false, removed: { by: "officer", at: T1, reason: null } }])?.id, 1);
  assert.equal(lastShown([{ hidden: true, removed: null }]), null);
  assert.equal(lastShown([{ hidden: false, removed: { by: "moderator", at: T1, reason: null } }]), null);
  assert.equal(lastShown([]), null);
  const refs = new Map([["e", ref("e", T1, "soon")]]);
  assert.equal(refOfRoom("e", refs)?.id, "e");
  assert.equal(refOfRoom("x", refs), null);
  assert.equal(refOfRoom(null, refs), null);
  assert.equal(refOfRoom("e", null), null);
});

test("recentShown: the last `max` shown messages of an oldest-first page, newest first (board_recent)", () => {
  const removed = { by: "officer", at: T1, reason: null };
  const page = [
    { id: 1, hidden: false, removed: null },
    { id: 2, hidden: false, removed: null },
    { id: 3, hidden: true, removed: null },
    { id: 4, hidden: false, removed: null },
    { id: 5, hidden: false, removed },
    { id: 6, hidden: false, removed: null },
  ];
  assert.deepEqual(recentShown(page, 3).map((m) => m.id), [6, 4, 2], "a stub and a removed row take no place");
  assert.equal(recentShown(page, 3)[0], lastShown(page), "its first entry is board_latest");
  assert.deepEqual(recentShown(page, 10).map((m) => m.id), [6, 4, 2, 1]);
  assert.deepEqual(recentShown(page.slice(0, 2), 3).map((m) => m.id), [2, 1]);
  assert.deepEqual(recentShown([{ hidden: true, removed: null }, { hidden: false, removed }], 3), []);
  assert.deepEqual(recentShown([], 3), []);
  assert.deepEqual(recentShown(page, 0), []);
});

test("unreadLeftOut: everyone blocked is left out of a count, but a blocked officer on the Board", () => {
  const blocked = new Set(["a", "b"]);
  const officers = new Set(["b"]);
  assert.deepEqual(unreadLeftOut(blocked, "lounge", officers), ["a", "b"]);
  assert.deepEqual(unreadLeftOut(blocked, "event", officers), ["a", "b"]);
  assert.deepEqual(unreadLeftOut(blocked, "board", officers), ["a"]);
  assert.deepEqual(unreadLeftOut(new Set(), "board", officers), []);
  assert.equal(notInList(["a", "b"]), "(a,b)");
});
