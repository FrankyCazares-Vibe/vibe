/**
 * Tests for `home-rules.ts` (handoffs/chat-redesign/wave-2-contracts.md 1.2
 * "Messages home", 11.1, 11.2).
 *
 * Run with:
 *   node --test src/components/mobile/messages/home/home-rules.test.ts
 *
 * Dates are built with the local `Date` constructor (the labels format in the
 * device's zone). The resolve hook is the `when.test.ts` pattern: the module
 * imports through the "@/…" alias, which Node's type stripping does not
 * resolve.
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
if (typeof registerHooks !== "function") throw new Error("home-rules.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../../", import.meta.url);
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

const specifier = "./home-rules.ts";
const rules = (await import(specifier)) as typeof import("./home-rules");
type InboxClub = import("@/lib/chat/types").InboxClub;
type ThreadEntry = import("../types").ThreadEntry;
type WeekEntry = import("./home-rules").WeekEntry;

// Thursday Oct 8, 2026, 9:00 PM on the device.
const NOW = new Date(2026, 9, 8, 21, 0, 0);
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0);
const iso = (d: Date) => d.toISOString();

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
    peer: { id: "peer-1", handle: "maya", name: "Maya R.", avatar_url: null, school: null },
    last_message: null,
    accepted_at: null,
    ...over,
  };
}

test("parseHomeFilter / homeUrl: the three named filters, else All; the URL after the last close", () => {
  assert.equal(rules.parseHomeFilter("clubs"), "clubs");
  assert.equal(rules.parseHomeFilter("requests"), "requests");
  assert.equal(rules.parseHomeFilter("chats"), "chats");
  assert.equal(rules.parseHomeFilter("all"), "all");
  assert.equal(rules.parseHomeFilter("x"), "all");
  assert.equal(rules.parseHomeFilter(null), "all");
  assert.equal(rules.homeUrl("all"), "/messages");
  assert.equal(rules.homeUrl("clubs"), "/messages?tab=clubs");
});

test("mergeHomeRows: pinned first (newest pin first), then recency, nulls last, stable", () => {
  const c1 = club({ name: "Salsa Club", last_activity_at: iso(local(2026, 9, 8, 20, 41)) });
  const c2 = club({ name: "Pre-Med Society", last_activity_at: null });
  const c3 = club({ name: "Jag Robotics", last_activity_at: iso(local(2026, 9, 8, 19, 55)), pinned_at: iso(local(2026, 9, 1)) });
  const t1 = thread({ id: "t1", last_message: { content: "hi", created_at: iso(local(2026, 9, 8, 20, 44)), user_id: "peer-1" }, pinned_at: iso(local(2026, 9, 3)) });
  const t2 = thread({ id: "t2", last_message: { content: "yo", created_at: iso(local(2026, 9, 8, 20, 12)), user_id: "peer-1" } });
  const t3 = thread({ id: "t3", last_message: null });
  const rows = rules.mergeHomeRows([c1, c2, c3], [t1, t2, t3]);
  const keys = rows.map((r) => (r.kind === "club" ? r.club.org.name : r.thread.id));
  assert.deepEqual(keys, ["t1", "Jag Robotics", "Salsa Club", "t2", "Pre-Med Society", "t3"]);
});

test("allBadgeCount: unread threads and unread clubs, muted ones left out; badgeText caps at 99+", () => {
  const later = iso(local(2026, 9, 9));
  const earlier = iso(local(2026, 9, 7));
  const threads = [
    thread({ id: "a", unread: true }),
    thread({ id: "b", unread: true, muted_until: later }),
    thread({ id: "c", unread: true, muted_until: earlier }),
    thread({ id: "d", unread: false }),
  ];
  const clubs = [
    club({ name: "A", board: { room_id: "b", latest: null, unread: true } }),
    club({ name: "B", lounge: { room_id: "l", latest: null, unread_count: 4 }, muted_until: later }),
    club({ name: "C", lounge: { room_id: "l", latest: null, unread_count: 2 }, muted_until: earlier }),
    club({ name: "D" }),
  ];
  assert.equal(rules.allBadgeCount(threads, clubs, NOW), 4);
  assert.equal(rules.badgeText(99), "99");
  assert.equal(rules.badgeText(100), "99+");
  assert.equal(rules.isMuted(null, NOW), false);
});

test("clubPreview: the unread Board line with the dot; else the newer of the two; an empty author gives the text alone; nothing when both are null", () => {
  const at = (h: number, mi: number) => iso(local(2026, 9, 8, h, mi));
  const boardMsg = { id: "m1", text: "Formal tonight, doors at 7:30", author_name: "Ana", created_at: at(20, 41), kind: "text" as const };
  const loungeMsg = { id: "m2", text: "who has the HDMI adapter", author_name: "Sam T.", created_at: at(20, 50), kind: "text" as const };
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: boardMsg, unread: true }, lounge: { room_id: "l", latest: loungeMsg, unread_count: 0 } })),
    { prefix: "Board:", text: "Formal tonight, doors at 7:30", dot: true },
  );
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: boardMsg, unread: false }, lounge: { room_id: "l", latest: loungeMsg, unread_count: 4 } })),
    { prefix: "Sam T.:", text: "who has the HDMI adapter", dot: false },
  );
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: { ...boardMsg, created_at: at(21, 0) }, unread: false }, lounge: { room_id: "l", latest: loungeMsg, unread_count: 0 } })),
    { prefix: "Board:", text: "Formal tonight, doors at 7:30", dot: false },
  );
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", lounge: { room_id: "l", latest: { ...loungeMsg, author_name: "" }, unread_count: 0 } })),
    { prefix: null, text: "who has the HDMI adapter", dot: false },
  );
  assert.equal(rules.clubPreview(club({ name: "S" })), null);
  // An unread Board whose only new post is a stub (latest null): the dot rides on the Lounge line.
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: null, unread: true }, lounge: { room_id: "l", latest: loungeMsg, unread_count: 0 } })),
    { prefix: "Sam T.:", text: "who has the HDMI adapter", dot: true },
  );
});

test("clubPreview: a deleted message's note carries deleted, so the row draws it grey italic (Oct 19, 2026)", () => {
  const at = (h: number, mi: number) => iso(local(2026, 9, 8, h, mi));
  const boardNote = { id: "m1", text: "Post deleted", author_name: "Ana", created_at: at(20, 41), kind: "text" as const, deleted: true as const };
  const loungeNote = { id: "m2", text: "Message deleted", author_name: "Sam T.", created_at: at(20, 50), kind: "text" as const, deleted: true as const };
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: boardNote, unread: true } })),
    { prefix: "Board:", text: "Post deleted", dot: true, deleted: true },
  );
  assert.deepEqual(
    rules.clubPreview(club({ name: "S", board: { room_id: "b", latest: boardNote, unread: false }, lounge: { room_id: "l", latest: loungeNote, unread_count: 0 } })),
    { prefix: "Sam T.:", text: "Message deleted", dot: false, deleted: true },
  );
  // A live line never carries the key at all.
  const live = rules.clubPreview(club({ name: "S", lounge: { room_id: "l", latest: { ...loungeNote, text: "hi", deleted: undefined }, unread_count: 0 } }));
  assert.equal(live && "deleted" in live, false);
});

const event = (over: Partial<NonNullable<InboxClub["next_event"]>> = {}): NonNullable<InboxClub["next_event"]> => ({
  id: "e1",
  title: "Fall Formal",
  starts_at: iso(local(2026, 9, 10, 19, 0)),
  ends_at: iso(local(2026, 9, 10, 22, 0)),
  location: "",
  state: "soon",
  room_id: "room-e1",
  viewer_status: null,
  going_count: 0,
  maybe_count: 0,
  ...over,
});

test("clubChip / newCountText: the live chip, the timed chip, the RSVP mark, N new", () => {
  assert.deepEqual(rules.clubChip(club({ name: "S", next_event: event({ state: "live", viewer_status: "going" }) }), NOW), {
    live: true,
    text: "Live now · Fall Formal",
    rsvp: "going",
  });
  assert.deepEqual(rules.clubChip(club({ name: "S", next_event: event({ viewer_status: "maybe" }) }), NOW), {
    live: false,
    text: "Sat 7 PM · Fall Formal",
    rsvp: "maybe",
  });
  assert.equal(rules.clubChip(club({ name: "S" }), NOW), null);
  assert.equal(rules.newCountText(0), null);
  assert.equal(rules.newCountText(4), "4 new");
  assert.equal(rules.newCountText(120), "99+ new");
});

// Oct 19, 2026 (critique D4, B5 review): `No messages yet` must never sit beside a recent time.
test("clubQuietLine: null when the row has a preview, a chip or N new; else the event-chat line when there was activity, No messages yet when none", () => {
  const msg = { id: "m1", text: "hi", author_name: "Ana", created_at: iso(local(2026, 9, 8, 20, 0)), kind: "text" as const };
  assert.equal(rules.clubQuietLine(club({ name: "S", lounge: { room_id: "l", latest: msg, unread_count: 0 } }), NOW), null);
  assert.equal(rules.clubQuietLine(club({ name: "S", next_event: event() }), NOW), null);
  assert.equal(rules.clubQuietLine(club({ name: "S", lounge: { room_id: "l", latest: null, unread_count: 2 } }), NOW), null);
  assert.equal(rules.clubQuietLine(club({ name: "S" }), NOW), "No messages yet");
  // Only an event chat spoke (the inbox counts event-room messages in `last_activity_at`), and that event is over.
  assert.equal(rules.clubQuietLine(club({ name: "S", last_activity_at: iso(local(2026, 9, 8, 18, 0)) }), NOW), "Last message in an event chat");
});

test("clubRowLabel: 1.2's clauses, each only when true, the spoken time last", () => {
  assert.equal(
    rules.clubRowLabel(
      club({
        name: "Salsa Club",
        board: { room_id: "b", latest: null, unread: true },
        next_event: event({ state: "live", viewer_status: "going" }),
        last_activity_at: iso(local(2026, 9, 8, 20, 41)),
      }),
      NOW,
    ),
    "Salsa Club, unread Board post, Fall Formal is live now, you're going, 8:41 PM",
  );
  assert.equal(
    rules.clubRowLabel(
      club({
        name: "Film Society",
        lounge: { room_id: "l", latest: null, unread_count: 4 },
        next_event: event({ title: "Fright Night", viewer_status: "going" }),
        last_activity_at: iso(local(2026, 9, 7, 17, 47)),
      }),
      NOW,
    ),
    "Film Society, 4 new in the Lounge, Fright Night Saturday 7 PM, you're going, Yesterday",
  );
  assert.equal(rules.clubRowLabel(club({ name: "Pre-Med Society", pinned_at: iso(local(2026, 9, 1)) }), NOW), "Pre-Med Society, pinned");
  assert.equal(rules.clubRowTime(club({ name: "X", last_activity_at: iso(local(2026, 9, 7, 17, 47)) }), NOW), "Yesterday");
  assert.equal(rules.clubRowTime(club({ name: "X" }), NOW), "");
});

test("personPreview: You: only when provable (a dm with a peer), <Name>: for a current group member, the text alone otherwise, media fallbacks", () => {
  const lm = (user_id: string, content = "hey") => ({ content, created_at: iso(local(2026, 9, 8, 20, 12)), user_id });
  assert.equal(rules.personPreview(thread({ id: "a", last_message: lm("peer-1") })), "hey");
  assert.equal(rules.personPreview(thread({ id: "a", last_message: lm("me") })), "You: hey");
  const group = thread({
    id: "g",
    type: "group",
    name: "Orgo study group",
    peer: null,
    members: [
      { id: "u-priya", handle: "priya", name: "Priya S.", avatar_url: null, role: "member" },
      { id: "u-jonah", handle: "jonah", name: "Jonah K.", avatar_url: null, role: "member" },
    ],
  });
  assert.equal(rules.personPreview({ ...group, last_message: lm("u-jonah", "practice set is up") }), "Jonah K.: practice set is up");
  // The list sends no viewer id: my own group message and a departed member's both read as the text alone.
  assert.equal(rules.personPreview({ ...group, last_message: lm("me", "on it") }), "on it");
  assert.equal(rules.personPreview({ ...group, last_message: lm("u-gone", "bye all") }), "bye all");
  // A dm whose peer is gone (a removed account): never `You:` by elimination.
  assert.equal(rules.personPreview(thread({ id: "a", peer: null, last_message: lm("someone", "hey") })), "hey");
  assert.equal(rules.personPreview(thread({ id: "a", last_message: { ...lm("peer-1", ""), media_kind: "image" } })), "Photo");
  assert.equal(rules.personPreview(thread({ id: "a", last_message: { ...lm("me", ""), attachment_kind: "post" } })), "You: Shared a post");
  assert.equal(rules.personPreview(thread({ id: "a" })), "No messages yet");
});

test("personRowLabel: <name>, <spoken time>[, unread][, pinned]", () => {
  const t = thread({
    id: "a",
    last_message: { content: "x", created_at: iso(local(2026, 9, 6, 9, 0)), user_id: "peer-1" },
    unread: true,
    pinned_at: iso(local(2026, 9, 1)),
  });
  assert.equal(rules.personRowLabel(t, NOW), "Maya R., Tuesday, unread, pinned");
  assert.equal(rules.personRowLabel(thread({ id: "b" }), NOW), "Maya R.");
});

const week = (over: Partial<WeekEntry> & { id: string }): WeekEntry => ({
  title: "Fall Formal",
  starts_at: iso(local(2026, 9, 8, 19, 30)),
  ends_at: iso(local(2026, 9, 8, 23, 0)),
  viewer_status: "going",
  org: { handle: "salsa-club", name: "Salsa Club" },
  org_id: "org-1",
  room_id: "room-1",
  room_state: "live",
  ...over,
});

test("entriesOn / dayDot / dayLabel: the strip's day, its dot and 1.2's labels", () => {
  const live = week({ id: "a" });
  const fri = week({ id: "b", title: "Fright Night", starts_at: iso(local(2026, 9, 9, 19, 0)), room_state: "soon", org: { handle: "film", name: "Film Society" } });
  const sat = week({ id: "c", title: "Build Night", starts_at: iso(local(2026, 9, 10, 14, 0)), room_state: "soon", viewer_status: "maybe" });
  const sat2 = week({ id: "d", title: "Open Practice", starts_at: iso(local(2026, 9, 10, 9, 0)), room_state: "soon" });
  const all = [live, fri, sat, sat2];
  const thu = local(2026, 9, 8);
  const mon = local(2026, 9, 5);
  const satDay = local(2026, 9, 10);
  assert.deepEqual(rules.entriesOn(satDay, all).map((e) => e.id), ["d", "c"], "sorted by starts_at");
  assert.equal(rules.dayDot(rules.entriesOn(thu, all)), "going");
  assert.equal(rules.dayDot([sat]), "maybe");
  assert.equal(rules.dayDot([]), null);
  assert.equal(rules.dayLabel(mon, [], false), "Monday, October 5, nothing planned");
  assert.equal(rules.dayLabel(thu, [], true), "Thursday, October 8, today, nothing planned");
  assert.equal(rules.dayLabel(thu, [live], true), "Thursday, October 8, today: Fall Formal, going, live now");
  assert.equal(rules.dayLabel(local(2026, 9, 9), [fri], false), "Friday, October 9: Fright Night, going");
  assert.equal(rules.dayLabel(satDay, rules.entriesOn(satDay, all), false), "Saturday, October 10: Open Practice, going; Build Night, interested");
});

test("weekCardLine / weekCardLabel / spokenShort: Live now, Ended, the short time; the spoken label", () => {
  const live = week({ id: "a" });
  const fri = week({ id: "b", title: "Fright Night", starts_at: iso(local(2026, 9, 10, 19, 0)), room_state: "soon", org: { handle: "film", name: "Film Society" } });
  const ended = week({ id: "c", title: "Open Mic", starts_at: iso(local(2026, 9, 6, 19, 0)), room_state: "after", viewer_status: "maybe", org: null });
  assert.deepEqual(rules.weekCardLine(live, NOW), { kind: "live", text: "Live now" });
  assert.deepEqual(rules.weekCardLine(fri, NOW), { kind: "time", text: "Sat 7 PM" });
  assert.deepEqual(rules.weekCardLine(ended, NOW), { kind: "ended", text: "Ended" });
  // S71 amendment 4: on another week the card names the weekday, never the date.
  const later = week({ id: "d", title: "Study Night", starts_at: iso(local(2026, 9, 18, 19, 30)), room_state: "soon" });
  assert.deepEqual(rules.weekCardLine(later, NOW), { kind: "time", text: "Oct 18 7:30 PM" });
  assert.deepEqual(rules.weekCardLine(later, NOW, true), { kind: "time", text: "Sun 7:30 PM" });
  assert.deepEqual(rules.weekCardLine(ended, NOW, true), { kind: "ended", text: "Ended" });
  assert.equal(rules.weekCardLabel(live, NOW), "Fall Formal room, Salsa Club, live now, you're going");
  assert.equal(rules.weekCardLabel(fri, NOW), "Fright Night room, Film Society, Saturday 7 PM, you're going");
  assert.equal(rules.weekCardLabel(ended, NOW), "Open Mic room, ended, you're interested");
  // No chat behind it (Oct 19, 2026): the card opens the club page, so it says "event".
  assert.equal(rules.weekCardLabel({ ...fri, room_id: null }, NOW), "Fright Night event, Film Society, Saturday 7 PM, you're going");
  assert.equal(rules.spokenShort("Fri 7 PM"), "Friday 7 PM");
  assert.equal(rules.spokenShort("Oct 8 7:30 PM"), "October 8 7:30 PM");
  assert.equal(rules.spokenShort("7:30 PM"), "7:30 PM");
  assert.equal(rules.eventStateSpoken("soon", iso(local(2026, 9, 8, 22, 0)), NOW), "10 PM");
});

/* ------------------------------ S71 amendment 4: the month sheet ------------------------------ */

test("dayHeading / planCountText / dayCaption: `Fri, Oct 9` and `Tomorrow · 1 plan`", () => {
  assert.equal(rules.dayHeading(local(2026, 9, 9)), "Fri, Oct 9");
  assert.equal(rules.dayHeading(local(2027, 0, 3)), "Sun, Jan 3");
  assert.equal(rules.planCountText(0), "No plans");
  assert.equal(rules.planCountText(1), "1 plan");
  assert.equal(rules.planCountText(2), "2 plans");
  // NOW is Thursday Oct 8, 9:00 PM.
  assert.equal(rules.dayCaption(local(2026, 9, 8), NOW, 1), "Today · 1 plan");
  assert.equal(rules.dayCaption(local(2026, 9, 9), NOW, 1), "Tomorrow · 1 plan", "three hours away, but the next calendar day");
  assert.equal(rules.dayCaption(local(2026, 9, 9), NOW, 0), "Tomorrow · No plans");
  assert.equal(rules.dayCaption(local(2026, 9, 10), NOW, 2), "2 plans", "no word for any other day");
  assert.equal(rules.dayCaption(local(2026, 9, 7), NOW, 0), "No plans", "yesterday has no word either");
  // Across the 25-hour Nov 1 (DST ends): Sunday is still "Tomorrow" from Saturday.
  assert.equal(rules.dayCaption(local(2026, 10, 1), local(2026, 9, 31, 12, 0), 0), "Tomorrow · No plans");
  assert.equal(rules.dayCaption(local(2026, 10, 2), local(2026, 10, 1, 0, 30), 3), "Tomorrow · 3 plans");
  assert.equal(rules.dayWhen(local(2026, 9, 8), NOW), "Today");
  assert.equal(rules.dayWhen(local(2026, 9, 9), NOW), "Tomorrow");
  assert.equal(rules.dayWhen(local(2026, 9, 10), NOW), null);
  assert.equal(rules.dayWhen(local(2026, 9, 7), NOW), null);
});

test("isPastDay: only a day before today dims", () => {
  assert.equal(rules.isPastDay(local(2026, 9, 7), NOW), true);
  assert.equal(rules.isPastDay(local(2026, 9, 8), NOW), false, "today, even late at night");
  assert.equal(rules.isPastDay(local(2026, 9, 9), NOW), false);
});

test("monthDayLabel: the grid day's label, with today, selected, the counts and live now", () => {
  const live = week({ id: "a" });
  const fri = week({ id: "b", title: "Fright Night", starts_at: iso(local(2026, 9, 9, 19, 0)), room_state: "soon" });
  const maybe = week({ id: "c", title: "Build Night", starts_at: iso(local(2026, 9, 10, 14, 0)), room_state: "soon", viewer_status: "maybe" });
  const maybe2 = week({ id: "d", title: "Open Mic", starts_at: iso(local(2026, 9, 10, 20, 0)), room_state: "soon", viewer_status: "maybe" });
  const going2 = week({ id: "e", title: "Open Practice", starts_at: iso(local(2026, 9, 10, 9, 0)), room_state: "soon" });
  const off = { today: false, selected: false };
  assert.equal(rules.monthDayLabel(local(2026, 9, 1), [], off), "Thursday, October 1, nothing planned");
  assert.equal(rules.monthDayLabel(local(2026, 9, 8), [live], { today: true, selected: false }), "Thursday, October 8, today, 1 event you're going to, live now");
  assert.equal(rules.monthDayLabel(local(2026, 9, 9), [fri], { today: false, selected: true }), "Friday, October 9, selected, 1 event you're going to");
  assert.equal(rules.monthDayLabel(local(2026, 9, 10), [maybe], off), "Saturday, October 10, 1 event you're interested in");
  assert.equal(rules.monthDayLabel(local(2026, 9, 10), [maybe, maybe2], off), "Saturday, October 10, 2 events you're interested in");
  assert.equal(rules.monthDayLabel(local(2026, 9, 10), [going2, maybe, maybe2], off), "Saturday, October 10, 1 event you're going to, 2 you're interested in");
  assert.equal(rules.monthDayLabel(local(2026, 9, 8), [], { today: true, selected: true }), "Thursday, October 8, today, selected, nothing planned");
  assert.equal(rules.spokenDay(local(2026, 9, 8)), "Thursday October 8");
});

test("planRows: the day's plans by start, `<club> · <time>`, the label, and no club", () => {
  const late = week({ id: "late", title: "Fright Night", starts_at: iso(local(2026, 9, 9, 19, 0)), room_state: "soon", org: { handle: "film", name: "Film Society" } });
  const early = week({ id: "early", title: "Build Night", starts_at: iso(local(2026, 9, 9, 14, 30)), room_state: "soon", viewer_status: "maybe", room_id: null });
  const noClub = week({ id: "solo", title: "Study Jam", starts_at: iso(local(2026, 9, 9, 23, 30)), room_state: null, room_id: null, org: null, org_id: null });
  const otherDay = week({ id: "other", starts_at: iso(local(2026, 9, 10, 0, 0)) });
  const rows = rules.planRows(local(2026, 9, 9), [late, noClub, otherDay, early]);
  assert.deepEqual(rows.map((r) => r.entry.id), ["early", "late", "solo"], "sorted by start; midnight of the next day is not this day's");
  assert.deepEqual(rows.map((r) => r.line), ["Salsa Club · 2:30 PM", "Film Society · 7 PM", "11:30 PM"]);
  assert.deepEqual(rows.map((r) => r.time), ["2:30 PM", "7 PM", "11:30 PM"]);
  assert.deepEqual(rows.map((r) => r.club), ["Salsa Club", "Film Society", null]);
  assert.equal(rows[1].label, "Fright Night, Film Society, Friday October 9 at 7 PM, you're going. Open the event room");
  assert.equal(rows[0].label, "Build Night, Salsa Club, Friday October 9 at 2:30 PM, you're interested", "no room: nothing to open");
  assert.equal(rows[2].label, "Study Jam, Friday October 9 at 11:30 PM, you're going");
  assert.deepEqual(rules.planRows(local(2026, 9, 12), [late, early]), []);
});

test("planRows: the time is the event's own clock, whatever today is", () => {
  // A plan months away still reads `7 PM`, never `Mar 12 7 PM`.
  const far = week({ id: "far", title: "Spring Gala", starts_at: iso(local(2027, 2, 12, 19, 0)), room_state: "soon" });
  const rows = rules.planRows(local(2027, 2, 12), [far]);
  assert.equal(rows[0].time, "7 PM");
  assert.equal(rows[0].line, "Salsa Club · 7 PM");
  assert.equal(rows[0].label, "Spring Gala, Salsa Club, Friday March 12 at 7 PM, you're going. Open the event room");
});

test("sheetReturnFocus: the opener while it is on the page, else the week's title, nothing when an event chat is opening", () => {
  const day = { isConnected: true, name: "day" };
  const gone = { isConnected: false, name: "a day of the week the strip left" };
  const title = { isConnected: true, name: "title" };
  // The strip stayed on its week: back to the day (or the title) that was pressed.
  assert.equal(rules.sheetReturnFocus(day, title, false), day);
  assert.equal(rules.sheetReturnFocus(title, title, false), title);
  // The strip moved to the picked day's week: the pressed day is gone, the title takes it.
  assert.equal(rules.sheetReturnFocus(gone, title, false), title);
  assert.equal(rules.sheetReturnFocus(null, title, false), title, "no opener known");
  // Nothing left to focus: no call at all (never a detached node).
  assert.equal(rules.sheetReturnFocus(gone, null, false), null);
  assert.equal(rules.sheetReturnFocus(gone, { isConnected: false, name: "title" }, false), null);
  // A plan row opened its event chat: the home under it takes no focus.
  assert.equal(rules.sheetReturnFocus(day, title, true), null);
  assert.equal(rules.sheetReturnFocus(gone, title, true), null);
});

test("calendarUrl / rsvpEntries: the read's address, and only well-formed rsvp entries come back", () => {
  const from = local(2026, 9, 5);
  const to = new Date(2026, 9, 11, 23, 59, 59, 999);
  assert.equal(rules.calendarUrl(from, to), `/api/me/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
  assert.equal(rules.rsvpEntries(null), null);
  assert.equal(rules.rsvpEntries({ ok: true }), null, "no entries array: the read failed");
  assert.deepEqual(rules.rsvpEntries({ entries: [] }), []);
  const got = rules.rsvpEntries({
    entries: [
      { kind: "rsvp", id: "a", title: "Fall Formal", starts_at: "2026-10-08T23:30:00.000Z", ends_at: "2026-10-09T03:00:00.000Z", location: "Hall", color: "#5BD18C", viewer_status: "going", org: { handle: "salsa", name: "Salsa Club", verified: true }, org_id: "org-1", room_id: "room-1", room_state: "live" },
      { kind: "rsvp", id: "b", title: "Open Mic", starts_at: "2026-10-09T23:00:00.000Z", ends_at: "2026-10-10T01:00:00.000Z", viewer_status: "maybe", org: null },
      { kind: "personal", id: "p", title: "Dentist", starts_at: "2026-10-09T15:00:00.000Z", ends_at: null },
      { kind: "rsvp", id: 7, title: "No id", starts_at: "2026-10-09T15:00:00.000Z" },
      null,
    ],
  });
  assert.deepEqual(got, [
    { id: "a", title: "Fall Formal", starts_at: "2026-10-08T23:30:00.000Z", ends_at: "2026-10-09T03:00:00.000Z", viewer_status: "going", org: { handle: "salsa", name: "Salsa Club" }, org_id: "org-1", room_id: "room-1", room_state: "live" },
    { id: "b", title: "Open Mic", starts_at: "2026-10-09T23:00:00.000Z", ends_at: "2026-10-10T01:00:00.000Z", viewer_status: "maybe", org: null, org_id: null, room_id: null, room_state: null },
  ]);
});
