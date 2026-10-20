/**
 * Tests for club/helpers.ts (handoffs/chat-redesign/wave-2-contracts.md 1.2
 * "Inside a club", 11.3-11.6; W2-S2): the date separators rule over non-stub
 * rows, the event chip's state word, and the assembled labels.
 *
 * Run with:
 *   node --test src/components/mobile/messages/club/helpers.test.ts
 *
 * The resolve hook is when.test.ts's: `helpers.ts` imports `@/lib/chat/when`,
 * which Node's type stripping does not resolve. Dates are built with the local
 * `Date` constructor so the answers do not depend on TZ.
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
if (typeof registerHooks !== "function") throw new Error("helpers.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./helpers.ts";
const h = (await import(specifier)) as typeof import("./helpers");

// Thursday Oct 8, 2026, 9:00 PM on the device.
const NOW = new Date(2026, 9, 8, 21, 0, 0);
const local = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m, d, hh, mm, 0);
const iso = (d: Date) => d.toISOString();
const ev = (starts: Date, ends: Date, state: "soon" | "live" | "after" | "closed") => ({
  starts_at: iso(starts),
  ends_at: iso(ends),
  state,
});

test("roleWord / hatLine / isOfficer", () => {
  assert.equal(h.roleWord("owner"), "Owner");
  assert.equal(h.roleWord("admin"), "Officer");
  assert.equal(h.roleWord("mod"), "Mod");
  assert.equal(h.roleWord("member"), "Member");
  assert.equal(h.roleWord(null), "");
  assert.equal(h.hatLine("admin", 48), "Your hat: Officer · 48 members");
  assert.equal(h.hatLine("owner", 1), "Your hat: Owner · 1 member");
  assert.equal(h.isOfficer("mod"), false);
  assert.equal(h.isOfficer("admin"), true);
});

test("chipStateWord: tonight / today / live now / ended / eventTimeShort", () => {
  // Tonight 10:30 PM, 90 minutes away: soon within 24 h, starts at or after 17:00.
  assert.equal(h.chipStateWord(ev(local(2026, 9, 8, 22, 30), local(2026, 9, 9, 1, 0), "soon"), NOW), "tonight");
  // Tomorrow 10 AM, 13 hours away: soon within 24 h, before 17:00 → `today` (the contract's literal rule).
  assert.equal(h.chipStateWord(ev(local(2026, 9, 9, 10, 0), local(2026, 9, 9, 12, 0), "soon"), NOW), "today");
  // Live: the server's state, not soon.
  assert.equal(h.chipStateWord(ev(local(2026, 9, 8, 19, 0), local(2026, 9, 8, 23, 0), "live"), NOW), "live now");
  // Ended yesterday.
  assert.equal(h.chipStateWord(ev(local(2026, 9, 7, 19, 0), local(2026, 9, 7, 21, 0), "after"), NOW), "ended");
  // Next Tuesday, outside 24 h: `eventTimeShort`.
  assert.equal(h.chipStateWord(ev(local(2026, 9, 13, 19, 0), local(2026, 9, 13, 21, 0), "soon"), NOW), "Tue 7 PM");
});

test("chipLabel / chipAriaLabel", () => {
  const board = { kind: "board" as const, name: "Board", unread: true, event: null };
  assert.equal(h.chipAriaLabel(board, NOW), "Board, 1 unread post");
  assert.equal(h.chipAriaLabel({ ...board, unread: false }, NOW), "Board");
  assert.equal(h.chipAriaLabel({ kind: "officers", name: "Officers", unread: false, event: null }, NOW), "Officers, only officers see this room");
  const event = {
    kind: "event" as const,
    name: "Fall Formal",
    unread: false,
    event: {
      id: "e1",
      title: "Fall Formal",
      ...ev(local(2026, 9, 8, 22, 30), local(2026, 9, 9, 1, 0), "soon"),
      location: "",
      room_id: "r1",
      viewer_status: null,
      going_count: 0,
      maybe_count: 0,
    },
  };
  assert.equal(h.chipLabel(event), "Fall Formal");
  assert.equal(h.chipAriaLabel(event, NOW), "Fall Formal, event chat, tonight");
  // An extra room (wave-3 desktop contract 4c.3): the visible text is the
  // label unless only some members see it; `locked` absent reads as open.
  assert.equal(h.chipAriaLabel({ kind: "room", name: "Alumni", unread: false, event: null }, NOW), null);
  assert.equal(h.chipAriaLabel({ kind: "room", name: "Alumni", unread: false, event: null, locked: false }, NOW), null);
  assert.equal(h.chipAriaLabel({ kind: "room", name: "Alumni", unread: false, event: null, locked: true }, NOW), "Alumni, only some members see this room");
  assert.equal(h.chipAriaLabel({ kind: "room", name: "exec-only", unread: true, event: null, locked: true }, NOW), "Exec only, only some members see this room");
  // `locked` changes no other kind's label: the Lounge has none, the Officers room keeps its own, an event chat its state word.
  assert.equal(h.chipAriaLabel({ kind: "lounge", name: "Lounge", unread: false, event: null, locked: true }, NOW), null);
  assert.equal(h.chipAriaLabel({ kind: "officers", name: "Officers", unread: false, event: null, locked: true }, NOW), "Officers, only officers see this room");
  assert.equal(h.chipAriaLabel({ ...event, locked: true }, NOW), "Fall Formal, event chat, tonight");
  assert.equal(h.chipLabel({ kind: "lounge", name: "Lounge", event: null }), "Lounge");
});

test("chipLabel: an extra room's stored name reads as words, nothing else is rewritten", () => {
  assert.equal(h.chipLabel({ kind: "room", name: "exec-only", event: null }), "Exec only");
  assert.equal(h.chipLabel({ kind: "room", name: "rush_chairs", event: null }), "Rush chairs");
  assert.equal(h.chipLabel({ kind: "room", name: "Alumni", event: null }), "Alumni");
  // The three core rooms keep their fixed words whatever is stored.
  assert.equal(h.chipLabel({ kind: "board", name: "board", event: null }), "Board");
  assert.equal(h.chipLabel({ kind: "officers", name: "officers", event: null }), "Officers");
  // An event's title is shown as written (never through the room-name rule).
  assert.equal(h.chipLabel({ kind: "event", name: "fall-formal", event: null }), "fall-formal");
  const titled = { id: "e2", title: "Kick-off: day_one", starts_at: iso(local(2026, 9, 13, 19, 0)), ends_at: iso(local(2026, 9, 13, 21, 0)), state: "soon" as const, location: "", room_id: "r2", viewer_status: null, going_count: 0, maybe_count: 0 };
  assert.equal(h.chipLabel({ kind: "event", name: "x", event: titled }), "Kick-off: day_one");
});

test("upNextLine / upNextAriaLabel / eventTimeSpoken", () => {
  const soon = { title: "Fall Formal", viewer_status: "going" as const, ...ev(local(2026, 9, 8, 22, 30), local(2026, 9, 9, 1, 0), "soon") };
  assert.equal(h.upNextLine(soon, NOW), "Tonight · 10:30 PM");
  assert.equal(h.upNextAriaLabel(soon, NOW), "Fall Formal room, soon, tonight 10:30 PM, you're going");
  const maybe = { title: "Open Practice", viewer_status: "maybe" as const, ...ev(local(2026, 9, 13, 19, 0), local(2026, 9, 13, 21, 0), "soon") };
  assert.equal(h.upNextLine(maybe, NOW), "Tue · 7 PM");
  assert.equal(h.upNextAriaLabel(maybe, NOW), "Open Practice room, Tuesday 7 PM, you're interested");
  const live = { title: "Fall Formal", viewer_status: null, ...ev(local(2026, 9, 8, 19, 0), local(2026, 9, 8, 23, 0), "live") };
  assert.equal(h.upNextLine(live, NOW), "Live now");
  assert.equal(h.upNextAriaLabel(live, NOW), "Fall Formal room, live now");
  // No chat to enter (a follower's tile): the tile opens the event, and says so.
  assert.equal(h.upNextAriaLabel({ ...live, room_id: null }, NOW), "Fall Formal event, live now");
  assert.equal(h.upNextAriaLabel({ ...live, room_id: "r1" }, NOW), "Fall Formal room, live now");
  assert.equal(h.eventTimeSpoken(iso(local(2026, 10, 20, 19, 30)), NOW), "November 20 7:30 PM");
  assert.equal(h.eventTimeSpoken(iso(local(2026, 9, 9, 9, 0)), NOW), "tomorrow 9 AM");
});

test("separators: first row, a day change, a > 1 h gap, computed over non-stub rows", () => {
  const rows = [
    { id: "a", created_at: iso(local(2026, 9, 7, 20, 0)) },
    { id: "b", created_at: iso(local(2026, 9, 7, 20, 30)) }, // 30 min: no
    { id: "c", created_at: iso(local(2026, 9, 7, 22, 0)) }, // 90 min: yes
    { id: "s1", created_at: iso(local(2026, 9, 8, 9, 0)), hidden: true }, // a stub: never, and not "previous"
    { id: "d", created_at: iso(local(2026, 9, 8, 9, 10)) }, // a new day after c: yes
    { id: "e", created_at: iso(local(2026, 9, 8, 9, 20)) }, // 10 min after d: no
  ];
  assert.deepEqual([...h.separatorIds(rows)], ["a", "c", "d"]);
  // A stub first: the first visible row gets the separator, the stub nothing.
  const stubFirst = [{ id: "s", created_at: iso(local(2026, 9, 8, 9, 0)), hidden: true }, { id: "x", created_at: iso(local(2026, 9, 8, 9, 5)) }];
  assert.deepEqual([...h.separatorIds(stubFirst)], ["x"]);
  assert.equal(h.shouldShowSep(null, iso(NOW)), true);
  assert.equal(h.shouldShowSep("not a date", iso(NOW)), false);
  assert.equal(h.sepLabel(iso(local(2026, 9, 8, 9, 0)), NOW), "Today");
  assert.equal(h.sepLabel(iso(local(2026, 9, 7, 9, 0)), NOW), "Yesterday");
  assert.equal(h.sepLabel(iso(local(2026, 9, 5, 9, 0)), NOW), "Mon");
  assert.equal(h.sepLabel(iso(local(2026, 8, 5, 9, 0)), NOW), "Sep 5");
});

test("replies toggle, post label, pill, who's going, RSVP pill", () => {
  assert.equal(h.repliesToggleText(0), "Reply");
  assert.equal(h.repliesToggleText(null), "Reply");
  assert.equal(h.repliesToggleText(1), "1 reply");
  assert.equal(h.repliesToggleText(3), "3 replies");
  assert.equal(h.repliesToggleLabel(3, false), "Show 3 replies. Replies don't notify anyone.");
  assert.equal(h.repliesToggleLabel(1, true), "Hide 1 reply. Replies don't notify anyone.");
  assert.equal(h.repliesToggleLabel(0, false), "Reply. Replies don't notify anyone.");
  assert.equal(h.postAriaLabel("Maya R.", "owner", "6:12 PM"), "Board post from Maya R., Owner, 6:12 PM");
  assert.equal(h.postAriaLabel("Devin O.", null, "Wednesday"), "Board post from Devin O., Wednesday");
  assert.equal(h.statePillText(ev(local(2026, 9, 8, 22, 30), local(2026, 9, 9, 1, 0), "soon"), NOW), "Soon · starts 10:30 PM");
  assert.equal(h.statePillText(ev(local(2026, 9, 8, 19, 0), local(2026, 9, 8, 23, 0), "live"), NOW), "Live now");
  assert.equal(h.statePillText(ev(local(2026, 9, 7, 19, 0), local(2026, 9, 7, 21, 0), "after"), NOW), "Ended · chat open 6 more days");
  assert.equal(h.statePillText(ev(local(2026, 9, 1, 19, 0), local(2026, 9, 1, 22, 0), "after"), NOW), "Ended · chat open 1 more day");
  assert.equal(h.statePillText(ev(local(2026, 8, 1, 19, 0), local(2026, 8, 1, 22, 0), "closed"), NOW), "Closed");
  assert.equal(h.whoIsGoingLabel(18, 6), "Who's going: 18 going, 6 interested");
  assert.deepEqual(h.rsvpPill("going"), { text: "Going", label: "You're going. Change your RSVP" });
  // "Interested", not "Maybe" (Oct 19, 2026, decision 12).
  assert.equal(h.rsvpWord("going"), "Going");
  assert.equal(h.rsvpWord("maybe"), "Interested");
  assert.equal(h.rsvpWord(null), null);
  assert.deepEqual(h.rsvpPill("maybe"), { text: "Interested", label: "You're interested. Change your RSVP" });
  assert.deepEqual(h.rsvpPill(null), { text: "RSVP", label: "RSVP to this event" });
});

test("composer placeholders, send label, empty lines, the Board strip label, emptiness", () => {
  assert.equal(h.composerPlaceholder("lounge", "Lounge"), "Message the Lounge");
  assert.equal(h.composerPlaceholder("board", "Board"), "Post to the Board");
  assert.equal(h.composerPlaceholder("event", "Fall Formal"), "Message the event chat");
  assert.equal(h.composerPlaceholder("room", "Alumni"), "Message Alumni");
  assert.equal(h.composerPlaceholder("officers", "Officers"), "Message Officers");
  assert.equal(h.sendLabel("board"), "Post to the Board");
  assert.equal(h.sendLabel("lounge"), "Send");
  assert.equal(h.emptyLine("lounge", "Salsa Club"), "Say hi to Salsa Club.");
  assert.equal(h.emptyLine("room", "Salsa Club"), "Say hi to Salsa Club.");
  assert.equal(h.emptyLine("board", "Salsa Club"), "Nothing on the Board yet.");
  assert.equal(h.emptyLine("event", "Salsa Club"), "Say hi to everyone going.");
  assert.equal(
    h.boardStripLabel("Maya R.", "Formal tonight: doors at 7:30", true),
    "Latest from the Board, unread. Maya R.: Formal tonight: doors at 7:30. Open the Board",
  );
  assert.equal(h.boardStripLabel("Maya R.", "Hi", false), "Latest from the Board. Maya R.: Hi. Open the Board");
  assert.equal(h.isEmptyRoom(null), false);
  assert.equal(h.isEmptyRoom([]), true);
  assert.equal(h.isEmptyRoom([{ hidden: true }, { hidden: true }]), true);
  assert.equal(h.isEmptyRoom([{ hidden: true }, { hidden: false }]), false);
  assert.equal(h.authorName(null), "Someone");
  assert.equal(h.authorName({ name: "", handle: "maya" }), "maya");
});

test("refusedSend: which refusals turn the composer into the tile, and the one that reads the room again at once", () => {
  assert.deepEqual(h.refusedSend("board_officers_only"), { tile: true, reread: false });
  assert.deepEqual(h.refusedSend("room_closed"), { tile: true, reread: false });
  // The viewer on screen still says `can_post` and has no `post_line`: only a full read brings the sentence.
  assert.deepEqual(h.refusedSend("room_posters_only"), { tile: true, reread: true });
  // Any other refusal, or none, leaves the composer where it is.
  assert.deepEqual(h.refusedSend("rate_limited"), { tile: false, reread: false });
  assert.deepEqual(h.refusedSend("content_blocked"), { tile: false, reread: false });
  assert.deepEqual(h.refusedSend(null), { tile: false, reread: false });
  assert.deepEqual(h.refusedSend(undefined), { tile: false, reread: false });
});

// ── Followers (club model, Oct 16): a follower reads the Board and nothing else ──

test("isFollower: only a viewer that says standing follower", () => {
  assert.equal(h.isFollower({ standing: "follower" }), true);
  assert.equal(h.isFollower({ role: "member" }), false);
  assert.equal(h.isFollower({ standing: "member" }), false);
  assert.equal(h.isFollower(null), false);
  assert.equal(h.isFollower(undefined), false);
});

test("followerHatLine: the count from 5 up, never `null members`", () => {
  assert.equal(h.followerHatLine(12), "Following · 12 members");
  assert.equal(h.followerHatLine(5), "Following · 5 members");
  assert.equal(h.followerHatLine(null), "Following");
  assert.equal(h.followerHatLine(undefined), "Following");
  assert.equal(h.followerHatLine(Number.NaN), "Following");
});

test("follower lines: the Board's intro, a post's label, a reaction as a count", () => {
  assert.equal(h.FOLLOWER_POST_LINE, "Only members post here.");
  assert.equal(h.followerBoardIntro("SAE"), "News from SAE's officers.");
  assert.equal(h.followerBoardIntro("  "), "News from the club's officers.");
  assert.equal(h.followerPostLabel("SAE", "8:44 PM"), "Board post from SAE, 8:44 PM");
  assert.equal(h.followerPostLabel("", ""), "Board post from the club");
  assert.equal(h.reactionCountLabel("🎉", 3), "3 reactions with 🎉");
  assert.equal(h.reactionCountLabel("🔥", 1), "1 reaction with 🔥");
});

test("followedBoardLabel: the club, that I follow it, the latest post and its time; never an author", () => {
  const org = { id: "o1", handle: "sae", name: "SAE", logo_url: null, banner_url: null, verified: false };
  const latest = { id: "m1", text: "Chapter at 7", author_name: "", created_at: iso(local(2026, 9, 8, 20, 44)), kind: "text" as const };
  assert.equal(h.followedBoardLabel({ org, latest }, NOW), "SAE Board, you follow this club, latest: Chapter at 7, 8:44 PM");
  assert.equal(h.followedBoardLabel({ org, latest: null }, NOW), "SAE Board, you follow this club, nothing on the Board yet");
  assert.equal(h.followedBoardLabel({ org, latest }, NOW, true), "SAE Board, you follow this club, new post, latest: Chapter at 7, 8:44 PM");
  // New: later than the newest post this browser showed; never seen, any post.
  assert.equal(h.boardHasNew(latest.created_at, null), true);
  assert.equal(h.boardHasNew(latest.created_at, latest.created_at), false);
  assert.equal(h.boardHasNew(latest.created_at, "2000-01-01T00:00:00Z"), true);
  assert.equal(h.boardHasNew(null, null), false, "an empty Board is never new");
  assert.equal(h.boardHasNew("2000-01-01T00:00:00Z", latest.created_at), false);
});

test("followerRelation: the club GET's org as the phone Orgs tab reads it; null on anything unknown", () => {
  const body = {
    handle: "sae",
    name: "SAE",
    join_state: "can_request",
    org_follow_state: "following",
    viewer_role: null,
    join_reason: "policy",
    audience: "iu",
    join_policy: "request",
  };
  assert.deepEqual(h.followerRelation(body), {
    handle: "sae",
    orgName: "SAE",
    state: "can_request",
    following: true,
    role: null,
    reason: "policy",
    audience: "iu",
    joinPolicy: "request",
  });
  // Not following yet, an open club, odd fields read as their safe defaults.
  const open = h.followerRelation({ ...body, join_state: "can_join", org_follow_state: "not_following", join_reason: "?", audience: 7, join_policy: "open" });
  assert.equal(open?.following, false);
  assert.equal(open?.reason, null);
  assert.equal(open?.audience, "both");
  assert.equal(open?.joinPolicy, "open");
  // A member always follows.
  assert.equal(h.followerRelation({ ...body, join_state: "member", org_follow_state: "not_following", viewer_role: "member" })?.following, true);
  // Nothing to build a button from.
  assert.equal(h.followerRelation(null), null);
  assert.equal(h.followerRelation("sae"), null);
  assert.equal(h.followerRelation({ ...body, join_state: "owner" }), null);
  assert.equal(h.followerRelation({ ...body, handle: "" }), null);
});

test("memberSpace: a member's space as it is; a follower's, or none, is null", () => {
  const org = { id: "o1", handle: "sae", name: "SAE", logo_url: null, banner_url: null, verified: false };
  const member = { ok: true as const, org: { ...org, member_count: 3 }, viewer: { role: "member" as const, can_moderate: false }, rooms: [], board_latest: null, up_next: [] };
  const follower = { ok: true as const, org: { ...org, member_count: null }, viewer: { role: null, standing: "follower" as const, can_moderate: false as const }, rooms: [], board_latest: null, up_next: [] };
  assert.equal(h.memberSpace(member), member);
  assert.equal(h.memberSpace(follower), null);
  assert.equal(h.memberSpace(null), null);
  assert.equal(h.memberSpace(undefined), null);
});

test("boardsMatching: the club's name or handle, whatever the case; all of them for no query", () => {
  const ref = (name: string, handle: string) => ({ org: { id: handle, handle, name, logo_url: null, banner_url: null, verified: false } });
  const boards = [ref("Sigma Alpha Epsilon", "sae"), ref("Chess Club", "chess_club")];
  assert.deepEqual(h.boardsMatching(boards, "").map((b) => b.org.handle), ["sae", "chess_club"]);
  assert.deepEqual(h.boardsMatching(boards, "  ").map((b) => b.org.handle), ["sae", "chess_club"]);
  assert.deepEqual(h.boardsMatching(boards, "ALPHA").map((b) => b.org.handle), ["sae"]);
  assert.deepEqual(h.boardsMatching(boards, "chess_").map((b) => b.org.handle), ["chess_club"]);
  assert.deepEqual(h.boardsMatching(boards, "zzz"), []);
});
