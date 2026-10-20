/**
 * Tests for `room-rules.ts` (who posts on a Board, who may remove whose
 * message, how a club room is named, which code a refused send gets) and for
 * the refusal sentences in `types.ts`
 * (handoffs/chat-redesign/wave-1-contracts.md sections 1, 6.0, 6.2, 6.3),
 * and for wave 3's room rules: the post policies, the line a room shows to
 * someone who may not post, the cap on extra rooms
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.3, 4c.3).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/chat/room-rules.test.ts
 *
 * Both files import types only, which Node erases, so they load through a
 * dynamic import of their ".ts" path with no resolve hook (the
 * push/config.test.ts pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const rulesSpecifier = "./room-rules.ts";
const typesSpecifier = "./types.ts";
const {
  BOARD_POSTER_ROLES,
  EXTRA_ROOM_CAP,
  OFFICER_REMOVED_REASON,
  POST_POLICIES,
  ROOM_MODERATOR_ROLES,
  canModerate,
  clubRoomLabel,
  isClubRole,
  isPostPolicy,
  isRoomKind,
  outranks,
  postRefusal,
  postRuleLine,
} = (await import(rulesSpecifier)) as typeof import("./room-rules");
const { REFUSAL_SENTENCES, refusalBody } = (await import(typesSpecifier)) as typeof import("./types");

type ClubRole = import("./types").ClubRole;
type PostPolicy = import("./types").PostPolicy;
type Room = import("./types").Room;
type RoomKind = import("./types").RoomKind;

const ROLES: (ClubRole | null)[] = ["owner", "admin", "member", null];

/** A value the types forbid but the database or a caller could still send. */
const odd = <T>(value: unknown) => value as T;

function room(kind: RoomKind, name = kind as string): Room {
  const event =
    kind === "event"
      ? { id: "e1", title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z", ends_at: "2026-10-09T03:00:00Z" }
      : null;
  return { id: "r1", kind, name, org_id: "o1", event };
}

/** An extra room with its post policy set, as `loadRoom` hands it on. */
function extraRoom(policy: PostPolicy, name = "exec-only"): Room {
  return { ...room("room", name), post_policy: policy };
}

// ---------------------------------------------------------------------------
// The two lists and the reason
// ---------------------------------------------------------------------------

test("the owner and officers post on a Board and moderate; there are no mods (20261021100000)", () => {
  assert.deepEqual([...BOARD_POSTER_ROLES], ["owner", "admin"]);
  assert.deepEqual([...ROOM_MODERATOR_ROLES], ["owner", "admin"]);
});

test("the two lists cannot be changed by a caller", () => {
  assert.throws(() => (BOARD_POSTER_ROLES as ClubRole[]).push("member"));
  assert.throws(() => (ROOM_MODERATOR_ROLES as ClubRole[]).push("member"));
  assert.deepEqual([...BOARD_POSTER_ROLES], ["owner", "admin"]);
});

test("the officer's removal reason is the contract's sentence, to the letter", () => {
  assert.equal(OFFICER_REMOVED_REASON, "Removed by a club officer.");
});

test("room kinds and club roles are told from anything else", () => {
  for (const kind of ["board", "lounge", "officers", "event", "room"]) assert.equal(isRoomKind(kind), true, kind);
  for (const bad of ["Board", " board", "general", "announcements", "dm", "", null, undefined, 1, {}]) {
    assert.equal(isRoomKind(bad), false, String(bad));
  }
  for (const role of ["owner", "admin", "member"]) assert.equal(isClubRole(role), true, role);
  for (const bad of ["mod", "Owner", "officer", "moderator", "guest", "", null, undefined, 3, []]) {
    assert.equal(isClubRole(bad), false, String(bad));
  }
});

// ---------------------------------------------------------------------------
// Extra rooms: the cap, the post policies, the line (wave 3, 4c.3)
// ---------------------------------------------------------------------------

test("a club holds at most five extra rooms", () => {
  assert.equal(EXTRA_ROOM_CAP, 5);
  assert.equal(REFUSAL_SENTENCES.room_limit.includes(`${EXTRA_ROOM_CAP} extra rooms`), true, "the sentence names the cap");
});

test("the three post policies, in the contract's order, and a caller cannot change them", () => {
  assert.deepEqual([...POST_POLICIES], ["everyone", "officers", "listed"]);
  assert.throws(() => (POST_POLICIES as unknown as string[]).push("mods"));
  assert.deepEqual([...POST_POLICIES], ["everyone", "officers", "listed"]);
});

test("a post policy is told from anything else", () => {
  for (const policy of ["everyone", "officers", "listed"]) assert.equal(isPostPolicy(policy), true, policy);
  for (const bad of ["Everyone", " officers", "listed ", "members", "mods", "owner", "all", "", null, undefined, 0, true, [], {}, ["officers"]]) {
    assert.equal(isPostPolicy(bad), false, JSON.stringify(bad));
  }
});

test("the line a room shows to someone who may read but not post, word for word", () => {
  assert.equal(postRuleLine("officers"), "Only officers post here.");
  assert.equal(postRuleLine("listed"), "Only officers and people they picked post here.");
  assert.equal(postRuleLine("everyone"), null, "nobody is kept out, so there is no line");
});

test("a value that is not a policy gets no line", () => {
  for (const bad of ["Officers", "members", "", null, undefined]) {
    assert.equal(postRuleLine(odd<PostPolicy>(bad)), null, String(bad));
  }
});

test("each line reads as a sentence and keeps to the product's words", () => {
  for (const policy of POST_POLICIES) {
    const line = postRuleLine(policy);
    if (line === null) continue;
    assert.equal(/#|channel|server|thread|admin|owner/i.test(line), false, line);
    assert.equal(line.endsWith("."), true, line);
  }
});

// ---------------------------------------------------------------------------
// canModerate
// ---------------------------------------------------------------------------

test("the owner and officers moderate; members and strangers do not", () => {
  assert.equal(canModerate("owner"), true);
  assert.equal(canModerate("admin"), true);
  assert.equal(canModerate("member"), false);
  assert.equal(canModerate(null), false);
});

test("an unknown role never moderates", () => {
  for (const bad of ["mod", "Owner", "ADMIN", "officer", "moderator", "", " mod", undefined, 3, true, {}]) {
    assert.equal(canModerate(odd<ClubRole>(bad)), false, String(bad));
  }
});

// ---------------------------------------------------------------------------
// outranks
// ---------------------------------------------------------------------------

test("the rank table: who may remove whose message", () => {
  // Rows = the caller, columns = the author: owner, admin, member, gone.
  const expected: Record<string, boolean[]> = {
    owner: [true, true, true, true],
    admin: [false, true, true, true],
    member: [false, false, false, false],
    null: [false, false, false, false],
  };
  for (const caller of ROLES) {
    ROLES.forEach((author, column) => {
      assert.equal(
        outranks(caller, author),
        expected[String(caller)][column],
        `caller ${String(caller)}, author ${String(author)}`,
      );
    });
  }
});

test("equal rank is allowed only from officer up", () => {
  assert.equal(outranks("admin", "admin"), true, "an officer may remove another officer's message");
  assert.equal(outranks("admin", "owner"), false, "an officer can't remove the owner's");
  assert.equal(outranks("owner", "owner"), true);
  assert.equal(outranks("member", "member"), false);
  assert.equal(outranks(null, null), false);
  assert.equal(outranks("member", null), false);
  assert.equal(outranks(null, "member"), false);
});

test("an unknown role ranks with someone who left", () => {
  assert.equal(outranks(odd<ClubRole>("superadmin"), "member"), false, "an unknown caller removes nothing");
  assert.equal(outranks(odd<ClubRole>("OWNER"), "member"), false, "roles are not matched by case");
  assert.equal(outranks(odd<ClubRole>(undefined), null), false);
  assert.equal(outranks("admin", odd<ClubRole>("superadmin")), true, "an unknown author has no rank");
  assert.equal(outranks("admin", odd<ClubRole>(undefined)), true);
  assert.equal(outranks(odd<ClubRole>("mod"), "member"), false, "a mod read from an old row removes nothing");
  assert.equal(outranks("admin", odd<ClubRole>("mod")), true, "and ranks with a member");
});

// ---------------------------------------------------------------------------
// clubRoomLabel
// ---------------------------------------------------------------------------

test("the three fixed rooms are named by the club and their product name", () => {
  assert.equal(clubRoomLabel("Salsa Club", "lounge", "lounge"), "Salsa Club · Lounge");
  assert.equal(clubRoomLabel("Salsa Club", "board", "board"), "Salsa Club · Board");
  assert.equal(clubRoomLabel("Salsa Club", "officers", "officers"), "Salsa Club · Officers");
});

test("a fixed room ignores whatever its stored name says", () => {
  assert.equal(clubRoomLabel("SAE", "lounge", "general"), "SAE · Lounge");
  assert.equal(clubRoomLabel("SAE", "board", "announcements"), "SAE · Board");
  assert.equal(clubRoomLabel("SAE", "officers", "exec"), "SAE · Officers");
  assert.equal(clubRoomLabel("SAE", "board", ""), "SAE · Board");
});

test("an event chat and an extra room use their own name, as written", () => {
  assert.equal(clubRoomLabel("Salsa Club", "event", "Fall Formal"), "Salsa Club · Fall Formal");
  assert.equal(clubRoomLabel("Salsa Club", "room", "events"), "Salsa Club · events");
  assert.equal(clubRoomLabel("Salsa Club", "room", "Rides & Carpool"), "Salsa Club · Rides & Carpool");
  assert.equal(clubRoomLabel("Salsa Club", "room", "Lounge"), "Salsa Club · Lounge");
});

test("spaces around either name are dropped", () => {
  assert.equal(clubRoomLabel("  Salsa Club ", "event", "  Fall Formal\n"), "Salsa Club · Fall Formal");
  assert.equal(clubRoomLabel("\tSalsa Club", "lounge", " lounge "), "Salsa Club · Lounge");
});

test("a blank room name falls back to the product's word, never to nothing", () => {
  assert.equal(clubRoomLabel("Salsa Club", "event", ""), "Salsa Club · Event chat");
  assert.equal(clubRoomLabel("Salsa Club", "event", "   "), "Salsa Club · Event chat");
  assert.equal(clubRoomLabel("Salsa Club", "room", ""), "Salsa Club · Room");
  assert.equal(clubRoomLabel("Salsa Club", "room", odd<string>(null)), "Salsa Club · Room");
});

test("a blank club name leaves the room's part alone", () => {
  assert.equal(clubRoomLabel("", "lounge", "lounge"), "Lounge");
  assert.equal(clubRoomLabel("   ", "event", "Fall Formal"), "Fall Formal");
  assert.equal(clubRoomLabel(odd<string>(undefined), "board", "board"), "Board");
});

test("a kind the database has not filled yet keeps the room's own name", () => {
  assert.equal(clubRoomLabel("Salsa Club", odd<RoomKind>(null), "general"), "Salsa Club · general");
  assert.equal(clubRoomLabel("Salsa Club", odd<RoomKind>("BOARD"), "announcements"), "Salsa Club · announcements");
  assert.equal(clubRoomLabel("Salsa Club", odd<RoomKind>(undefined), ""), "Salsa Club · Room");
});

test("no label carries the old wording", () => {
  for (const kind of ["board", "lounge", "officers", "event", "room"] as RoomKind[]) {
    const label = clubRoomLabel("Salsa Club", kind, kind === "event" ? "Fall Formal" : "");
    assert.equal(/#|channel|server|thread/i.test(label), false, label);
    assert.equal(label.includes(" · "), true, label);
  }
});

// ---------------------------------------------------------------------------
// postRefusal
// ---------------------------------------------------------------------------

test("Board, a new post by someone who is not an owner or admin: officers only", () => {
  assert.equal(postRefusal(room("board"), null, "member"), "board_officers_only");
  assert.equal(postRefusal(room("board"), null, odd<ClubRole>("mod")), "board_officers_only", "a mod read from an old row does not post on a Board");
  assert.equal(postRefusal(room("board"), null, null), "board_officers_only");
  assert.equal(postRefusal(room("board"), null, odd<ClubRole>("Owner")), "board_officers_only");
  assert.equal(postRefusal(room("board"), null, odd<ClubRole>(undefined)), "board_officers_only");
});

test("Board, a reply the database refused: the post is no longer there, whoever asks", () => {
  for (const role of ROLES) {
    assert.equal(postRefusal(room("board"), "m1", role), "board_post_missing", String(role));
  }
});

test("a blank root is no root", () => {
  assert.equal(postRefusal(room("board"), "", "member"), "board_officers_only");
  assert.equal(postRefusal(room("board"), "   ", "member"), "board_officers_only");
  assert.equal(postRefusal(room("board"), odd<string>(undefined), "member"), "board_officers_only");
  assert.equal(postRefusal(room("lounge"), "", "member"), "room_closed");
});

test("a root sent anywhere but a Board is not allowed", () => {
  for (const kind of ["lounge", "officers", "event", "room"] as RoomKind[]) {
    for (const role of ROLES) {
      assert.equal(postRefusal(room(kind), "m1", role), "thread_root_not_allowed", `${kind}, ${String(role)}`);
    }
  }
});

test("a root sent to a dm or a group (no room) is not allowed", () => {
  assert.equal(postRefusal(null, "m1", null), "thread_root_not_allowed");
  assert.equal(postRefusal(null, "m1", "owner"), "thread_root_not_allowed");
});

test("an event chat the database refused is closed, for officers too", () => {
  for (const role of ROLES) {
    assert.equal(postRefusal(room("event", "Fall Formal"), null, role), "room_closed", String(role));
  }
});

test("everything else the database refused reads as closed", () => {
  assert.equal(postRefusal(room("lounge"), null, "member"), "room_closed");
  assert.equal(postRefusal(room("officers"), null, "member"), "room_closed");
  assert.equal(postRefusal(room("room", "events"), null, null), "room_closed");
  assert.equal(postRefusal(null, null, null), "room_closed", "the room is gone");
  assert.equal(postRefusal(room("board"), null, "owner"), "room_closed", "an officer is never told officers only");
  assert.equal(postRefusal(room("board"), null, "admin"), "room_closed");
  assert.equal(postRefusal(odd<Room>({ id: "r1", kind: null }), null, "member"), "room_closed");
});

test("an extra room that restricts who posts: only some people can post, whoever asks", () => {
  for (const policy of ["officers", "listed"] as PostPolicy[]) {
    for (const role of ROLES) {
      assert.equal(postRefusal(extraRoom(policy), null, role), "room_posters_only", `${policy}, ${String(role)}`);
    }
    assert.equal(postRefusal(extraRoom(policy), "", "member"), "room_posters_only", `${policy}, a blank root is no root`);
  }
});

test("an extra room open to everyone, or with no policy on it, still reads as closed", () => {
  for (const role of ROLES) {
    assert.equal(postRefusal(extraRoom("everyone"), null, role), "room_closed", String(role));
    assert.equal(postRefusal(room("room", "exec-only"), null, role), "room_closed", `no policy, ${String(role)}`);
  }
  assert.equal(postRefusal({ ...room("room"), post_policy: undefined }, null, "member"), "room_closed");
});

test("a root sent to a restricted extra room is still a root sent outside a Board", () => {
  for (const policy of POST_POLICIES) {
    for (const role of ROLES) {
      assert.equal(postRefusal(extraRoom(policy), "m1", role), "thread_root_not_allowed", `${policy}, ${String(role)}`);
    }
  }
});

test("the post policy only counts on an extra room", () => {
  // The database never stores one elsewhere (a check constraint); a caller could still hand one in.
  assert.equal(postRefusal({ ...room("lounge"), post_policy: "officers" }, null, "member"), "room_closed");
  assert.equal(postRefusal({ ...room("officers"), post_policy: "listed" }, null, "member"), "room_closed");
  assert.equal(postRefusal({ ...room("event", "Fall Formal"), post_policy: "officers" }, null, "member"), "room_closed");
  assert.equal(postRefusal({ ...room("board"), post_policy: "listed" }, null, "member"), "board_officers_only");
  assert.equal(postRefusal({ ...room("board"), post_policy: "officers" }, null, "owner"), "room_closed");
});

test("every answer is one of the five codes, and each has its sentence", () => {
  const five = ["board_officers_only", "board_post_missing", "thread_root_not_allowed", "room_closed", "room_posters_only"];
  const rooms = [
    null,
    ...(["board", "lounge", "officers", "event", "room"] as RoomKind[]).map((k) => room(k)),
    ...POST_POLICIES.map((policy) => extraRoom(policy)),
  ];
  const seen = new Set<string>();
  for (const r of rooms) {
    for (const root of [null, "m1"]) {
      for (const role of ROLES) {
        const code = postRefusal(r, root, role);
        seen.add(code);
        assert.equal(five.includes(code), true, code);
        assert.equal(typeof REFUSAL_SENTENCES[code], "string");
      }
    }
  }
  assert.deepEqual([...seen].sort(), [...five].sort(), "and each of the five is reached");
});

// ---------------------------------------------------------------------------
// The sentences (types.ts)
// ---------------------------------------------------------------------------

test("the refusal sentences are the contract's, word for word", () => {
  assert.deepEqual(
    { ...REFUSAL_SENTENCES },
    {
      board_officers_only: "Only officers post here.",
      room_closed: "This chat is closed.",
      club_media_off: "Photos and videos are off in club chats for now.",
      board_post_missing: "That post is no longer there.",
      thread_root_not_allowed: "Replies only work under a Board post.",
      club_room: "You can't leave a club's chat. Leave the club instead.",
      room_locked: "This room can't be renamed, hidden or deleted.",
      try_again: "Try again in a moment.",
      // Wave 2 (wave-2-contracts.md 1.3): the ten wave-1 codes without a sentence, and invalid_after.
      not_found: "That's not there anymore.",
      not_allowed: "You can't remove this message.",
      report_open: "This message has an open report. Vibe's moderators will handle it.",
      invalid_card: "Check the card and try again.",
      event_not_found: "That event isn't available.",
      poll_closed: "This one is closed.",
      slot_full: "That spot just filled.",
      cards_club_rooms_only: "Polls, sign-ups and events only work in club chats.",
      members_only: "Members only.",
      create_failed: "Couldn't create the club. Try again.",
      invalid_after: "Reload to catch up.",
      // Wave 3 (wave-3-desktop/contract.md 4.3): pinned messages and the room rules.
      pin_limit: "This chat already has 20 pinned messages. Unpin one first.",
      pin_not_allowed: "You can't pin messages in this chat.",
      pins_chats_only: "Pinning only works in direct messages and group chats.",
      room_posters_only: "Only some people can post here.",
      room_limit: "This club already has 5 extra rooms. Delete one first.",
    },
  );
});

test("the five wave-3 sentences, each in its refusal body", () => {
  const table: [Parameters<typeof refusalBody>[0], string][] = [
    ["pin_limit", "This chat already has 20 pinned messages. Unpin one first."],
    ["pin_not_allowed", "You can't pin messages in this chat."],
    ["pins_chats_only", "Pinning only works in direct messages and group chats."],
    ["room_posters_only", "Only some people can post here."],
    ["room_limit", "This club already has 5 extra rooms. Delete one first."],
  ];
  for (const [code, error] of table) {
    assert.deepEqual(refusalBody(code), { ok: false, error, code }, code);
  }
});

test("no sentence uses the old wording, and none can be changed by a caller", () => {
  for (const [code, sentence] of Object.entries(REFUSAL_SENTENCES)) {
    assert.equal(/#|channel|server|thread/i.test(sentence), false, code);
    assert.equal(sentence.endsWith("."), true, code);
  }
  assert.throws(() => {
    (REFUSAL_SENTENCES as Record<string, string>).room_closed = "Closed";
  });
});

test("a refusal body is ok false, the sentence and the code", () => {
  assert.deepEqual(refusalBody("board_officers_only"), {
    ok: false,
    error: "Only officers post here.",
    code: "board_officers_only",
  });
  assert.deepEqual(refusalBody("room_locked"), {
    ok: false,
    error: "This room can't be renamed, hidden or deleted.",
    code: "room_locked",
  });
});

test("every code of the table gets its own sentence in the body", () => {
  for (const [code, sentence] of Object.entries(REFUSAL_SENTENCES)) {
    assert.deepEqual(refusalBody(code as keyof typeof REFUSAL_SENTENCES), { ok: false, error: sentence, code });
  }
});

test("a code with no sentence still sends one, and keeps its code", () => {
  type Known = Parameters<typeof refusalBody>[0];
  // The one code of the contract with no sentence in the table (wave 2 gave
  // the others theirs), a made-up one, and names every object carries
  // ("constructor" is a function there).
  for (const code of ["content_blocked", "nonsense", "", "constructor", "toString", "__proto__"]) {
    const body = refusalBody(odd<Known>(code));
    assert.deepEqual(body, { ok: false, error: "Try again in a moment.", code }, `code=${code}`);
    assert.equal(JSON.parse(JSON.stringify(body)).error, "Try again in a moment.", `code=${code}, as JSON`);
  }
});
