/**
 * Every shape and refusal code of club chat v1, in one place
 * (handoffs/chat-redesign/wave-1-contracts.md sections 5, 6.0, 6.1, 6.3, 6.4
 * and 7). Every route payload reuses these; nothing is renamed per route.
 *
 * Types, plus ONE runtime value: the refusal sentences (and the small helper
 * that builds a refusal body from them). The imports are type-only, so they
 * are erased: `node --test` loads this file, and a client component may
 * import it without pulling in server code.
 *
 * Cards (section 5) and the three reads (section 7) are built in wave 2;
 * their shapes are pinned here now so the screens can be built against them.
 */

import type { ReactionGroup } from "@/lib/messages/reaction-emoji";

import type { AttachmentRow, ParentPreview } from "./message-read";

// ── 6.0 Shared shapes ────────────────────────────────────────────────────────

/** `channels.kind`. Null on a dm or a group, which are not rooms. */
export type RoomKind = "board" | "lounge" | "officers" | "event" | "room";

/** Where an event's chat is in its life; see room-state.ts `roomState`. */
export type RoomState = "soon" | "live" | "after" | "closed";

/** `org_members.role`. Chat never imports `OFFICER_ROLES`; see room-rules.ts. */
export type ClubRole = "owner" | "admin" | "mod" | "member";

/**
 * `channels.post_policy` (wave 3, handoffs/chat-redesign/wave-3-desktop/contract.md
 * 4c.3): who writes a new message in an extra room. `officers` = owner and
 * admin; `listed` = they and the room's by-name list. Every other kind of
 * room keeps its own rule and reads `everyone`.
 */
export type PostPolicy = "everyone" | "officers" | "listed";

export type Person = { id: string; handle: string; name: string; avatar_url: string | null };

export type OrgRef = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  verified: boolean;
};

export type EventRef = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  state: RoomState;
  /** Only when the viewer may enter the room. */
  room_id: string | null;
  viewer_status: "going" | "maybe" | null;
  going_count: number;
  maybe_count: number;
};

/** What `loadRoom` (rooms.ts) returns. */
export type Room = {
  id: string;
  kind: RoomKind;
  name: string;
  org_id: string;
  event: { id: string; title: string; starts_at: string; ends_at: string } | null;
  /**
   * Absent = `everyone`. `loadRoom` always sets it (`everyone` when the
   * column is missing or holds anything else); optional so a `Room` written
   * by hand stays one.
   */
  post_policy?: PostPolicy;
};

export type ViewerInRoom = {
  /** Null for a dm or a group. */
  role: ClubRole | null;
  /** A new top-level message (dm / group: true). */
  can_post: boolean;
  /** True only in a Board. */
  can_reply: boolean;
  /** Owner / admin / mod in a club room. */
  can_moderate: boolean;
  /**
   * `postRuleLine` of the room, only on an extra room whose rule keeps this
   * viewer from posting (wave-3 contract 4c.3); the key is absent otherwise.
   * The screens print it in place of the composer.
   */
  post_line?: string;
  /**
   * Set only for a FOLLOWER reading a club's Board (club model, Franky's
   * call of Oct 16: only members type; a follower reads the Board and
   * nothing else). Then `role` is null and `can_post`, `can_reply` and
   * `can_moderate` are false, with no `post_line`: there is no composer.
   * The key is absent for a member, a dm and a group, so a member's viewer
   * keeps its exact shape.
   */
  standing?: "follower";
};

/** The `standing` of a reader of a club room: a member, or a follower reading the Board. */
export type ClubStanding = "member" | "follower";

// ── 6.0 Refusals ─────────────────────────────────────────────────────────────

/**
 * The codes of wave-1 section 6.0 and wave-2 section 1.3
 * (handoffs/chat-redesign/wave-2-contracts.md), each with its plain sentence
 * below. Wave 2 gave a sentence to every code wave 1 left without one and
 * added one, `invalid_after`.
 */
export type RefusalCode =
  | "board_officers_only"
  | "room_closed"
  | "club_media_off"
  | "board_post_missing"
  | "thread_root_not_allowed"
  | "club_room"
  | "room_locked"
  | "try_again"
  // Wave 2, section 1.3.
  | "not_found" // 404: a gated route with the flag off or the schema missing; a vote on a message that is not a live poll of this room; the remove route; a non-uuid [messageId]
  | "not_allowed" // 403: the remove route (not the sender in a dm or group; below mod; outranked)
  | "report_open" // 409: the remove route
  | "invalid_card" // 400: a card with a bad shape, from the route or the RPC's P0C22; the body carries `field`
  | "event_not_found" // 404: an Event card for a missing, foreign or ended event
  | "poll_closed" // 409: a vote past closes_at, or in a closed event chat
  | "slot_full" // 409: a sign-up slot at capacity
  | "cards_club_rooms_only" // 400: a card sent to a dm or a group
  // 403: GET /api/orgs/[slug]/space by a non-member who may not read the
  // club's Board (not following, barred, blocked, or the club turned it off:
  // one answer, so nobody is told which); and, club model (Oct 16), anything
  // a follower tries beyond reading: a send, a reply, a reaction, a vote, a
  // card, `?root=` replies. Only members type.
  | "members_only"
  | "create_failed" // 500: club creation (the wave-1 route keeps its own text)
  | "invalid_after" // 400: ?after= that is not a timestamp the server could have sent
  // Wave 3, section 4.3 (handoffs/chat-redesign/wave-3-desktop/contract.md).
  | "pin_limit" // 409: a pin in a chat that already holds PIN_CAP of them
  | "pin_not_allowed" // 403: a pin or unpin in a pending request; a pin in a blocked pair
  | "pins_chats_only" // 400: a pin route called on a club room
  | "room_posters_only" // 403: a send to an extra room whose post_policy leaves the sender out
  | "room_limit"; // 409: a new extra room in a club that already has EXTRA_ROOM_CAP

/**
 * The five codes `postRefusal` (room-rules.ts) picks from: section 6.2's
 * four, and wave 3's `room_posters_only`.
 */
export type PostRefusalCode =
  | "board_officers_only"
  | "board_post_missing"
  | "thread_root_not_allowed"
  | "room_closed"
  | "room_posters_only";

/**
 * The one code whose sentence is not in the table: the word filter's, with
 * `field`, from `contentBlockedResponse` (moderation/access.ts). Every
 * other code moved into `RefusalCode` in wave 2 (section 1.3).
 */
export type ChatRouteCode = "content_blocked"; // 4.1.7: the word filter, with `field`

/** Every code in the contract. Screens match on `code`, never on the status or the sentence. */
export type ChatErrorCode = RefusalCode | ChatRouteCode;

/** The code-to-sentence table of section 6.0. The sentences are the contract's, word for word. */
export const REFUSAL_SENTENCES: Readonly<Record<RefusalCode, string>> = Object.freeze({
  board_officers_only: "Only officers post here.",
  room_closed: "This chat is closed.",
  club_media_off: "Photos and videos are off in club chats for now.",
  board_post_missing: "That post is no longer there.",
  thread_root_not_allowed: "Replies only work under a Board post.",
  club_room: "You can't leave a club's chat. Leave the club instead.",
  room_locked: "This room can't be renamed, hidden or deleted.",
  try_again: "Try again in a moment.",
  // Wave 2, section 1.3.
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
  // Wave 3, section 4.3.
  pin_limit: "This chat already has 20 pinned messages. Unpin one first.",
  pin_not_allowed: "You can't pin messages in this chat.",
  pins_chats_only: "Pinning only works in direct messages and group chats.",
  room_posters_only: "Only some people can post here.",
  room_limit: "This club already has 5 extra rooms. Delete one first.",
});

/** Every refusal: `{ ok: false, error: <plain sentence>, code }`. */
export type Refusal<Code extends ChatErrorCode = ChatErrorCode> = {
  ok: false;
  error: string;
  code: Code;
};

/**
 * The body of a refusal from section 6.0's table, so no route retypes a
 * sentence. Every refusal carries a plain sentence: a code the table does not
 * hold (a cast, a code read from somewhere else) keeps its code and gets
 * "Try again in a moment.", never a body without `error`.
 */
export function refusalBody<Code extends RefusalCode>(code: Code): Refusal<Code> {
  const known = Object.prototype.hasOwnProperty.call(REFUSAL_SENTENCES, code);
  const error = known ? REFUSAL_SENTENCES[code] : REFUSAL_SENTENCES.try_again;
  return { ok: false, error, code };
}

/**
 * The 400 of the card routes (wave-2 contract 1.3, 4.1.6, 4.3.5): the only
 * refusal with a `field` besides `content_blocked`. `field` is one of
 * `type`, `question`, `options`, `options.<n>`, `anonymous`, `multi`,
 * `event_id`, `note`, `closes_at` (the create route) or `option_id`, `on`
 * (the vote route).
 * The sheet reads it through `VibeFailure.field`.
 */
export type InvalidCardRefusal = Refusal<"invalid_card"> & { field: string };

// ── 2 The flag ───────────────────────────────────────────────────────────────

/**
 * `GET /api/me/features`: the only way a screen learns `chat_v2`.
 * `chat_desktop` (wave-3 contract 2.1) is never true without it; the two
 * desktop pages also receive it as a server prop.
 */
export type FeaturesResponse = { ok: true; chat_v2: boolean; chat_desktop: boolean };

// ── 5 Cards (wave 2; pinned now) ─────────────────────────────────────────────

/** `POST /api/me/threads/[id]/cards`. `note` is at most 200 characters. */
export type CreateCardBody =
  | {
      type: "poll";
      question: string;
      options: { label: string }[];
      anonymous?: boolean;
      multi?: boolean;
      closes_at?: string | null;
    }
  | {
      type: "signup";
      question: string;
      options: { label: string; capacity: number }[];
      closes_at?: string | null;
    }
  | { type: "event"; event_id: string; note?: string };

/** `201` from the create route; the message is read back through `readChatMessage()`. */
export type CreateCardResponse = { ok: true; message: ChatMessage };

/** `PUT /api/me/threads/[id]/cards/[messageId]/vote`. */
export type VoteBody = { option_id: string; on: boolean };
export type VoteResponse = { ok: true; card: PollCard };

export type PollCardOption = {
  id: string;
  label: string;
  count: number;
  capacity: number | null;
  full: boolean;
  /** The viewer's own pick, always returned. */
  mine: boolean;
  /**
   * [] when anonymous; ALL of them for a sign-up; the first 12 by vote time
   * for a poll. Always [] for a follower reading the Board: they get the
   * counts, never who picked what (club model, critique #2).
   */
  voters: Person[];
  /** How many more a poll has beyond the 12; 0 for a follower. */
  voters_more: number;
};

export type PollCard = {
  type: "poll" | "signup";
  question: string;
  anonymous: boolean;
  multi: boolean;
  closes_at: string | null;
  /**
   * Past closes_at, or an event room past its 7 days. Never "closed" just
   * because the viewer cannot post on a Board.
   */
  closed: boolean;
  /** Distinct people. */
  total_voters: number;
  options: PollCardOption[];
};

/** `event` is null when the event was cancelled. */
export type EventCard = { type: "event"; note: string | null; event: EventRef | null };

export type Card = PollCard | EventCard;

/**
 * What `snapshotCard` (cards/snapshot.ts, wave-2 contract 5.3) writes into a
 * report's message snapshot: the card as the reporter saw it, with no voter
 * names and no ids of people. Null for a text message, a missing card row,
 * or a database without migration B.
 */
export type CardSnapshot =
  | {
      type: "poll" | "signup";
      question: string;
      anonymous: boolean;
      multi: boolean;
      closes_at: string | null;
      options: { label: string; capacity: number | null; count: number }[];
    }
  | { type: "event"; event_id: string | null; title: string | null; starts_at: string | null; note: string | null };

// ── 6.1 The thread read ──────────────────────────────────────────────────────

export type MessageKind = "text" | "poll" | "event_card";

/**
 * Only on the viewer's OWN removed message (RLS hides it from everyone
 * else). `by` is "officer" when the stored reason equals
 * `OFFICER_REMOVED_REASON`, else "moderator"; `reason` is null for an
 * officer's removal. `removed_at`, `removed_by` and `removed_reason` never
 * appear in the JSON. An officer's removal leaves `removed_by` null (S71 F02);
 * who did it lives in the service-only `chat_removals` table.
 */
export type RemovedInfo = { by: "officer" | "moderator"; at: string; reason: string | null };

/**
 * One message as the thread GET sends it: today's shape (MESSAGE_SELECT plus
 * the reactions and the parent preview, after `prepareForClient`) and the
 * wave-1 fields under it.
 */
export type ChatMessage = {
  // Today's shape.
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  attachment_id: string | null;
  attachment_kind: string | null;
  /** The same-origin media proxy URL, never the stored key. */
  media_url: string | null;
  media_kind: string | null;
  parent_message_id: string | null;
  /**
   * The author; null when their row is not readable. Null for a follower
   * too, with `user_id` "" and `author_role` null: a follower is shown each
   * Board post as the club's (`room.org`), never a member's name.
   */
  users: Person | null;
  attachment: AttachmentRow | null;
  parent_preview: ParentPreview | null;
  /**
   * Counts only, for everyone. A follower's are read with the service role
   * (the database shows a non-member only their own reaction rows) and carry
   * no person, as for a member.
   */
  reactions: ReactionGroup[];
  // New in wave 1.
  kind: MessageKind;
  thread_root_id: string | null;
  /** Null on a text message and on a stub; hydrated by `hydrateCards` (wave 2) on a card. */
  card: Card | null;
  /**
   * Board top-level posts only, else null. Null for a follower too: they
   * read the posts, never the replies (members write those).
   */
  reply_count: number | null;
  /**
   * Club rooms; null = no longer a member, and null in a dm or a group.
   * Always null on a follower's page (the post is the club's).
   */
  author_role: ClubRole | null;
  /**
   * Blocking in club rooms, both ways (wave-2 contract section 8): when
   * either person blocked the other, the message arrives as a stub, the
   * exact shape of 8.1 (`asStub` in stub.ts): `hidden: true`, `kind:
   * "text"`, `content: ""`, `user_id: ""`, `users: null`, `card: null`,
   * every other field at its empty default, and `id`, `created_at`,
   * `thread_root_id` unchanged so keys and paging hold. The rule is 8.2
   * (`isHiddenFrom`). Always false in a dm or a group.
   *
   * One exception, confirmed by Franky on Sept 29 (he picked the option
   * that names it): a top-level Board post by a current officer shows to
   * every member, so nobody misses club news.
   */
  hidden: boolean;
  removed: RemovedInfo | null;
};

/** The room of a thread read. `going` = the first 8 by RSVP time, room members only. */
export type ThreadRoom = {
  id: string;
  kind: RoomKind;
  name: string;
  org: OrgRef;
  event: (EventRef & { going: Person[] }) | null;
};

/**
 * `GET /api/me/threads/[id]/messages`, on a database that has the chat
 * schema.
 *
 * On a database WITHOUT it (contract 3.10: local before the apply, a Vercel
 * Preview, after a rollback) the route still sends every field, at its
 * default: `room: null`, `viewer: { role: null, can_post: true,
 * can_reply: false, can_moderate: false }`, and each message's wave-1 fields
 * at their defaults. An OLDER server (a deploy from before wave 1) sends none
 * of them, so the plain-JavaScript screens still read `data.viewer?.can_post`
 * and behave as today when it is missing (section 10, point 1).
 */
export type ThreadMessagesResponse = {
  ok: true;
  /** Oldest first, as today. */
  messages: ChatMessage[];
  /** Now also sent for club rooms. */
  viewer_id: string;
  /** Club rooms: always null (unchanged). */
  peer_last_read_at: string | null;
  /** Club rooms: always [] (unchanged). */
  peer_typing: unknown[];
  /** Null for a dm or a group. */
  room: ThreadRoom | null;
  viewer: ViewerInRoom;
};

// ── 6.3 Officer / mod remove (wave 2 or 3; pinned now) ───────────────────────

/** A message removed by an officer or a mod; `already` when it was removed before this call. */
export type RemoveMessageResponse = { ok: true; removed: true; already?: true };

// ── 6.4 The thread list ──────────────────────────────────────────────────────

/**
 * What a club room's entry gains in `GET /api/me/threads`. Its `name` is
 * already the full label ("Salsa Club · Lounge", room-rules.ts
 * `clubRoomLabel`). A dm or a group entry has none of these.
 */
export type ThreadEntryRoomFields = { org: OrgRef; room_kind: RoomKind; can_post: boolean };

// ── 7 Reads for the new screens (wave 2; pinned now) ─────────────────────────

export type Preview = {
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  kind: MessageKind;
};

export type InboxClub = {
  org: OrgRef;
  viewer_role: ClubRole;
  /** unread = a top-level post by someone else, newer than my last_read_at. */
  board: { room_id: string; latest: Preview | null; unread: boolean };
  /** unread_count = by others, newer than my last_read_at; capped at 99. */
  lounge: { room_id: string; latest: Preview | null; unread_count: number };
  /** The club's next event that has not ended. */
  next_event: EventRef | null;
  /**
   * The newest of board.latest, lounge.latest and the latest message of event
   * rooms I hold a row on. NOT orgs.last_activity_at (that one moves for
   * rooms I cannot read).
   */
  last_activity_at: string | null;
  /** From my Lounge row. */
  pinned_at: string | null;
  muted_until: string | null;
};

/** `GET /api/me/inbox`: pinned first, then `last_activity_at` newest first. */
export type InboxResponse = { ok: true; clubs: InboxClub[] };

/**
 * One club whose Board the viewer reads as a FOLLOWER (club model, Oct 16),
 * for the Messages home list beside the inbox (batch 1C's route, 2C's
 * screens). A follower holds no `channel_members` row, so there is no
 * unread dot, mute or pin. Only clubs the viewer is not a member of, that
 * are not hidden, and whose Board the database lets them read (critique
 * #7): the route reads the Boards on the VIEWER's client, and the policy on
 * that read (`channels_select_org_member`) is `can_view_org_channel`
 * itself, so the rule is never re-coded in TypeScript. `latest` is read
 * with the service role (the database shows a follower no message row):
 * only a live top-level post by one of the club's current owners and
 * admins, with `author_name` always "" (the Board speaks for the club).
 */
export type FollowedBoard = {
  org: OrgRef;
  /** The Board's channel id: `/messages?channel=<room_id>` opens it. */
  room_id: string;
  latest: Preview | null;
};

/** The follower list of Boards, newest `latest` first (nulls last), then `org.name`. */
export type FollowedBoardsResponse = { ok: true; boards: FollowedBoard[] };

/**
 * The three new fields on a `kind: "rsvp"` entry of `GET /api/me/calendar`.
 * All three are null with the flag off for the caller or the schema missing.
 * `room_id` is set only when I may enter the room.
 */
export type CalendarRoomFields = {
  org_id: string | null;
  room_id: string | null;
  room_state: RoomState | null;
};

export type SpaceRoom = {
  id: string;
  kind: RoomKind;
  name: string;
  unread: boolean;
  can_post: boolean;
  event: EventRef | null;
  /**
   * `channels.is_private`: Officers, event chats and private extra rooms
   * (wave-3 contract 4.2).
   */
  locked: boolean;
  post_policy: PostPolicy;
};

/**
 * `GET /api/orgs/[slug]/space` for a MEMBER. A follower gets
 * `SpaceFollowerResponse` instead; a screen that may open either reads
 * `SpaceAnswer` and tells them apart by `viewer.standing`.
 */
export type SpaceResponse = {
  ok: true;
  org: OrgRef & { member_count: number };
  /** No `standing` key: a member's viewer keeps its exact shape. */
  viewer: { role: ClubRole; can_moderate: boolean };
  /**
   * Order: lounge, board, officers (only if I can enter), event rooms not
   * closed by starts_at, then rooms by position.
   */
  rooms: SpaceRoom[];
  board_latest: ChatMessage | null;
  /** Not ended, soonest first, max 3. */
  up_next: EventRef[];
  /**
   * Only with `?events=1` (the Share-an-event sheet's list, wave-2 contract
   * 7.2.6): the club's not-ended events, soonest first, max 50. Absent
   * otherwise.
   */
  upcoming?: EventRef[];
  /**
   * Only with `?panel=1` (the desktop club panel's Announcements, wave-3
   * contract 4.2): the Board's last three messages that are not hidden and
   * not removed, newest first. Absent otherwise.
   */
  board_recent?: ChatMessage[];
};

/**
 * `GET /api/orgs/[slug]/space` for a FOLLOWER the database lets read the
 * club's Board (club model, Oct 16; critique #6): the Board and nothing
 * else. `rooms` holds the Board alone (`can_post` false, `unread` false: a
 * follower holds no row on it). `board_latest`, and `board_recent` with
 * `?panel=1`, come from the Board page as a follower reads it (counts only
 * on cards and reactions, no reply counts). `up_next` and `upcoming` are
 * the club's event listings as the club page shows them, `room_id` null on
 * every one (a follower never enters an event's chat). No member's face or
 * name anywhere.
 */
export type SpaceFollowerResponse = {
  ok: true;
  /** `member_count` from 5 up; null below 5 or when the count could not be read. */
  org: OrgRef & { member_count: number | null };
  viewer: { role: null; standing: "follower"; can_moderate: false };
  rooms: SpaceRoom[];
  board_latest: ChatMessage | null;
  up_next: EventRef[];
  upcoming?: EventRef[];
  board_recent?: ChatMessage[];
};

/** Every answer of `GET /api/orgs/[slug]/space`: a member's or a follower's. */
export type SpaceAnswer = SpaceResponse | SpaceFollowerResponse;

// ── Wave 3: pinned messages and Shared (dms and groups) ──────────────────────
// handoffs/chat-redesign/wave-3-desktop/contract.md 4.3. These pin a MESSAGE
// for everyone in the chat; `/api/me/threads/[id]/pin` pins a CHAT in my list.

export type PinnedMessage = {
  message_id: string;
  pinned_at: string;
  /** The message's own time. */
  created_at: string;
  /** `pinQuote(content)`: one line, at most 140 characters; "" for a photo, video or post with no text. */
  text: string;
  /** The whole content, trimmed; "" when there is none. The panel opens it in place when the page cannot jump. */
  full_text: string;
  /**
   * The message's author (not who pinned); null when the VIEWER cannot read
   * that profile (a suspended or banned account, as the thread sends
   * `users: null` for the same message) or the authors' read failed. The
   * pin is still live: a screen draws it without a name.
   */
  author: Person | null;
  media_kind: "image" | "video" | null;
  has_post: boolean;
};

/** `GET /api/me/threads/[id]/message-pins`: newest pin first; `cap` is `PIN_CAP`. */
export type MessagePinsResponse = { ok: true; pins: PinnedMessage[]; cap: number };

/** `PUT` / `DELETE /api/me/threads/[id]/messages/[messageId]/pin`; `already` when it was pinned before this call. */
export type PinMessageResponse = { ok: true; pinned: boolean; already?: true };

export type SharedItem = {
  message_id: string;
  created_at: string;
  user_id: string;
  /** `messageMediaProxyUrl(channelId, messageId)`, never the stored key. */
  media_url: string | null;
  media_kind: "image" | "video" | null;
  /** The shared post, exactly as the thread GET sends it for that message. */
  attachment: AttachmentRow | null;
};

/** `GET /api/me/threads/[id]/shared`: newest first. */
export type SharedResponse = { ok: true; items: SharedItem[]; has_more: boolean };
