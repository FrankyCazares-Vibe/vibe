/**
 * The pure parts of the three reads of wave 2
 * (handoffs/chat-redesign/wave-2-contracts.md section 7; W2-B4): what the
 * inbox, the club space and the calendar decide once their rows are in hand.
 * The rows themselves are read in the routes (`api/me/inbox`,
 * `api/orgs/[slug]/space`, `api/me/calendar`), which export handlers only,
 * so the decisions live here where `node --test` reaches them (reads.test.ts).
 *
 * PURE: `room-rules.ts` (a list) and types are the only imports.
 */

import { DELETED_LINE, DELETED_POST_LINE, hasDeletedShape } from "./deleted-note";
import { BOARD_POSTER_ROLES } from "./room-rules";
import type {
  ClubRole,
  EventRef,
  FollowedBoard,
  InboxClub,
  MessageKind,
  PostPolicy,
  Preview,
  RoomKind,
  RoomState,
  SpaceRoom,
} from "./types";

// ── Previews (7.1.4) ─────────────────────────────────────────────────────────

/** A row of the inbox's two preview reads, newest first. `users` is null when the author's row is not readable. */
export type PreviewRow = {
  id: string;
  channel_id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  kind?: unknown;
  thread_root_id?: string | null;
  /** Read so a shared post with no words is never taken for a deleted message (Oct 19, 2026). */
  attachment_kind?: unknown;
  users?: { name?: unknown } | null;
};

/** `messages.kind` as the screens read it; anything else (an old row, a stub) is text. */
export function messageKindOf(value: unknown): MessageKind {
  return value === "poll" || value === "event_card" ? value : "text";
}

/**
 * `Preview = { id, text: content, author_name: row.users?.name ?? "", created_at, kind }` (7.1.4).
 * A message its sender deleted (Oct 19, 2026) previews as its note, never as
 * an empty line after the name: "Message deleted", or "Post deleted" on the
 * Board (`board`; the Board strip and the club panel say the same), with
 * `deleted: true` so a list draws it like the note (review of Oct 19, 2026).
 */
export function toPreview(row: PreviewRow, board = false): Preview {
  const name = row.users?.name;
  const deleted = hasDeletedShape(row);
  return {
    id: row.id,
    text: deleted ? (board ? DELETED_POST_LINE : DELETED_LINE) : typeof row.content === "string" ? row.content : "",
    author_name: typeof name === "string" ? name : "",
    created_at: row.created_at,
    kind: messageKindOf(row.kind),
    ...(deleted ? { deleted: true as const } : {}),
  };
}

/**
 * Per room, the newest row that is not hidden from the viewer: the rows come
 * newest first, so the first row per channel that `hidden` lets through is
 * the preview. A room whose window holds only hidden rows has no entry
 * (`latest: null`, 7.1.4). `board`: the rooms are Boards (a deleted post
 * previews as "Post deleted").
 */
export function latestShownPerRoom(
  rows: PreviewRow[],
  hidden: (row: PreviewRow) => boolean,
  opts: { board?: boolean } = {},
): Map<string, Preview> {
  const latest = new Map<string, Preview>();
  for (const row of rows) {
    if (latest.has(row.channel_id)) continue;
    if (hidden(row)) continue;
    latest.set(row.channel_id, toPreview(row, opts.board === true));
  }
  return latest;
}

// ── Times ────────────────────────────────────────────────────────────────────

/** A null `last_read_at` is read as the row's `created_at` (section 7, legacy rows only). */
export function readSince(row: { last_read_at: string | null; created_at: string }): string {
  return row.last_read_at ?? row.created_at;
}

/** The instant of a timestamp string, for ordering; NaN for anything that is not one. */
function instant(value: string): number {
  return Date.parse(value);
}

/** The newest of the given timestamps; null when none is one. */
export function newestOf(...times: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const time of times) {
    if (typeof time !== "string") continue;
    const at = instant(time);
    if (Number.isNaN(at)) continue;
    if (at > bestAt) {
      best = time;
      bestAt = at;
    }
  }
  return best;
}

// ── The inbox (7.1) ──────────────────────────────────────────────────────────

/** A `channel_members` row of the inbox's first read, with its room. */
export type MembershipRow = {
  channel_id: string;
  created_at: string;
  last_read_at: string | null;
  pinned_at: string | null;
  muted_until: string | null;
  channels: { id: string; org_id: string | null; kind: unknown; name: string | null } | null;
};

/** One club's rooms for the viewer: its Board, its Lounge, the event rooms they hold a row on. */
export type ClubRooms = { orgId: string; board: MembershipRow; lounge: MembershipRow; eventRooms: MembershipRow[] };

/**
 * Group the viewer's rows by club (7.1.1). A club with no `board` or no
 * `lounge` row for the viewer is left out. Rows without a club, and rows of
 * other kinds, take no part beyond the event rooms.
 */
export function groupClubRooms(rows: MembershipRow[]): ClubRooms[] {
  type Partial = { board?: MembershipRow; lounge?: MembershipRow; eventRooms: MembershipRow[] };
  const byOrg = new Map<string, Partial>();
  for (const row of rows) {
    const orgId = row.channels?.org_id;
    if (typeof orgId !== "string" || orgId === "") continue;
    const kind = row.channels?.kind;
    let club = byOrg.get(orgId);
    if (!club) {
      club = { eventRooms: [] };
      byOrg.set(orgId, club);
    }
    if (kind === "board") club.board ??= row;
    else if (kind === "lounge") club.lounge ??= row;
    else if (kind === "event") club.eventRooms.push(row);
  }
  const clubs: ClubRooms[] = [];
  for (const [orgId, club] of byOrg) {
    if (!club.board || !club.lounge) continue;
    clubs.push({ orgId, board: club.board, lounge: club.lounge, eventRooms: club.eventRooms });
  }
  return clubs;
}

/** The first event per club of a list already ordered `starts_at asc` (7.1.6). */
export function firstPerClub<T extends { org_id: string | null }>(events: T[]): Map<string, T> {
  const first = new Map<string, T>();
  for (const event of events) {
    if (typeof event.org_id !== "string" || first.has(event.org_id)) continue;
    first.set(event.org_id, event);
  }
  return first;
}

/** Descending by instant, nulls last; 0 when equal. */
function byNewest(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return instant(b) - instant(a);
}

/** 7.1.9: `pinned_at` not null first (newest pin first), then `last_activity_at` desc (nulls last), then `org.name`. */
export function orderInboxClubs(clubs: InboxClub[]): InboxClub[] {
  return [...clubs].sort((a, b) => {
    const pinned = (a.pinned_at === null ? 1 : 0) - (b.pinned_at === null ? 1 : 0);
    if (pinned !== 0) return pinned;
    if (a.pinned_at !== null && b.pinned_at !== null) {
      const byPin = byNewest(a.pinned_at, b.pinned_at);
      if (byPin !== 0) return byPin;
    }
    const byActivity = byNewest(a.last_activity_at, b.last_activity_at);
    if (byActivity !== 0) return byActivity;
    return a.org.name.localeCompare(b.org.name);
  });
}

// ── The club space (7.2) ─────────────────────────────────────────────────────

/**
 * 7.2.3 `can_post`: `board` → the viewer's role is in `BOARD_POSTER_ROLES`;
 * `event` → the room's state is not `closed`; else true. A TypeScript rule as
 * the thread list's (`threads/route.ts:789-803`); the thread GET's
 * `viewer.can_post` is the database's answer and wins on the screen.
 *
 * An extra room (`room`) also follows its `post_policy` (wave-3 contract
 * 4c.2, 4c.3): `officers` → owner or admin; `listed` → they, or a viewer on
 * the room's by-name list (`listed`); `everyone` → true. Every other kind
 * ignores both arguments, and their defaults are the rule before the column.
 */
export function spaceCanPost(
  kind: RoomKind,
  role: ClubRole | null,
  state: RoomState | null,
  policy: PostPolicy = "everyone",
  listed = false,
): boolean {
  const officer = role !== null && BOARD_POSTER_ROLES.includes(role);
  if (kind === "board") return officer;
  if (kind === "event") return state !== "closed";
  if (kind === "room") {
    if (policy === "officers") return officer;
    if (policy === "listed") return officer || listed;
  }
  return true;
}

const KIND_RANK: Readonly<Record<RoomKind, number>> = Object.freeze({ lounge: 0, board: 1, officers: 2, event: 3, room: 4 });

/**
 * A room of the space with its sort keys: `channels.position`, and for an
 * event room its state and start — from the `EventRef` when it was built,
 * else from the event row the route read (`roomState`, pure); null when
 * neither is known.
 */
export type SpaceRoomWithPosition = SpaceRoom & { position: number | null; state: RoomState | null; starts_at: string | null };

/**
 * 7.2.3's order: `lounge`, `board`, `officers`, event rooms with
 * `state !== "closed"` by `starts_at` asc, then `room`s by `position` then
 * `name`; closed event rooms are left out (reachable by URL, no chip). The
 * state and the start come from the ref or from the event row (the route
 * fills `state` / `starts_at` either way); an event room with neither
 * keeps its chip after the dated ones (an unknown state is not "closed").
 * Two rooms of one core kind (never, after A) stay in name order.
 */
export function orderSpaceRooms(rooms: SpaceRoomWithPosition[]): SpaceRoom[] {
  const kept = rooms.filter((room) => !(room.kind === "event" && room.state === "closed"));
  kept.sort((a, b) => {
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    if (a.kind === "event") {
      const startA = a.starts_at === null ? Number.POSITIVE_INFINITY : instant(a.starts_at);
      const startB = b.starts_at === null ? Number.POSITIVE_INFINITY : instant(b.starts_at);
      if (startA !== startB) return startA < startB ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    if (a.kind === "room") {
      const posA = a.position ?? Number.POSITIVE_INFINITY;
      const posB = b.position ?? Number.POSITIVE_INFINITY;
      if (posA !== posB) return posA < posB ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return kept.map(({ id, kind, name, unread, can_post, event, locked, post_policy }) => ({
    id,
    kind,
    name,
    unread,
    can_post,
    event,
    locked,
    post_policy,
  }));
}

/**
 * 7.2.4: the last message of an oldest-first page that is not `hidden` and
 * whose `removed` is null (RLS shows an author their own removed row; the
 * Board strip never previews it: INT-ADJUDICATE-9); none → null.
 */
export function lastShown<T extends { hidden: boolean; removed: unknown }>(messages: T[]): T | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].hidden && messages[i].removed === null) return messages[i];
  }
  return null;
}

/**
 * `board_recent` (wave-3 contract 4.2): of an oldest-first page, the last
 * `max` messages that `lastShown` would show, NEWEST first. Its first entry
 * is `lastShown`'s answer; none → `[]`.
 */
export function recentShown<T extends { hidden: boolean; removed: unknown }>(messages: T[], max: number): T[] {
  const recent: T[] = [];
  for (let i = messages.length - 1; i >= 0 && recent.length < max; i -= 1) {
    if (!messages[i].hidden && messages[i].removed === null) recent.push(messages[i]);
  }
  return recent;
}

/** The `EventRef` of each room of a list, by the room's event id; null where the ref is missing. */
export function refOfRoom(eventId: string | null, refs: ReadonlyMap<string, EventRef> | null): EventRef | null {
  if (eventId === null || refs === null) return null;
  return refs.get(eventId) ?? null;
}

/**
 * The authors an unread count leaves out: everyone blocked either way, so a
 * message the viewer cannot see never lights a dot or a number. On the Board
 * a blocked CURRENT owner / admin stays in (`isHiddenFrom`'s officer
 * exception: their top-level post still shows, so it still counts).
 * `officers` are the blocked people who hold that role in the room's club.
 */
export function unreadLeftOut(blocked: ReadonlySet<string>, roomKind: string | null, officers: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of blocked) {
    if (roomKind === "board" && officers.has(id)) continue;
    out.push(id);
  }
  return out;
}

/** The `not in` list PostgREST reads: `(a,b)`. The ids are uuids from the database. */
export function notInList(ids: readonly string[]): string {
  return `(${ids.join(",")})`;
}

// ── Followers (club model, Franky's calls of Oct 16) ─────────────────────────
// A follower reads the club's Board and nothing else: no Lounge, no
// Officers, no extra rooms, no event chats, and never a member's name in a
// list. Counts are public from 5 up.

/**
 * Below this a count is not shown to anyone outside the club. The same 5 as
 * `FOLLOWER_COUNT_FLOOR` (src/lib/orgs/following.ts); kept here because this
 * file imports nothing but `room-rules.ts` and types (batch 2A's
 * `publicMemberCount` is the same rule for the other surfaces).
 */
export const MEMBER_COUNT_FLOOR = 5;

/**
 * The member count a follower is shown: the exact number from 5 up, null
 * below 5 or when it could not be read (never 0 on a failed count: that
 * would be a number that is not true).
 */
export function followerMemberCount(count: number | null | undefined): number | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  return count >= MEMBER_COUNT_FLOOR ? count : null;
}

/**
 * The Board as a follower's space lists it: the only room, nothing to post,
 * no unread dot (a follower holds no `channel_members` row), public, the
 * Board's own rule.
 */
export function followerBoardRoom(board: { id: string; name: string | null }): SpaceRoom {
  return {
    id: board.id,
    kind: "board",
    name: typeof board.name === "string" ? board.name : "",
    unread: false,
    can_post: false,
    event: null,
    locked: false,
    post_policy: "everyone",
  };
}

/** `FollowedBoardsResponse`'s order: newest `latest` first, a Board with none last, then `org.name`. */
export function orderFollowedBoards(boards: FollowedBoard[]): FollowedBoard[] {
  return [...boards].sort((a, b) => {
    const byLatest = byNewest(a.latest?.created_at ?? null, b.latest?.created_at ?? null);
    if (byLatest !== 0) return byLatest;
    return a.org.name.localeCompare(b.org.name);
  });
}
