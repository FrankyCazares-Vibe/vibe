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

import { BOARD_POSTER_ROLES } from "./room-rules";
import type { ClubRole, EventRef, InboxClub, MessageKind, Preview, RoomKind, RoomState, SpaceRoom } from "./types";

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
  users?: { name?: unknown } | null;
};

/** `messages.kind` as the screens read it; anything else (an old row, a stub) is text. */
export function messageKindOf(value: unknown): MessageKind {
  return value === "poll" || value === "event_card" ? value : "text";
}

/** `Preview = { id, text: content, author_name: row.users?.name ?? "", created_at, kind }` (7.1.4). */
export function toPreview(row: PreviewRow): Preview {
  const name = row.users?.name;
  return {
    id: row.id,
    text: typeof row.content === "string" ? row.content : "",
    author_name: typeof name === "string" ? name : "",
    created_at: row.created_at,
    kind: messageKindOf(row.kind),
  };
}

/**
 * Per room, the newest row that is not hidden from the viewer: the rows come
 * newest first, so the first row per channel that `hidden` lets through is
 * the preview. A room whose window holds only hidden rows has no entry
 * (`latest: null`, 7.1.4).
 */
export function latestShownPerRoom(rows: PreviewRow[], hidden: (row: PreviewRow) => boolean): Map<string, Preview> {
  const latest = new Map<string, Preview>();
  for (const row of rows) {
    if (latest.has(row.channel_id)) continue;
    if (hidden(row)) continue;
    latest.set(row.channel_id, toPreview(row));
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
 */
export function spaceCanPost(kind: RoomKind, role: ClubRole | null, state: RoomState | null): boolean {
  if (kind === "board") return role !== null && BOARD_POSTER_ROLES.includes(role);
  if (kind === "event") return state !== "closed";
  return true;
}

const KIND_RANK: Readonly<Record<RoomKind, number>> = Object.freeze({ lounge: 0, board: 1, officers: 2, event: 3, room: 4 });

/** A room of the space with its sort key from `channels.position`. */
export type SpaceRoomWithPosition = SpaceRoom & { position: number | null };

/**
 * 7.2.3's order: `lounge`, `board`, `officers`, event rooms with
 * `state !== "closed"` by `starts_at` asc, then `room`s by `position` then
 * `name`; closed event rooms are left out (reachable by URL, no chip). An
 * event room whose `EventRef` could not be built keeps its chip after the
 * dated ones (an unknown state is not "closed"). Two rooms of one core kind
 * (never, after A) stay in name order.
 */
export function orderSpaceRooms(rooms: SpaceRoomWithPosition[]): SpaceRoom[] {
  const kept = rooms.filter((room) => !(room.kind === "event" && room.event?.state === "closed"));
  kept.sort((a, b) => {
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    if (a.kind === "event") {
      const startA = a.event ? instant(a.event.starts_at) : Number.POSITIVE_INFINITY;
      const startB = b.event ? instant(b.event.starts_at) : Number.POSITIVE_INFINITY;
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
  return kept.map(({ id, kind, name, unread, can_post, event }) => ({ id, kind, name, unread, can_post, event }));
}

/** 7.2.4: the last message of an oldest-first page that is not `hidden`; none → null. */
export function lastShown<T extends { hidden: boolean }>(messages: T[]): T | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].hidden) return messages[i];
  }
  return null;
}

/** The `EventRef` of each room of a list, by the room's event id; null where the ref is missing. */
export function refOfRoom(eventId: string | null, refs: ReadonlyMap<string, EventRef> | null): EventRef | null {
  if (eventId === null || refs === null) return null;
  return refs.get(eventId) ?? null;
}
