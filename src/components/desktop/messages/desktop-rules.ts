/**
 * Desktop Messages' pure rules (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.4; W3-1-pure): which pane an id opens, the slim list of names
 * beside an open chat, the wide list's search, how many week cards the band
 * holds, where a right panel goes, and the history entry of an open chat.
 * No React, no DOM: `home-rules.ts`, `format.ts` and types only, so
 * `node --test` loads it (desktop-rules.test.ts).
 *
 * The order, the unread and muted tests and every spoken row name are the
 * phone's own (`home-rules.ts`), and so are a person's or a group's title and
 * photo (`format.ts`, the pair `PersonRow` draws with): called, never
 * re-written.
 */

import type { FollowedBoard, InboxClub, RoomKind } from "@/lib/chat/types";
import { threadAvatar, threadTitle } from "@/components/mobile/messages/format";
import {
  clubHasUnread,
  clubRowLabel,
  isMuted,
  mergeHomeRows,
  personRowLabel,
  type HomeRow,
} from "@/components/mobile/messages/home/home-rules";
import type { ThreadEntry } from "@/components/mobile/messages/types";
import { boardHasNew, followedBoardLabel } from "@/components/mobile/messages/club/helpers";

export type KnownChat = { kind: "dm" } | { kind: "club"; orgHandle: string; roomKind: RoomKind };

/**
 * What the lists already say about an id: a thread or a request with that id
 * is a dm (or a group: the same pane); a club whose Board or Lounge is the id
 * is that club. Null for anything else (an event chat, the Officers room, an
 * extra room, a chat the lists have not loaded): the shell does the resolving
 * read (3.5 rule 1).
 */
export function knownChat(
  id: string,
  threads: ThreadEntry[] | null,
  requests: ThreadEntry[] | null,
  clubs: InboxClub[] | null,
): KnownChat | null {
  if (!id) return null;
  if ((threads ?? []).some((t) => t.id === id) || (requests ?? []).some((t) => t.id === id)) return { kind: "dm" };
  for (const club of clubs ?? []) {
    if (club.board.room_id === id) return { kind: "club", orgHandle: club.org.handle, roomKind: "board" };
    if (club.lounge.room_id === id) return { kind: "club", orgHandle: club.org.handle, roomKind: "lounge" };
  }
  return null;
}

export type OpenChat =
  | { kind: "club"; orgId: string | null; orgHandle: string; name: string; logoUrl: string | null; roomId: string }
  | { kind: "dm"; threadId: string; name: string; avatarUrl: string | null; group: boolean };

export type SlimRow = {
  /** `club:<org id>` or `thread:<id>`. */
  key: string;
  kind: "club" | "dm" | "group";
  name: string;
  avatarUrl: string | null;
  /** Feeds `clubGradient` / `personColor`. */
  seed: string;
  /** The chat on screen. A click on this row opens nothing: see `target`. */
  open: boolean;
  /** Always null on the open row. */
  dot: "coral" | "ring" | null;
  /** `aria-label`: `clubRowLabel` / `personRowLabel`, or the name alone for a supplied row. */
  label: string;
  /** `/messages?channel=<id>`. */
  href: string;
  /**
   * Where a click on the row goes. On the open row the target is the room
   * already open, and its `roomKind` may be the placeholder `"room"` (an event
   * chat and the Officers room are named so too: `OpenChat` carries no kind):
   * never act on it. Every other club row names its Board or its Lounge.
   */
  target: { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind } | { kind: "dm"; threadId: string };
};

/** `PersonRow`'s colour seed: the peer in a dm, the thread itself in a group. */
const threadSeed = (t: ThreadEntry): string => (t.type === "dm" ? (t.peer?.id ?? t.id) : t.id);

const sameHandle = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const isOpenClub = (club: InboxClub, open: OpenChat | null): open is Extract<OpenChat, { kind: "club" }> =>
  open?.kind === "club" && (open.orgId === club.org.id || sameHandle(open.orgHandle, club.org.handle));

/**
 * The kind of the open club's room as far as the lists can say it: its Board
 * or its Lounge by id. `OpenChat` carries no kind, so any other room (an
 * event chat, the Officers room, an extra room) is named `room`: none of
 * those is drawn as a Board, and the row is the open one, so its target opens
 * nothing new.
 */
function openRoomKind(roomId: string, club: InboxClub | null): RoomKind {
  if (club?.board.room_id === roomId) return "board";
  if (club?.lounge.room_id === roomId) return "lounge";
  return "room";
}

function clubRow(club: InboxClub, open: OpenChat | null, now: Date): SlimRow {
  const mine = isOpenClub(club, open) ? open : null;
  // `ClubRow`'s rule: the Board when only the Board is unread, else the Lounge.
  const toBoard = club.board.unread && club.lounge.unread_count === 0;
  const roomId = mine ? mine.roomId : toBoard ? club.board.room_id : club.lounge.room_id;
  const roomKind = mine ? openRoomKind(mine.roomId, club) : toBoard ? "board" : "lounge";
  return {
    key: `club:${club.org.id}`,
    kind: "club",
    name: club.org.name,
    avatarUrl: club.org.logo_url,
    seed: club.org.id,
    open: !!mine,
    // H3: coral for an unread Board post, the hollow ring for new Lounge messages only.
    dot: mine ? null : club.board.unread ? "coral" : club.lounge.unread_count > 0 ? "ring" : null,
    label: clubRowLabel(club, now),
    href: chatEntry(roomId).url,
    target: { kind: "club", orgHandle: club.org.handle, roomId, roomKind },
  };
}

function threadRow(thread: ThreadEntry, isOpen: boolean, now: Date): SlimRow {
  return {
    key: `thread:${thread.id}`,
    kind: thread.type === "dm" ? "dm" : "group",
    name: threadTitle(thread),
    avatarUrl: threadAvatar(thread).url,
    seed: threadSeed(thread),
    open: isOpen,
    dot: !isOpen && thread.unread ? "coral" : null,
    label: personRowLabel(thread, now),
    href: chatEntry(thread.id).url,
    target: { kind: "dm", threadId: thread.id },
  };
}

/**
 * The row of an open chat that is in neither list (a request, a club the
 * inbox does not list, a dm made a moment ago), built from `open`. A request
 * is looked up in `requests` only for what `open` may lack: its colour seed,
 * and its name and photo while the shell has none yet.
 */
function suppliedRow(open: OpenChat, requests: readonly ThreadEntry[]): SlimRow {
  if (open.kind === "club") {
    return {
      key: `club:${open.orgId ?? open.orgHandle}`,
      kind: "club",
      name: open.name,
      avatarUrl: open.logoUrl,
      seed: open.orgId ?? open.orgHandle,
      open: true,
      dot: null,
      label: open.name,
      href: chatEntry(open.roomId).url,
      target: { kind: "club", orgHandle: open.orgHandle, roomId: open.roomId, roomKind: openRoomKind(open.roomId, null) },
    };
  }
  const request = requests.find((r) => r.id === open.threadId) ?? null;
  const name = open.name || (request ? threadTitle(request) : open.group ? "Group" : "Direct message");
  const photo = request ? threadAvatar(request).url : null;
  return {
    key: `thread:${open.threadId}`,
    kind: open.group ? "group" : "dm",
    name,
    avatarUrl: open.avatarUrl ?? photo,
    seed: request ? threadSeed(request) : open.threadId,
    open: true,
    dot: null,
    label: name,
    href: chatEntry(open.threadId).url,
    target: { kind: "dm", threadId: open.threadId },
  };
}

/**
 * How many rows the slim list fills up to with recent chats (Franky, Oct 4:
 * with only pinned and unread chats it was often two or three names). Pinned,
 * unread and open rows are never dropped to make room for a recent one.
 */
export const SLIM_TARGET = 8;

/**
 * The slim list beside an open chat (H3, H14). Order = `mergeHomeRows(clubs,
 * threads)`. A row is KEPT when it is pinned, or unread and not muted, or it
 * is the open chat. The list is then filled, in that same order, with the
 * most recent other chats until it holds `SLIM_TARGET` rows; a filled row is
 * quiet (no dot, even for a muted chat with something unread). A club row
 * targets the Board when only the Board is unread, else the Lounge
 * (`ClubRow`'s rule); the open club's row targets the room that is open, so
 * nothing new (its `roomKind` is not to be acted on: `SlimRow.target`). When
 * the open chat is in neither list, one row built from `open` is put FIRST
 * and counts toward the target. Kept rows have no cap: the column scrolls.
 */
export function slimRows(
  clubs: InboxClub[],
  threads: ThreadEntry[],
  requests: ThreadEntry[],
  open: OpenChat | null,
  now: Date,
): SlimRow[] {
  const listed: Array<{ row: SlimRow; kept: boolean }> = [];
  let openListed = false;
  for (const row of mergeHomeRows(clubs, threads)) {
    if (row.kind === "club") {
      const { club } = row;
      const isOpen = isOpenClub(club, open);
      if (isOpen) openListed = true;
      const kept = isOpen || !!club.pinned_at || (clubHasUnread(club) && !isMuted(club.muted_until, now));
      listed.push({ row: clubRow(club, open, now), kept });
    } else {
      const { thread } = row;
      const isOpen = open?.kind === "dm" && open.threadId === thread.id;
      if (isOpen) openListed = true;
      const kept = isOpen || !!thread.pinned_at || (!!thread.unread && !isMuted(thread.muted_until, now));
      listed.push({ row: threadRow(thread, isOpen, now), kept });
    }
  }
  const supplied = open && !openListed ? suppliedRow(open, requests) : null;
  let room = SLIM_TARGET - listed.filter((entry) => entry.kept).length - (supplied ? 1 : 0);
  const rows: SlimRow[] = [];
  for (const { row, kept } of listed) {
    if (kept) rows.push(row);
    else if (room > 0) {
      rows.push({ ...row, dot: null });
      room -= 1;
    }
  }
  return supplied ? [supplied, ...rows] : rows;
}

/**
 * The slim list with the Boards I follow under its chats (wave-2 repair,
 * finding 12): one row per Board, a club row that opens the Board, the coral
 * dot for a post newer than this browser showed (`seen`, board-seen.ts). The
 * open Board is its own row in place, never a second supplied row on top.
 */
export function withFollowedBoards(
  rows: SlimRow[],
  boards: readonly FollowedBoard[],
  open: OpenChat | null,
  seen: Readonly<Record<string, string>>,
  now: Date,
): SlimRow[] {
  if (boards.length === 0) return rows;
  const boardRows = boards.map((b): SlimRow => {
    const isOpen = open?.kind === "club" && (open.orgId === b.org.id || sameHandle(open.orgHandle, b.org.handle));
    const isNew = !isOpen && boardHasNew(b.latest?.created_at, seen[b.room_id]);
    return {
      key: `club:${b.org.id}`,
      kind: "club",
      name: b.org.name,
      avatarUrl: b.org.logo_url,
      seed: b.org.id,
      open: isOpen,
      dot: isNew ? "coral" : null,
      label: followedBoardLabel(b, now, isNew),
      href: chatEntry(b.room_id).url,
      target: { kind: "club", orgHandle: b.org.handle, roomId: b.room_id, roomKind: "board" },
    };
  });
  const keys = new Set(boardRows.map((r) => r.key));
  const openBoard = boardRows.find((r) => r.open) ?? null;
  // A supplied open row for a followed Board gives way to the Board's own row.
  const kept = rows.filter((r) => !(openBoard && r.open && r.key === openBoard.key) && !(keys.has(r.key) && !r.open));
  return [...kept, ...boardRows.filter((r) => !kept.some((k) => k.key === r.key))];
}

/** The names a row can be found by: the club's, the person's, the group's and its members'. */
const rowNames = (row: HomeRow): string[] =>
  row.kind === "club"
    ? [row.club.org.name]
    : [threadTitle(row.thread), ...(row.thread.type === "dm" ? [] : (row.thread.members ?? []).map((m) => m.name ?? ""))];

/**
 * The wide list's search (H5): the loaded rows whose club name, person name,
 * group name or a group member's name includes the query, whatever the case.
 * No route. An empty query (or spaces alone) answers `rows` itself.
 */
export function searchRows(rows: HomeRow[], query: string): HomeRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => rowNames(row).some((name) => name.toLowerCase().includes(q)));
}

/** A week card's slot in the band: 168 wide at least, plus the 8 gap. */
const BAND_CARD = 176;
/** The `+N` chip's slot. */
const BAND_MORE = 64;

/**
 * How many week cards the band draws, and how many the `+N` chip stands for
 * (H7). `fixedWidth` is the MEASURED width of the band's left block (the
 * title, the arrows, the `This week` pill when it shows, the seven days): the
 * band reads it from the same `ResizeObserver` that gives `bandWidth`. About
 * 560 on this week, 80 to 90 more on another; no constant lives here.
 *
 * cards = min(count, floor((bandWidth - fixedWidth) / 176)), never below 0;
 * when they do not all fit, the fit is taken again with 64 less (the chip's
 * own room) and `more` is the rest.
 */
export function bandFit(bandWidth: number, fixedWidth: number, count: number): { cards: number; more: number } {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const fit = (room: number) => (Number.isFinite(room) ? Math.max(0, Math.min(total, Math.floor(room / BAND_CARD))) : 0);
  const all = fit(bandWidth - fixedWidth);
  if (all >= total) return { cards: all, more: 0 };
  const cards = fit(bandWidth - fixedWidth - BAND_MORE);
  return { cards, more: total - cards };
}

/** The slim list's column (3.2). */
const SLIM_WIDTH = 232;
/** The least a pane keeps beside a panel drawn as a column. */
const PANE_MIN = 420;

/**
 * Where a right panel goes (3.2, S7). It fits when `contentWidth >= 232 + 420
 * + panelWidth`. Fits: a column (`side`), unless the stored choice is `"0"`
 * and nobody opened it in this visit. Does not fit: over the pane
 * (`overlay`) only when it was opened by a click in this visit, else hidden;
 * a stored `"1"` never opens an overlay by itself.
 */
export function panelMode(
  contentWidth: number,
  panelWidth: number,
  pref: "1" | "0" | null,
  openedHere: boolean,
): "side" | "overlay" | "hidden" {
  const fits = contentWidth >= SLIM_WIDTH + PANE_MIN + panelWidth;
  if (fits) return pref === "0" && !openedHere ? "hidden" : "side";
  return openedHere ? "overlay" : "hidden";
}

/** The history entry of an open chat (3.5): the phone's state shape, always at depth 1, and its address. */
export function chatEntry(id: string): { state: { vibeChat: string; depth: 1 }; url: string } {
  return { state: { vibeChat: id, depth: 1 }, url: "/messages?channel=" + encodeURIComponent(id) };
}
