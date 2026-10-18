/**
 * Tests for `desktop-rules.ts` (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.4).
 *
 * Run with:
 *   node --test src/components/desktop/messages/desktop-rules.test.ts
 *
 * Dates are built with the local `Date` constructor (the row labels format in
 * the device's zone). The resolve hook is the `home-rules.test.ts` pattern:
 * the module imports through the "@/…" alias, which Node's type stripping
 * does not resolve.
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
if (typeof registerHooks !== "function") throw new Error("desktop-rules.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./desktop-rules.ts";
const rules = (await import(specifier)) as typeof import("./desktop-rules");
const homeSpecifier = "../../mobile/messages/home/home-rules.ts";
const home = (await import(homeSpecifier)) as typeof import("../../mobile/messages/home/home-rules");
const formatSpecifier = "../../mobile/messages/format.ts";
const format = (await import(formatSpecifier)) as typeof import("../../mobile/messages/format");
type InboxClub = import("@/lib/chat/types").InboxClub;
type ThreadEntry = import("@/components/mobile/messages/types").ThreadEntry;
type OpenChat = import("./desktop-rules").OpenChat;
type SlimRow = import("./desktop-rules").SlimRow;

// Thursday Oct 8, 2026, 9:00 PM on the device.
const NOW = new Date(2026, 9, 8, 21, 0, 0);
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0);
const iso = (d: Date) => d.toISOString();
const LATER = iso(local(2026, 9, 9));
const EARLIER = iso(local(2026, 9, 7));

function club(over: Partial<InboxClub> & { name: string }): InboxClub {
  const { name, ...rest } = over;
  return {
    org: { id: `org-${name}`, handle: name.toLowerCase().replace(/\s+/g, "-"), name, logo_url: null, banner_url: null, verified: false },
    viewer_role: "member",
    board: { room_id: `board-${name}`, latest: null, unread: false },
    lounge: { room_id: `lounge-${name}`, latest: null, unread_count: 0 },
    next_event: null,
    last_activity_at: null,
    pinned_at: null,
    muted_until: null,
    ...rest,
  };
}

function thread(over: Partial<ThreadEntry> & { id: string }): ThreadEntry {
  return {
    type: "dm",
    name: "",
    photo_url: null,
    peer: { id: `peer-${over.id}`, handle: "maya", name: "Maya R.", avatar_url: null, school: null },
    last_message: null,
    accepted_at: null,
    ...over,
  };
}

const at = (h: number, mi: number) => ({ content: "hi", created_at: iso(local(2026, 9, 8, h, mi)), user_id: "peer-1" });
const keys = (rows: SlimRow[]) => rows.map((r) => r.key);

test("knownChat: a thread, a request, a Board id, a Lounge id; anything else is null", () => {
  const threads = [thread({ id: "t1" }), thread({ id: "g1", type: "group", name: "Study group", peer: null })];
  const requests = [thread({ id: "r1", is_request: true })];
  const clubs = [club({ name: "Salsa Club" }), club({ name: "Jag Robotics" })];
  assert.deepEqual(rules.knownChat("t1", threads, requests, clubs), { kind: "dm" });
  assert.deepEqual(rules.knownChat("g1", threads, requests, clubs), { kind: "dm" });
  assert.deepEqual(rules.knownChat("r1", threads, requests, clubs), { kind: "dm" });
  assert.deepEqual(rules.knownChat("board-Jag Robotics", threads, requests, clubs), { kind: "club", orgHandle: "jag-robotics", roomKind: "board" });
  assert.deepEqual(rules.knownChat("lounge-Salsa Club", threads, requests, clubs), { kind: "club", orgHandle: "salsa-club", roomKind: "lounge" });
  // An event chat, the Officers room, an extra room: the shell does the resolving read.
  assert.equal(rules.knownChat("event-room-9", threads, requests, clubs), null);
  assert.equal(rules.knownChat("", threads, requests, clubs), null);
  // Lists that have not loaded know nothing.
  assert.equal(rules.knownChat("t1", null, null, null), null);
  assert.deepEqual(rules.knownChat("t1", threads, null, null), { kind: "dm" });
  assert.deepEqual(rules.knownChat("r1", null, requests, null), { kind: "dm" });
  assert.deepEqual(rules.knownChat("board-Salsa Club", null, null, clubs), { kind: "club", orgHandle: "salsa-club", roomKind: "board" });
});

test("slimRows: the order is mergeHomeRows'; pinned and unread rows are kept and recent ones fill the list, quietly", () => {
  const clubs = [
    club({ name: "Salsa Club", last_activity_at: iso(local(2026, 9, 8, 20, 41)), lounge: { room_id: "l-salsa", latest: null, unread_count: 3 } }),
    club({ name: "Pre-Med Society", last_activity_at: null }),
    club({ name: "Jag Robotics", last_activity_at: iso(local(2026, 9, 8, 19, 55)), pinned_at: iso(local(2026, 9, 1)) }),
    club({ name: "Film Society", last_activity_at: iso(local(2026, 9, 8, 18, 0)), board: { room_id: "b-film", latest: null, unread: true } }),
  ];
  const threads = [
    thread({ id: "t1", last_message: at(20, 44), pinned_at: iso(local(2026, 9, 3)) }),
    thread({ id: "t2", last_message: at(20, 12), unread: true }),
    thread({ id: "t3", last_message: at(19, 0) }),
    thread({ id: "t4", last_message: null, unread: true }),
  ];
  const all = rules.slimRows(clubs, threads, [], null, NOW);
  // Eight chats and a target of eight: every row shows, in the home list's own order.
  const merged = home.mergeHomeRows(clubs, threads).map((r) => (r.kind === "club" ? `club:${r.club.org.id}` : `thread:${r.thread.id}`));
  assert.equal(merged.length, 8);
  assert.equal(rules.SLIM_TARGET, 8);
  assert.deepEqual(keys(all), merged);
  assert.ok(all.every((r) => r.open === false));
  // The two rows that are neither pinned nor unread are recent fills: no dot.
  const dots = Object.fromEntries(all.map((r) => [r.key, r.dot]));
  assert.equal(dots["thread:t3"], null);
  assert.equal(dots["club:org-Pre-Med Society"], null);
  assert.equal(dots["thread:t2"], "coral");
  assert.equal(dots["club:org-Salsa Club"], "ring");
  // Nothing pinned, nothing unread, nothing open: the recent chats alone.
  assert.deepEqual(keys(rules.slimRows([club({ name: "Quiet" })], [thread({ id: "q" })], [], null, NOW)).sort(), ["club:org-Quiet", "thread:q"]);
  assert.deepEqual(rules.slimRows([], [], [], null, NOW), []);
});

test("slimRows: recent chats fill the list to SLIM_TARGET, in the home list's order, and never push a kept row out", () => {
  const quiet = (n: number, from = 1) => Array.from({ length: n }, (_, i) => thread({ id: `q${from + i}`, last_message: at(12, 59 - (from + i)) }));
  const home8 = (rows: SlimRow[]) => keys(rows);
  const order = (clubs: InboxClub[], threads: ThreadEntry[]) =>
    home.mergeHomeRows(clubs, threads).map((r) => (r.kind === "club" ? `club:${r.club.org.id}` : `thread:${r.thread.id}`));

  // Twenty chats, two pinned and three unread: those five, then the three newest others; home order throughout.
  const many = [
    thread({ id: "p1", last_message: at(9, 0), pinned_at: iso(local(2026, 9, 3)) }),
    thread({ id: "p2", last_message: at(8, 0), pinned_at: iso(local(2026, 9, 2)) }),
    thread({ id: "u1", last_message: at(20, 0), unread: true }),
    thread({ id: "u2", last_message: at(11, 30), unread: true }),
    thread({ id: "u3", last_message: at(7, 0), unread: true }),
    ...quiet(15),
  ];
  const twenty = rules.slimRows([], many, [], null, NOW);
  assert.equal(twenty.length, 8);
  const merged = order([], many);
  assert.deepEqual(home8(twenty), merged.filter((k) => home8(twenty).includes(k)));
  for (const k of ["thread:p1", "thread:p2", "thread:u1", "thread:u2", "thread:u3"]) assert.ok(home8(twenty).includes(k), k);
  const fills = home8(twenty).filter((k) => k.startsWith("thread:q"));
  assert.deepEqual(fills, merged.filter((k) => k.startsWith("thread:q")).slice(0, 3));
  assert.ok(twenty.filter((r) => r.key.startsWith("thread:q")).every((r) => r.dot === null));

  // Ten unread: all ten stay, and no recent row is added.
  const tenUnread = [...Array.from({ length: 10 }, (_, i) => thread({ id: `n${i}`, last_message: at(10, i), unread: true })), ...quiet(4)];
  const ten = rules.slimRows([], tenUnread, [], null, NOW);
  assert.equal(ten.length, 10);
  assert.ok(ten.every((r) => r.key.startsWith("thread:n")));

  // The open chat far down the list is kept, counts once, and leaves seven fills.
  const far = quiet(20);
  const openFar: OpenChat = { kind: "dm", threadId: "q20", name: "Maya R.", avatarUrl: null, group: false };
  const withOpen = rules.slimRows([], far, [], openFar, NOW);
  assert.equal(withOpen.length, 8);
  assert.equal(withOpen.filter((r) => r.open).length, 1);
  assert.equal(withOpen.find((r) => r.open)?.key, "thread:q20");
  assert.deepEqual(home8(withOpen).slice(0, 7), order([], far).slice(0, 7));

  // An open chat that is in neither list is put first and counts toward the eight.
  const unlisted: OpenChat = { kind: "dm", threadId: "new-9", name: "Priya", avatarUrl: null, group: false };
  const supplied = rules.slimRows([], far, [], unlisted, NOW);
  assert.equal(supplied.length, 8);
  assert.equal(supplied[0].key, "thread:new-9");
  assert.deepEqual(home8(supplied).slice(1), order([], far).slice(0, 7));

  // A message request is not in the home list, so it is never a recent row.
  const requests = [thread({ id: "r1", is_request: true, last_message: at(21, 0) })];
  assert.ok(!home8(rules.slimRows([], quiet(3), requests, null, NOW)).includes("thread:r1"));
});

test("slimRows: a muted unread chat is not kept unless it is pinned or open (as a recent row it has no dot); a mute that has passed does not count", () => {
  const clubs = [
    club({ name: "Muted", lounge: { room_id: "l-m", latest: null, unread_count: 4 }, muted_until: LATER }),
    club({ name: "Muted Pinned", board: { room_id: "b-mp", latest: null, unread: true }, muted_until: LATER, pinned_at: iso(local(2026, 9, 2)) }),
    club({ name: "Was Muted", lounge: { room_id: "l-w", latest: null, unread_count: 2 }, muted_until: EARLIER }),
  ];
  const threads = [
    thread({ id: "m1", unread: true, muted_until: LATER }),
    thread({ id: "m2", unread: true, muted_until: LATER, pinned_at: iso(local(2026, 9, 1)) }),
    thread({ id: "m3", unread: true, muted_until: EARLIER }),
  ];
  // Six chats, under the target: all six show, but the two muted, unpinned ones only as quiet recent rows.
  const all = rules.slimRows(clubs, threads, [], null, NOW);
  assert.deepEqual(keys(all), ["club:org-Muted Pinned", "thread:m2", "club:org-Muted", "club:org-Was Muted", "thread:m1", "thread:m3"]);
  const dots = Object.fromEntries(all.map((r) => [r.key, r.dot]));
  assert.equal(dots["club:org-Muted"], null);
  assert.equal(dots["thread:m1"], null);
  assert.equal(dots["club:org-Muted Pinned"], "coral");
  assert.equal(dots["thread:m2"], "coral");
  assert.equal(dots["club:org-Was Muted"], "ring");
  assert.equal(dots["thread:m3"], "coral");
  // With the list already full of kept rows, a muted unread chat is not shown at all.
  const full = Array.from({ length: 8 }, (_, i) => thread({ id: `k${i}`, last_message: at(22, i), unread: true }));
  const crowded = keys(rules.slimRows(clubs, [...full, ...threads], [], null, NOW));
  assert.ok(!crowded.includes("club:org-Muted") && !crowded.includes("thread:m1"));
  assert.ok(crowded.includes("club:org-Muted Pinned") && crowded.includes("thread:m2"));
  // Open: a muted, unpinned chat is kept, in its own place, even when the list is full.
  const openThread: OpenChat = { kind: "dm", threadId: "m1", name: "Maya R.", avatarUrl: null, group: false };
  assert.ok(keys(rules.slimRows(clubs, [...full, ...threads], [], openThread, NOW)).includes("thread:m1"));
  const openClub: OpenChat = { kind: "club", orgId: "org-Muted", orgHandle: "muted", name: "Muted", logoUrl: null, roomId: "l-m" };
  assert.ok(keys(rules.slimRows(clubs, [...full, ...threads], [], openClub, NOW)).includes("club:org-Muted"));
});

test("slimRows: coral for an unread Board post or an unread chat, the ring for new Lounge messages only; a club row's target is ClubRow's", () => {
  const clubs = [
    club({ name: "Board Only", board: { room_id: "b1", latest: null, unread: true } }),
    club({ name: "Lounge Only", lounge: { room_id: "l2", latest: null, unread_count: 5 } }),
    club({ name: "Both", board: { room_id: "b3", latest: null, unread: true }, lounge: { room_id: "l3", latest: null, unread_count: 1 } }),
    club({ name: "Pinned Quiet", pinned_at: iso(local(2026, 9, 1)), org: { id: "o4", handle: "pinned_quiet", name: "Pinned Quiet", logo_url: "/logo.png", banner_url: null, verified: true } }),
  ];
  const threads = [
    thread({ id: "u1", unread: true, peer: { id: "p-u1", handle: "theo", name: "Theo", avatar_url: "/theo.png", school: null } }),
    thread({ id: "g1", type: "group", name: "", peer: null, photo_url: "/g1.png", pinned_at: iso(local(2026, 8, 1)) }),
    thread({ id: "n1", unread: true, peer: { id: "p-n1", handle: "noor", name: null, avatar_url: null, school: null } }),
  ];
  const rows = rules.slimRows(clubs, threads, [], null, NOW);
  const by = (key: string) => rows.find((r) => r.key === key) as SlimRow;

  const board = by("club:org-Board Only");
  assert.equal(board.dot, "coral");
  assert.deepEqual(board.target, { kind: "club", orgHandle: "board-only", roomId: "b1", roomKind: "board" });
  assert.equal(board.href, "/messages?channel=b1");
  assert.equal(board.label, home.clubRowLabel(clubs[0], NOW));
  assert.equal(board.seed, "org-Board Only");
  assert.equal(board.kind, "club");

  const lounge = by("club:org-Lounge Only");
  assert.equal(lounge.dot, "ring");
  assert.deepEqual(lounge.target, { kind: "club", orgHandle: "lounge-only", roomId: "l2", roomKind: "lounge" });
  assert.equal(lounge.href, "/messages?channel=l2");

  // Both unread: the coral dot wins, and the row opens the Lounge (ClubRow's rule).
  const both = by("club:org-Both");
  assert.equal(both.dot, "coral");
  assert.deepEqual(both.target, { kind: "club", orgHandle: "both", roomId: "l3", roomKind: "lounge" });

  const quiet = by("club:o4");
  assert.equal(quiet.dot, null);
  assert.equal(quiet.name, "Pinned Quiet");
  assert.equal(quiet.avatarUrl, "/logo.png");
  assert.equal(quiet.seed, "o4");
  assert.deepEqual(quiet.target, { kind: "club", orgHandle: "pinned_quiet", roomId: "lounge-Pinned Quiet", roomKind: "lounge" });

  const dm = by("thread:u1");
  assert.deepEqual(
    { kind: dm.kind, name: dm.name, avatarUrl: dm.avatarUrl, seed: dm.seed, dot: dm.dot, href: dm.href, target: dm.target },
    { kind: "dm", name: "Theo", avatarUrl: "/theo.png", seed: "p-u1", dot: "coral", href: "/messages?channel=u1", target: { kind: "dm", threadId: "u1" } },
  );
  assert.equal(dm.label, home.personRowLabel(threads[0], NOW));

  const group = by("thread:g1");
  assert.deepEqual(
    { kind: group.kind, name: group.name, avatarUrl: group.avatarUrl, seed: group.seed, dot: group.dot },
    { kind: "group", name: "Group", avatarUrl: "/g1.png", seed: "g1", dot: null },
  );
  assert.equal(by("thread:n1").name, "@noor");
});

test("slimRows: the open row has no dot, and the open club's row targets the room that is open", () => {
  const clubs = [club({ name: "Salsa Club", board: { room_id: "b-s", latest: null, unread: true }, lounge: { room_id: "l-s", latest: null, unread_count: 2 } })];
  const threads = [thread({ id: "t1", unread: true })];
  const open = (roomId: string): Extract<OpenChat, { kind: "club" }> => ({ kind: "club", orgId: "org-Salsa Club", orgHandle: "salsa-club", name: "Salsa Club", logoUrl: null, roomId });

  const onBoard = rules.slimRows(clubs, threads, [], open("b-s"), NOW);
  assert.deepEqual(keys(onBoard), ["club:org-Salsa Club", "thread:t1"]);
  assert.equal(onBoard[0].open, true);
  assert.equal(onBoard[0].dot, null);
  assert.deepEqual(onBoard[0].target, { kind: "club", orgHandle: "salsa-club", roomId: "b-s", roomKind: "board" });
  assert.equal(onBoard[1].open, false);
  assert.equal(onBoard[1].dot, "coral");

  // An event chat of the open club: still the club's row, still no second row, the address stays the event's.
  const onEvent = rules.slimRows(clubs, threads, [], open("event-room-9"), NOW);
  assert.deepEqual(keys(onEvent), ["club:org-Salsa Club", "thread:t1"]);
  assert.equal(onEvent[0].open, true);
  assert.equal(onEvent[0].href, "/messages?channel=event-room-9");
  assert.deepEqual(onEvent[0].target, { kind: "club", orgHandle: "salsa-club", roomId: "event-room-9", roomKind: "room" });

  // The org id not known yet (a deep link): the handle finds the row.
  const byHandle = rules.slimRows(clubs, threads, [], { ...open("l-s"), orgId: null, orgHandle: "Salsa-Club" }, NOW);
  assert.deepEqual(keys(byHandle), ["club:org-Salsa Club", "thread:t1"]);
  assert.equal(byHandle[0].open, true);
  assert.deepEqual(byHandle[0].target, { kind: "club", orgHandle: "salsa-club", roomId: "l-s", roomKind: "lounge" });

  const onThread = rules.slimRows(clubs, threads, [], { kind: "dm", threadId: "t1", name: "Maya R.", avatarUrl: null, group: false }, NOW);
  assert.deepEqual(onThread.map((r) => [r.key, r.open, r.dot]), [["club:org-Salsa Club", false, "coral"], ["thread:t1", true, null]]);
  // A quiet chat is the open row while it is open, and a recent row (not open, no dot) when it is not.
  const quiet = [thread({ id: "q1" })];
  const whileOpen = rules.slimRows([], quiet, [], { kind: "dm", threadId: "q1", name: "Maya R.", avatarUrl: null, group: false }, NOW);
  assert.deepEqual(whileOpen.map((r) => [r.key, r.open, r.dot]), [["thread:q1", true, null]]);
  assert.deepEqual(rules.slimRows([], quiet, [], null, NOW).map((r) => [r.key, r.open, r.dot]), [["thread:q1", false, null]]);
});

test("slimRows: an open chat in neither list gets one row built from `open`, put first", () => {
  const clubs = [club({ name: "Jag Robotics", pinned_at: iso(local(2026, 9, 1)) })];
  const threads = [thread({ id: "t1", unread: true })];
  const requests = [
    thread({ id: "r1", is_request: true, unread: true, peer: { id: "p-r1", handle: "eli", name: "Eli", avatar_url: "/eli.png", school: null } }),
    thread({ id: "r2", is_request: true }),
  ];

  // A request: the list of requests is never drawn here, only the open one.
  const request = rules.slimRows(clubs, threads, requests, { kind: "dm", threadId: "r1", name: "", avatarUrl: null, group: false }, NOW);
  assert.deepEqual(keys(request), ["thread:r1", "club:org-Jag Robotics", "thread:t1"]);
  assert.deepEqual(request[0], {
    key: "thread:r1", kind: "dm", name: "Eli", avatarUrl: "/eli.png", seed: "p-r1", open: true, dot: null, label: "Eli",
    href: "/messages?channel=r1", target: { kind: "dm", threadId: "r1" },
  });

  // A dm made a moment ago: what `open` says, the name alone as its label.
  const fresh = rules.slimRows(clubs, threads, requests, { kind: "dm", threadId: "new-1", name: "Priya", avatarUrl: "/p.png", group: false }, NOW);
  assert.deepEqual(keys(fresh), ["thread:new-1", "club:org-Jag Robotics", "thread:t1"]);
  assert.deepEqual(fresh[0], {
    key: "thread:new-1", kind: "dm", name: "Priya", avatarUrl: "/p.png", seed: "new-1", open: true, dot: null, label: "Priya",
    href: "/messages?channel=new-1", target: { kind: "dm", threadId: "new-1" },
  });
  const group = rules.slimRows([], [], [], { kind: "dm", threadId: "g9", name: "", avatarUrl: null, group: true }, NOW);
  assert.deepEqual([group[0].kind, group[0].name, group[0].label], ["group", "Group", "Group"]);

  // A club the inbox does not list, before and after its id is known.
  const unlisted: OpenChat = { kind: "club", orgId: null, orgHandle: "chess_club", name: "Chess Club", logoUrl: "/c.png", roomId: "room/1" };
  const first = rules.slimRows(clubs, threads, requests, unlisted, NOW);
  assert.deepEqual(keys(first), ["club:chess_club", "club:org-Jag Robotics", "thread:t1"]);
  assert.deepEqual(first[0], {
    key: "club:chess_club", kind: "club", name: "Chess Club", avatarUrl: "/c.png", seed: "chess_club", open: true, dot: null, label: "Chess Club",
    href: "/messages?channel=room%2F1", target: { kind: "club", orgHandle: "chess_club", roomId: "room/1", roomKind: "room" },
  });
  const named = rules.slimRows(clubs, threads, requests, { ...unlisted, orgId: "org-chess" }, NOW);
  assert.deepEqual([named[0].key, named[0].seed], ["club:org-chess", "org-chess"]);
  assert.equal(named.filter((r) => r.open).length, 1);
});

test("slimRows: a person's or a group's name and photo are the phone's own (format.ts), on a listed row and on a supplied one", () => {
  const people = [
    thread({ id: "d1", pinned_at: LATER, peer: { id: "p1", handle: "maya", name: "Maya R.", avatar_url: "/m.png", school: null } }),
    thread({ id: "d2", pinned_at: LATER, peer: { id: "p2", handle: "noor", name: null, avatar_url: null, school: null } }),
    thread({ id: "d3", pinned_at: LATER, peer: { id: "p3", handle: null, name: null, avatar_url: null, school: null } }),
    thread({ id: "d4", pinned_at: LATER, peer: null }),
    thread({ id: "g1", pinned_at: LATER, type: "group", name: "Road trip", photo_url: "/g1.png", peer: null }),
    thread({ id: "g2", pinned_at: LATER, type: "group", name: "", peer: null }),
  ];
  const listed = rules.slimRows([], people, [], null, NOW);
  assert.equal(listed.length, people.length);
  for (const t of people) {
    const row = listed.find((r) => r.key === `thread:${t.id}`)!;
    assert.equal(row.name, format.threadTitle(t), t.id);
    assert.equal(row.avatarUrl, format.threadAvatar(t).url, t.id);
  }
  assert.deepEqual(listed.map((r) => r.name).sort(), ["@noor", "Direct message", "Direct message", "Group", "Maya R.", "Road trip"]);

  // The same threads as requests, open with nothing known yet: the supplied row says the same words.
  for (const t of people) {
    const [row] = rules.slimRows([], [], people, { kind: "dm", threadId: t.id, name: "", avatarUrl: null, group: t.type !== "dm" }, NOW);
    assert.deepEqual([row.name, row.avatarUrl], [format.threadTitle(t), format.threadAvatar(t).url], t.id);
  }
});

test("slimRows: the placeholder kind `room` is on the open row only; every other club row names its own Board or Lounge", () => {
  const clubs = [
    club({ name: "Salsa Club", board: { room_id: "b-s", latest: null, unread: true }, lounge: { room_id: "l-s", latest: null, unread_count: 0 } }),
    club({ name: "Film Society", pinned_at: EARLIER }),
    club({ name: "Jag Robotics", lounge: { room_id: "lounge-Jag Robotics", latest: null, unread_count: 3 } }),
  ];
  const opens: (OpenChat | null)[] = [
    null,
    { kind: "club", orgId: "org-Salsa Club", orgHandle: "salsa-club", name: "Salsa Club", logoUrl: null, roomId: "event-room-9" },
    { kind: "club", orgId: "org-Film Society", orgHandle: "film-society", name: "Film Society", logoUrl: null, roomId: "officers-1" },
    { kind: "club", orgId: null, orgHandle: "chess_club", name: "Chess Club", logoUrl: null, roomId: "room-1" },
    { kind: "dm", threadId: "t1", name: "Maya R.", avatarUrl: null, group: false },
  ];
  for (const open of opens) {
    const rows = rules.slimRows(clubs, [thread({ id: "t1", unread: true })], [], open, NOW);
    for (const row of rows) {
      if (row.target.kind !== "club" || row.open) continue;
      const own = clubs.find((c) => `club:${c.org.id}` === row.key)!;
      assert.ok(row.target.roomKind === "board" || row.target.roomKind === "lounge", row.key);
      assert.equal(row.target.roomId, row.target.roomKind === "board" ? own.board.room_id : own.lounge.room_id, row.key);
    }
    // An event chat, the Officers room and an unlisted club's room are all said as `room`: a word for "not known", not a kind.
    const openClub = rows.find((r) => r.open && r.target.kind === "club");
    if (open?.kind === "club") assert.deepEqual(openClub?.target, { kind: "club", orgHandle: open.orgHandle, roomId: open.roomId, roomKind: "room" });
    else assert.equal(openClub, undefined);
  }
});

test("searchRows: club, person, group and group members' names, whatever the case; an empty query gives the rows back", () => {
  const clubs = [club({ name: "Salsa Club" }), club({ name: "Film Society" })];
  const threads = [
    thread({ id: "d1", peer: { id: "p1", handle: "maya", name: "Maya R.", avatar_url: null, school: null } }),
    thread({ id: "d2", peer: { id: "p2", handle: "salazar", name: null, avatar_url: null, school: null } }),
    thread({
      id: "g1", type: "group", name: "Road trip", peer: null,
      members: [
        { id: "m1", handle: "theo", name: "Theo Park", avatar_url: null, role: "member" },
        { id: "m2", handle: "anon", name: null, avatar_url: null, role: "member" },
      ],
    }),
    thread({ id: "g2", type: "group", name: "", peer: null }),
  ];
  const rows = home.mergeHomeRows(clubs, threads);
  const found = (q: string) => rules.searchRows(rows, q).map((r) => (r.kind === "club" ? r.club.org.name : r.thread.id));

  assert.equal(rules.searchRows(rows, ""), rows);
  assert.equal(rules.searchRows(rows, "   "), rows);
  assert.deepEqual(found("salsa"), ["Salsa Club"]);
  assert.deepEqual(found("SOCIETY"), ["Film Society"]);
  assert.deepEqual(found("maya"), ["d1"]);
  assert.deepEqual(found("  Maya r "), ["d1"]);
  // A person with no name is listed, and found, by the handle the row shows.
  assert.deepEqual(found("@sal"), ["d2"]);
  assert.deepEqual(found("sal"), ["Salsa Club", "d2"]);
  assert.deepEqual(found("road"), ["g1"]);
  assert.deepEqual(found("theo"), ["g1"]);
  assert.deepEqual(found("park"), ["g1"]);
  // "includes", in the rows' own order; nothing found is an empty list, never the rows.
  assert.deepEqual(found("o"), ["Film Society", "g1", "g2"]);
  assert.deepEqual(found("zzz"), []);
  assert.deepEqual(rules.searchRows([], "maya"), []);
});

test("bandFit on this week (the left block measures 560): band 700, 1000 and 1240 with 0, 1, 3 and 6 events", () => {
  // 700: 140 left, no card fits; everything goes to the +N chip.
  assert.deepEqual(rules.bandFit(700, 560, 0), { cards: 0, more: 0 });
  assert.deepEqual(rules.bandFit(700, 560, 1), { cards: 0, more: 1 });
  assert.deepEqual(rules.bandFit(700, 560, 3), { cards: 0, more: 3 });
  assert.deepEqual(rules.bandFit(700, 560, 6), { cards: 0, more: 6 });
  // 1000: 440 left, two cards; with the chip's 64 taken out, still two.
  assert.deepEqual(rules.bandFit(1000, 560, 0), { cards: 0, more: 0 });
  assert.deepEqual(rules.bandFit(1000, 560, 1), { cards: 1, more: 0 });
  assert.deepEqual(rules.bandFit(1000, 560, 3), { cards: 2, more: 1 });
  assert.deepEqual(rules.bandFit(1000, 560, 6), { cards: 2, more: 4 });
  // 1240: 680 left, three cards.
  assert.deepEqual(rules.bandFit(1240, 560, 0), { cards: 0, more: 0 });
  assert.deepEqual(rules.bandFit(1240, 560, 1), { cards: 1, more: 0 });
  assert.deepEqual(rules.bandFit(1240, 560, 3), { cards: 3, more: 0 });
  assert.deepEqual(rules.bandFit(1240, 560, 6), { cards: 3, more: 3 });
});

test("bandFit: the chip's own 64 can cost a card; the edges of a slot", () => {
  // 528 left holds three cards, but not three cards and the chip.
  assert.deepEqual(rules.bandFit(1088, 560, 3), { cards: 3, more: 0 });
  assert.deepEqual(rules.bandFit(1088, 560, 4), { cards: 2, more: 2 });
  // One slot is 176: 175 holds none, 176 holds one.
  assert.deepEqual(rules.bandFit(735, 560, 1), { cards: 0, more: 1 });
  assert.deepEqual(rules.bandFit(736, 560, 1), { cards: 1, more: 0 });
  // 176 + 64 = 240: the first width that shows one card AND the chip.
  assert.deepEqual(rules.bandFit(799, 560, 2), { cards: 0, more: 2 });
  assert.deepEqual(rules.bandFit(800, 560, 2), { cards: 1, more: 1 });
});

test("bandFit on another week (a wider left block, 650): never more cards than this week, never below 0, +N counted", () => {
  for (const band of [824, 700]) {
    for (const count of [0, 1, 3, 6]) {
      const thisWeek = rules.bandFit(band, 560, count);
      const other = rules.bandFit(band, 650, count);
      assert.ok(other.cards <= thisWeek.cards, `band ${band}, ${count} events: no more cards than this week`);
      assert.ok(other.cards >= 0 && other.more >= 0, `band ${band}, ${count} events: never below 0`);
      assert.equal(other.cards + other.more, count, `band ${band}, ${count} events: every event is a card or in +N`);
      assert.equal(thisWeek.cards + thisWeek.more, count);
    }
  }
  // 824: this week one card fits (264 left); the other week's 174 holds none.
  assert.deepEqual(rules.bandFit(824, 560, 1), { cards: 1, more: 0 });
  assert.deepEqual(rules.bandFit(824, 650, 1), { cards: 0, more: 1 });
  assert.deepEqual(rules.bandFit(824, 560, 3), { cards: 1, more: 2 });
  assert.deepEqual(rules.bandFit(824, 650, 3), { cards: 0, more: 3 });
  assert.deepEqual(rules.bandFit(824, 650, 6), { cards: 0, more: 6 });
  // 700: 50 left, and -14 once the chip is taken out: still 0, not -1.
  assert.deepEqual(rules.bandFit(700, 650, 0), { cards: 0, more: 0 });
  assert.deepEqual(rules.bandFit(700, 650, 3), { cards: 0, more: 3 });
  // A left block wider than the band, a band not measured yet, a broken count.
  assert.deepEqual(rules.bandFit(500, 650, 2), { cards: 0, more: 2 });
  assert.deepEqual(rules.bandFit(0, 0, 2), { cards: 0, more: 2 });
  assert.deepEqual(rules.bandFit(Number.NaN, 560, 2), { cards: 0, more: 2 });
  assert.deepEqual(rules.bandFit(1240, 560, -1), { cards: 0, more: 0 });
  assert.deepEqual(rules.bandFit(1240, 560, Number.NaN), { cards: 0, more: 0 });
});

test("panelMode: every branch", () => {
  // The club panel (320) fits from 232 + 420 + 320 = 972; the dm panel (288) from 940.
  for (const pref of ["1", null] as const) {
    assert.equal(rules.panelMode(972, 320, pref, false), "side");
    assert.equal(rules.panelMode(972, 320, pref, true), "side");
  }
  assert.equal(rules.panelMode(972, 320, "0", false), "hidden");
  assert.equal(rules.panelMode(972, 320, "0", true), "side");
  // One pixel short: an overlay, and only after a click in this visit.
  assert.equal(rules.panelMode(971, 320, "1", false), "hidden");
  assert.equal(rules.panelMode(971, 320, null, false), "hidden");
  assert.equal(rules.panelMode(971, 320, "0", false), "hidden");
  assert.equal(rules.panelMode(971, 320, "1", true), "overlay");
  assert.equal(rules.panelMode(971, 320, null, true), "overlay");
  assert.equal(rules.panelMode(971, 320, "0", true), "overlay");
  // The same width holds the narrower panel as a column.
  assert.equal(rules.panelMode(940, 288, null, false), "side");
  assert.equal(rules.panelMode(939, 288, null, false), "hidden");
  assert.equal(rules.panelMode(939, 288, null, true), "overlay");
  // Not measured yet.
  assert.equal(rules.panelMode(0, 320, "1", false), "hidden");
});

test("chatEntry: the phone's state at depth 1 and the address, the id encoded", () => {
  assert.deepEqual(rules.chatEntry("abc-123"), { state: { vibeChat: "abc-123", depth: 1 }, url: "/messages?channel=abc-123" });
  assert.deepEqual(rules.chatEntry("a b/c&d"), { state: { vibeChat: "a b/c&d", depth: 1 }, url: "/messages?channel=a%20b%2Fc%26d" });
  // The address reads back to the same id.
  assert.equal(new URLSearchParams(rules.chatEntry("a b/c&d").url.split("?")[1]).get("channel"), "a b/c&d");
});

test("withFollowedBoards: the Boards I follow under the slim rows, the dot for an unseen post, the open Board in place", () => {
  type FollowedBoard = import("@/lib/chat/types").FollowedBoard;
  const board = (name: string, latestAt: string | null): FollowedBoard => ({
    org: { id: `org-${name}`, handle: name.toLowerCase(), name, logo_url: null, banner_url: null, verified: false },
    room_id: `room-${name}`,
    latest: latestAt ? { id: `m-${name}`, text: "Chapter at 7", author_name: "", created_at: latestAt, kind: "text" } : null,
  });
  const sae = board("SAE", LATER);
  const chess = board("Chess", EARLIER);
  const base = rules.slimRows([club({ name: "Finance" })], [], [], null, NOW);
  const rows = rules.withFollowedBoards(base, [sae, chess], null, { "room-Chess": EARLIER }, NOW);
  assert.deepEqual(rows.map((r) => r.key), [...base.map((r) => r.key), "club:org-SAE", "club:org-Chess"]);
  const saeRow = rows.find((r) => r.key === "club:org-SAE")!;
  assert.equal(saeRow.dot, "coral", "never seen: new");
  assert.deepEqual(saeRow.target, { kind: "club", orgHandle: "sae", roomId: "room-SAE", roomKind: "board" });
  assert.equal(saeRow.href, rules.chatEntry("room-SAE").url);
  assert.match(saeRow.label, /^SAE Board, you follow this club, new post, /);
  assert.equal(rows.find((r) => r.key === "club:org-Chess")!.dot, null, "seen up to its newest post");
  // The open Board: the shell's supplied row gives way to the Board's own, open, with no dot.
  const open: OpenChat = { kind: "club", orgId: "org-SAE", orgHandle: "sae", name: "SAE", logoUrl: null, roomId: "room-SAE" };
  const supplied = rules.slimRows([], [], [], open, NOW);
  assert.equal(supplied[0]?.key, "club:org-SAE");
  const openRows = rules.withFollowedBoards(supplied, [sae], open, {}, NOW);
  assert.deepEqual(openRows.map((r) => [r.key, r.open, r.dot]), [["club:org-SAE", true, null]]);
  assert.equal(rules.withFollowedBoards(base, [], null, {}, NOW), base);
});
