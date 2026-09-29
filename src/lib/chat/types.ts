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
};

// ── 6.0 Refusals ─────────────────────────────────────────────────────────────

/** The codes of section 6.0, each with its plain sentence below. */
export type RefusalCode =
  | "board_officers_only"
  | "room_closed"
  | "club_media_off"
  | "board_post_missing"
  | "thread_root_not_allowed"
  | "club_room"
  | "room_locked"
  | "try_again";

/** The four codes `postRefusal` (room-rules.ts) picks from, section 6.2. */
export type PostRefusalCode =
  | "board_officers_only"
  | "board_post_missing"
  | "thread_root_not_allowed"
  | "room_closed";

/**
 * Every other code the contract names, with the section that names it. The
 * contract pins no sentence for these: each route writes its own.
 */
export type ChatRouteCode =
  | "not_found" // 2, 3.10, 4.2: a gated route with the flag off, a missing schema, a vote on nothing
  | "not_allowed" // 6.3: the remove route's role and rank check
  | "report_open" // 6.3: an open report on the message
  | "invalid_card" // 4.2: a card with a bad shape
  | "event_not_found" // 4.2: an Event card for a missing, foreign or ended event
  | "poll_closed" // 4.2: a vote past closes_at
  | "slot_full" // 4.2: a sign-up slot at capacity
  | "cards_club_rooms_only" // 4.4: a card sent to a dm or a group
  | "content_blocked" // 4.4: the word filter, with `field`
  | "members_only" // 7: the club space, asked by a non-member of a visible club
  | "create_failed"; // 8: club creation failing on its rooms

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

// ── 2 The flag ───────────────────────────────────────────────────────────────

/** `GET /api/me/features`: the only way a screen learns the flag. */
export type FeaturesResponse = { ok: true; chat_v2: boolean };

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
  /** [] when anonymous; ALL of them for a sign-up; the first 12 by vote time for a poll. */
  voters: Person[];
  /** How many more a poll has beyond the 12. */
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

// ── 6.1 The thread read ──────────────────────────────────────────────────────

export type MessageKind = "text" | "poll" | "event_card";

/**
 * Only on the viewer's OWN removed message (RLS hides it from everyone
 * else). `by` is "officer" when the stored reason equals
 * `OFFICER_REMOVED_REASON`, else "moderator"; `reason` is null for an
 * officer's removal. `removed_at`, `removed_by` and `removed_reason` never
 * appear in the JSON.
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
  /** The author; null when their row is not readable. */
  users: Person | null;
  attachment: AttachmentRow | null;
  parent_preview: ParentPreview | null;
  reactions: ReactionGroup[];
  // New in wave 1.
  kind: MessageKind;
  thread_root_id: string | null;
  /** Always null in wave 1. */
  card: Card | null;
  /** Board top-level posts only, else null. */
  reply_count: number | null;
  /** Club rooms; null = no longer a member, and null in a dm or a group. */
  author_role: ClubRole | null;
  /**
   * Reserved for blocking in club rooms, both ways (section 12, point 2):
   * when either person blocked the other, the message arrives as a stub with
   * no content, author or card. Always false in wave 1.
   *
   * One exception, confirmed by Franky on Sept 29 (he picked the option
   * that names it): a top-level Board post by an officer shows to every
   * member, so nobody misses club news.
   *
   * NOT PINNED YET, for the wave that builds the rooms' screens: what
   * `content`, `user_id` and `users` hold on a stub (this type asks for all
   * three today).
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
};

/** `GET /api/orgs/[slug]/space`. */
export type SpaceResponse = {
  ok: true;
  org: OrgRef & { member_count: number };
  viewer: { role: ClubRole; can_moderate: boolean };
  /**
   * Order: lounge, board, officers (only if I can enter), event rooms not
   * closed by starts_at, then rooms by position.
   */
  rooms: SpaceRoom[];
  board_latest: ChatMessage | null;
  /** Not ended, soonest first, max 3. */
  up_next: EventRef[];
};
