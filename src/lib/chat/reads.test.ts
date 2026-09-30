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
  orderInboxClubs,
  orderSpaceRooms,
  readSince,
  refOfRoom,
  spaceCanPost,
  toPreview,
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

function ref(id: string, starts_at: string, state: EventRef["state"]): EventRef {
  return { id, title: id, starts_at, ends_at: starts_at, location: "", state, room_id: null, viewer_status: null, going_count: 0, maybe_count: 0 };
}
function sroom(over: Partial<SpaceRoomWithPosition> & { kind: SpaceRoomWithPosition["kind"] }): SpaceRoomWithPosition {
  return { id: over.kind, name: over.kind, unread: false, can_post: true, event: null, position: null, ...over };
}

test("orderSpaceRooms: lounge, board, officers, open event rooms by starts_at, rooms by position then name; closed event rooms out", () => {
  const ordered = orderSpaceRooms([
    sroom({ kind: "room", id: "r2", name: "zeta", position: 1 }),
    sroom({ kind: "event", id: "e-late", name: "late", event: ref("e-late", T3, "soon") }),
    sroom({ kind: "room", id: "r1", name: "alpha", position: 1 }),
    sroom({ kind: "event", id: "e-closed", name: "closed", event: ref("e-closed", T1, "closed") }),
    sroom({ kind: "board", id: "b" }),
    sroom({ kind: "room", id: "r0", name: "first", position: 0 }),
    sroom({ kind: "event", id: "e-noref", name: "noref", event: null }),
    sroom({ kind: "event", id: "e-early", name: "early", event: ref("e-early", T2, "live") }),
    sroom({ kind: "officers", id: "o" }),
    sroom({ kind: "lounge", id: "l" }),
  ]);
  assert.deepEqual(ordered.map((r) => r.id), ["l", "b", "o", "e-early", "e-late", "e-noref", "r0", "r1", "r2"]);
  assert.equal("position" in ordered[0], false);
});

test("lastShown: the last non-hidden of an oldest-first page; refOfRoom", () => {
  assert.equal(lastShown([{ id: 1, hidden: false }, { id: 2, hidden: false }, { id: 3, hidden: true }])?.id, 2);
  assert.equal(lastShown([{ hidden: true }]), null);
  assert.equal(lastShown([]), null);
  const refs = new Map([["e", ref("e", T1, "soon")]]);
  assert.equal(refOfRoom("e", refs)?.id, "e");
  assert.equal(refOfRoom("x", refs), null);
  assert.equal(refOfRoom(null, refs), null);
  assert.equal(refOfRoom("e", null), null);
});
