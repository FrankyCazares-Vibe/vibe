/**
 * The small rules of club rooms that need no database
 * (handoffs/chat-redesign/wave-1-contracts.md sections 1, 6.2, 6.3, 6.4, 11).
 *
 * PURE: the one import is type-only (erased), so `node --test` loads this
 * file (room-rules.test.ts). The rules that need a database client
 * (`loadRoom`, `canPost`, `filterRoomReaders`, `clubRole`) live in rooms.ts.
 *
 * THE DATABASE IS THE WALL. `can_post_org_channel` and the insert policies
 * decide who may post; nothing here lets anyone in. `postRefusal` only picks
 * the words for a send the database already refused.
 *
 * "Officer" means two different lists elsewhere in the repo (`OFFICER_ROLES`
 * has mods, `CHANNEL_ADMIN_ROLES` does not). Chat imports neither and uses
 * the two lists below.
 */

import type { ClubRole, PostPolicy, PostRefusalCode, Room, RoomKind } from "./types";

/** Who may write a new post on a Board. */
export const BOARD_POSTER_ROLES: readonly ClubRole[] = Object.freeze(["owner", "admin"]);

/** Who may remove someone else's message in a club room. */
export const ROOM_MODERATOR_ROLES: readonly ClubRole[] = Object.freeze(["owner", "admin", "mod"]);

/**
 * `messages.removed_reason` of a message an officer or a mod removed. The
 * thread read tells an officer's removal from a Vibe moderator's by this
 * exact text, so it is never reworded.
 */
export const OFFICER_REMOVED_REASON = "Removed by a club officer.";

/**
 * How many extra rooms (`kind = 'room'`) one club may hold
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.2, 4c.3). The fixed
 * rooms and event chats are not counted.
 */
export const EXTRA_ROOM_CAP = 5;

/** `channels.post_policy`: who writes a new message in an extra room. */
export const POST_POLICIES = Object.freeze(["everyone", "officers", "listed"] as const);

const ROOM_KINDS: readonly RoomKind[] = Object.freeze(["board", "lounge", "officers", "event", "room"]);
const CLUB_ROLES: readonly ClubRole[] = Object.freeze(["owner", "admin", "mod", "member"]);

/** A `channels.kind` value read from the database. Null (a dm, a group, an old database) is not one. */
export function isRoomKind(value: unknown): value is RoomKind {
  return typeof value === "string" && (ROOM_KINDS as readonly string[]).includes(value);
}

/** An `org_members.role` value read from the database. */
export function isClubRole(value: unknown): value is ClubRole {
  return typeof value === "string" && (CLUB_ROLES as readonly string[]).includes(value);
}

/** A `channels.post_policy` value read from the database or sent in a body. */
export function isPostPolicy(value: unknown): value is PostPolicy {
  return typeof value === "string" && (POST_POLICIES as readonly string[]).includes(value);
}

/**
 * The line a room shows in place of the composer to someone who may read but
 * not post there (wave-3 contract 4c.3). Null for `everyone`: nobody is kept
 * out by the rule. "Officers" is owner and admin, as on a Board.
 */
export function postRuleLine(policy: PostPolicy): string | null {
  if (policy === "officers") return "Only officers post here.";
  if (policy === "listed") return "Only officers and people they picked post here.";
  return null;
}

/** Owner, admin or mod. Null (not a member, or a dm / group) and anything unknown: no. */
export function canModerate(role: ClubRole | null): boolean {
  return isClubRole(role) && ROOM_MODERATOR_ROLES.includes(role);
}

/** Owner 3, admin 2, mod 1; a member, someone who left, or an unknown role 0. */
function rank(role: unknown): number {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  if (role === "mod") return 1;
  return 0;
}

/**
 * May `callerRole` remove a message written by `authorRole` (section 6.3)?
 * The caller must be at least a mod, and the author must not rank above
 * them. Equal rank is allowed: a mod may remove a mod's message, an admin an
 * admin's. A mod cannot remove an owner's or an admin's; an admin cannot
 * remove the owner's. A plain member removes nobody's, another member's
 * included.
 */
export function outranks(callerRole: ClubRole | null, authorRole: ClubRole | null): boolean {
  const caller = rank(callerRole);
  if (caller < 1) return false;
  return caller >= rank(authorRole);
}

const LABEL_SEPARATOR = " · ";

/**
 * A club room's name in a list that mixes clubs: "Salsa Club · Lounge",
 * "Salsa Club · Board", "Salsa Club · Officers". An event chat and an extra
 * room go by their own name: "Salsa Club · Fall Formal". Never a `#`.
 *
 * A blank room name falls back to the product's word for that kind of room;
 * a blank club name leaves the room's part alone.
 */
export function clubRoomLabel(clubName: string, kind: RoomKind, roomName: string): string {
  const club = typeof clubName === "string" ? clubName.trim() : "";
  const own = typeof roomName === "string" ? roomName.trim() : "";
  let room: string;
  if (kind === "board") room = "Board";
  else if (kind === "lounge") room = "Lounge";
  else if (kind === "officers") room = "Officers";
  else if (own) room = own;
  else room = kind === "event" ? "Event chat" : "Room";
  return club ? `${club}${LABEL_SEPARATOR}${room}` : room;
}

/**
 * The code for a send the database refused (section 6.2). Called only AFTER
 * `can_post_org_channel` answered no, or for a `thread_root_id` sent to a dm
 * or a group (`room` null); it never decides whether a send is allowed.
 *
 * | the send                                         | code                      |
 * |--------------------------------------------------|---------------------------|
 * | a root sent anywhere but a Board                 | `thread_root_not_allowed` |
 * | Board, a root: the post is gone, removed, a reply itself, or in another room | `board_post_missing` |
 * | Board, no root, the sender is not owner / admin  | `board_officers_only`     |
 * | event chat, no root: past its window             | `room_closed`             |
 * | extra room, no root, its `post_policy` is not `everyone` (wave 3, 4c.3) | `room_posters_only` |
 * | anything else the database refused               | `room_closed`             |
 *
 * The last row is every case the contract's table does not name: the sender
 * lost the room between the membership check and the send, or the room is
 * gone. For them the chat is closed.
 */
export function postRefusal(
  room: Room | null,
  rootId: string | null,
  role: ClubRole | null,
): PostRefusalCode {
  const hasRoot = typeof rootId === "string" && rootId.trim() !== "";
  const kind = room ? room.kind : null;
  if (kind === "board") {
    if (hasRoot) return "board_post_missing";
    const officer = isClubRole(role) && BOARD_POSTER_ROLES.includes(role);
    return officer ? "room_closed" : "board_officers_only";
  }
  if (hasRoot) return "thread_root_not_allowed";
  if (room && kind === "room" && (room.post_policy ?? "everyone") !== "everyone") return "room_posters_only";
  return "room_closed";
}
