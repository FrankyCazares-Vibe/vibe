"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";

import {
  afterAnswerJoins,
  applyAfterRows,
  applyFullPage,
  arrivedFromOthers,
  markReadDecision,
  newestCreatedAt,
  TEMP_ID_PREFIX,
} from "./page-merge";
import type { Card, ChatMessage, ThreadMessagesResponse, ThreadRoom, ViewerInRoom } from "./types";

/**
 * `useRoomPoll(roomId, { enabled, initialPage? })` — the one reader of a club
 * room's thread on the wave-2 screens (handoffs/chat-redesign/wave-2-contracts.md
 * 11.5; the schedule is 9.3, D7; W2-S2). The Lounge, a `room`, the Board and
 * the event chat all read through it.
 *
 * The schedule (9.3):
 * - on mount: `GET /api/me/threads/<id>/messages?limit=50` (no `after`), or
 *   `initialPage` when given (a deep link's resolving read, 2.3; then no first
 *   read); `POST …/read` on mount;
 * - `?after=<cursor>&limit=200` every 4 s while `document.visibilityState ===
 *   "visible"`, `cursor` = the READ FRONTIER: the newest `created_at` a read
 *   delivered (the route's `after` is `gte`, so the cursor row comes back and
 *   is dropped by id; before a read delivered any row the tick is a full
 *   read). A row the composer put on screen (`append` / `replace`: my own
 *   send) never moves the frontier, so a message that landed just before my
 *   send is not skipped (amendment 3 repair);
 * - every 5th tick and on `visibilitychange` → visible: the last page without
 *   `after` (`?limit=50`) merged with `mergeFullPage` (a `temp_` row in flight is
 *   never dropped, N18); polling pauses while hidden;
 * - a FULL page whose oldest row is newer than the read frontier (back from a
 *   locked phone on a busy room: rows lie between that no read brought) is
 *   not merged: it REPLACES the list, the unsent `temp_` rows (and my sends
 *   newer than the page) kept at the end, and `hasEarlier` turns true so
 *   `Earlier messages` pages back through the gap (`applyFullPage`; S71
 *   amendment 3, D; audit F08). My own sent message on screen does not hide
 *   the gap: the test reads the frontier, not the list;
 * - a replace starts a new list (`epochRef`): an `Earlier messages` page or
 *   an `?after=` answer that was asked on the list before it is dropped, so
 *   rows of the old list are never glued to the new one over the gap;
 * - only the full reads update `room` / `viewer` / `viewerId`;
 * - a tick that fails is silent; the first read failing → `failure`
 *   (`LoadFailed` with `Couldn't load this chat.`, 1.2, N5; Retry = `reload`);
 * - mark-read (S71 amendment 3, C; audit F05: what I watched arrive is read):
 *   on mount; after a LATER full read that brought new rows (the mount's own
 *   first read is the mount's call); after a 4-s `?after=` read that appended
 *   at least one row by someone else; and on the way out (unmount, another
 *   room, `enabled` false) when rows by others arrived since the last mark.
 *   NEVER while the page is hidden: a mark that falls due then is owed, and
 *   goes out with the next read that answers while visible, or on the way
 *   out if the page is visible by then. One decision per read
 *   (`markReadDecision`), so at most one mark per tick; only the room the
 *   schedule is running on is marked. On a room with no row for me the update
 *   matches nothing and answers `{ ok: true }`; the screen does not
 *   special-case it;
 * - a tick that answers 403 / 404 sets `lostAccess` once and the ticks stop
 *   asking (a room the viewer lost answers the same every 4 s; S2-repair.md
 *   SEC2) until `reload()` reads it again;
 * - a read still "in flight" after four ticks counts as settled (a request the
 *   OS dropped without a rejection must not stop the polling for good;
 *   S2-repair.md B5).
 *
 * `messages` is oldest first, as the route sends it (the Board view reverses
 * for display). Stubs (8.1) stay in the array; the screens render nothing for
 * them.
 *
 * The state is tagged with the room it belongs to, so a `roomId` change reads
 * as "nothing yet" without a reset inside an effect; a response from a read
 * that outlived its room or its mount is dropped by generation.
 */

export const ROOM_POLL_MS = 4000;
export const ROOM_FULL_READ_EVERY = 5;
/** The page size of a full read and of `loadEarlier`. */
export const ROOM_PAGE_LIMIT = 50;
/** The cap of an `?after=` read. */
export const ROOM_AFTER_LIMIT = 200;
/** The first read's failure line (1.2). */
export const ROOM_LOAD_LINE = "Couldn't load this chat.";

export type RoomPollOptions = {
  /** False: no read and no polling (a room that is not open). */
  enabled: boolean;
  /** A deep link's resolving read (2.3): used as the first full read. */
  initialPage?: ThreadMessagesResponse;
  /**
   * The first read's failure line; `Couldn't load this chat.` when absent. The
   * Board reads through the same hook with `Couldn't load the Board.` (11.4;
   * S2-notes.md STOPPED 1).
   */
  line?: string;
};

export type RoomPoll = {
  /** Oldest first; null until the first read answered. */
  messages: ChatMessage[] | null;
  /** From the full reads only. */
  room: ThreadRoom | null;
  /** From the full reads only. */
  viewer: ViewerInRoom | null;
  /** From the full reads only. */
  viewerId: string | null;
  /** The first read's failure; null once a read answered. */
  failure: LoadFailure | null;
  /** `?before=<oldest created_at>&limit=50`, prepended. */
  loadEarlier: () => Promise<void>;
  /** `?after=<createdAt>&limit=1` and replace by id (the RSVP re-read of 4.3). */
  refreshOne: (createdAt: string) => Promise<void>;
  /** A sent or optimistic row at the end (oldest first); an existing id is replaced. */
  append: (message: ChatMessage) => void;
  /** A vote's answer: the card on the row with that id. */
  replaceCard: (id: string, card: Card) => void;
  /** A full read now; the first read again when it failed. */
  reload: () => Promise<void>;
  /**
   * True while the last page read (the first, or an earlier one) was full
   * (S2-notes.md STOPPED 2), and after a full read replaced the list over a
   * gap (amendment 3, D).
   */
  hasEarlier: boolean;
  /** The answer in the optimistic row's place; the row is dropped when the answer's id already arrived by a poll (S2-notes.md STOPPED 3). */
  replace: (id: string, message: ChatMessage) => void;
  /** A removed row, or an optimistic row whose send failed (S2-notes.md STOPPED 3). */
  remove: (id: string) => void;
  /**
   * True once a read AFTER the first answered 403 or 404: the viewer lost the
   * room (an RSVP change, a membership gone). The event chat layer closes on
   * it with `You left the event chat.` (11.6; S2-notes.md STOPPED 7). The
   * first read's refusal is `failure` instead.
   */
  lostAccess: boolean;
};

type RoomState = {
  roomId: string | null;
  messages: ChatMessage[] | null;
  room: ThreadRoom | null;
  viewer: ViewerInRoom | null;
  viewerId: string | null;
  failure: LoadFailure | null;
  hasEarlier: boolean;
  lostAccess: boolean;
  /**
   * The newest `created_at` a READ delivered (`page-merge.ts`, the read
   * frontier): the `?after=` cursor and the gap test. `append` / `replace` /
   * `remove` never write it.
   */
  readFrontier: string | null;
};

const EMPTY: RoomState = {
  roomId: null,
  messages: null,
  room: null,
  viewer: null,
  viewerId: null,
  failure: null,
  hasEarlier: false,
  lostAccess: false,
  readFrontier: null,
};

function fromPage(roomId: string, page: ThreadMessagesResponse): RoomState {
  return {
    roomId,
    messages: page.messages.slice(),
    room: page.room,
    viewer: page.viewer,
    viewerId: page.viewer_id,
    failure: null,
    hasEarlier: page.messages.length >= ROOM_PAGE_LIMIT,
    lostAccess: false,
    readFrontier: newestCreatedAt(page.messages),
  };
}

function threadUrl(roomId: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `/api/me/threads/${encodeURIComponent(roomId)}/messages${q ? `?${q}` : ""}`;
}

function oldestOf(messages: ChatMessage[] | null): string | null {
  let oldest: string | null = null;
  for (const m of messages ?? []) {
    if (m.id.startsWith(TEMP_ID_PREFIX)) continue;
    if (oldest === null || m.created_at < oldest) oldest = m.created_at;
  }
  return oldest;
}

/** A refusal a second try cannot change: the viewer is out of the room. */
function lostStatus(status: number): boolean {
  return status === 403 || status === 404;
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useRoomPoll(roomId: string | null, options: RoomPollOptions): RoomPoll {
  const { enabled, initialPage, line = ROOM_LOAD_LINE } = options;

  // The deep link's resolving read is the first full read: no request for it.
  const [state, setState] = useState<RoomState>(() =>
    roomId && initialPage ? fromPage(roomId, initialPage) : EMPTY,
  );
  // The latest state, for the reads that decide on it (cursor, oldest,
  // "first read") outside a render; every write goes through `commit`.
  const stateRef = useRef(state);
  // Bumped on every room change and unmount: a read that comes back with
  // another generation is dropped.
  const genRef = useRef(0);
  const tickRef = useRef(0);
  // Bumped when a full read REPLACES the list over a gap: a read asked on the
  // list before it (an earlier page, an `?after=`) must not add its rows to
  // the new one.
  const epochRef = useRef(0);
  const inFlightRef = useRef(false);
  const inFlightSinceRef = useRef(0);
  const lineRef = useRef(line);
  useEffect(() => {
    lineRef.current = line;
  }, [line]);

  const commit = useCallback((next: RoomState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const markRead = useCallback((id: string) => {
    // Best-effort and quiet, as ConversationView does: only the unread dot
    // would notice.
    void vibeRequest(`/api/me/threads/${encodeURIComponent(id)}/read`, {
      method: "POST",
      quiet: true,
      failure: "Couldn't mark this chat as read.",
    });
  }, []);

  // The room whose schedule is running (the hook is `enabled` on it): the
  // only room a read may mark. Null between schedules.
  const onScreenRef = useRef<string | null>(null);
  // True while rows by others are on screen that no mark covers: they landed
  // (or the room was mounted) while the page was hidden (amendment 3, C:
  // never a mark while hidden).
  const owedRef = useRef(false);

  /**
   * The one place a read marks the room (amendment 3, C): called once at the
   * end of every read that answered, so at most one mark per tick. `arrived`:
   * the read put rows on screen that a mark should cover. Hidden → owed, sent
   * by the next read that answers while visible, or by the cleanup.
   */
  const settleMark = useCallback(
    (id: string, arrived: boolean) => {
      if (onScreenRef.current !== id) return;
      const next = markReadDecision({ arrived, owed: owedRef.current, visible: isVisible() });
      owedRef.current = next.owed;
      if (next.mark) markRead(id);
    },
    [markRead],
  );

  /** The last page without `after`, merged (9.3) or, over a gap, put in the list's place. `first`: a failure is shown. */
  const readFull = useCallback(
    async (id: string, gen: number) => {
      const first = stateRef.current.roomId !== id || stateRef.current.messages === null;
      const r = await vibeRequest<ThreadMessagesResponse>(threadUrl(id, { limit: String(ROOM_PAGE_LIMIT) }), {
        quiet: true,
        failure: lineRef.current,
      });
      if (genRef.current !== gen) return;
      if (!r.ok || !Array.isArray(r.data?.messages)) {
        if (first) commit({ ...EMPTY, roomId: id, failure: asLoadFailure(r, lineRef.current) });
        else if (!r.ok && lostStatus(r.status) && !stateRef.current.lostAccess) commit({ ...stateRef.current, lostAccess: true });
        return;
      }
      const page = r.data;
      const prev = stateRef.current.roomId === id ? stateRef.current : { ...EMPTY, roomId: id };
      const known = new Set((prev.messages ?? []).map((m) => m.id));
      // "Brought new rows" against a page the state already holds; the first
      // page is the mount's read, which the schedule effect marks read once.
      const brought = prev.messages !== null && page.messages.some((m) => !known.has(m.id));
      // A full page that cannot join what is on screen (back from a locked
      // phone on a busy room) REPLACES it, the unsent `temp_` rows kept at the
      // end, and `hasEarlier` turns true: `Earlier messages` pages back
      // through the rows in between (amendment 3, D; audit F08).
      const applied = applyFullPage(prev.messages ?? [], page.messages, ROOM_PAGE_LIMIT, prev.readFrontier);
      if (applied.gap && prev.messages !== null) epochRef.current += 1;
      commit({
        roomId: id,
        messages: applied.messages,
        room: page.room,
        viewer: page.viewer,
        viewerId: page.viewer_id,
        failure: null,
        hasEarlier: prev.messages === null ? page.messages.length >= ROOM_PAGE_LIMIT : applied.gap || prev.hasEarlier,
        lostAccess: false,
        readFrontier: applied.frontier,
      });
      settleMark(id, brought);
    },
    [commit, settleMark],
  );

  /** `?after=<cursor>&limit=200`: the rows the state lacks, appended. Silent. */
  const readAfter = useCallback(
    async (id: string, gen: number, cursor: string) => {
      const epoch = epochRef.current;
      const r = await vibeRequest<ThreadMessagesResponse>(
        threadUrl(id, { after: cursor, limit: String(ROOM_AFTER_LIMIT) }),
        { quiet: true, failure: lineRef.current },
      );
      if (genRef.current !== gen) return;
      if (!r.ok && lostStatus(r.status) && stateRef.current.roomId === id) {
        if (!stateRef.current.lostAccess) commit({ ...stateRef.current, lostAccess: true });
        return;
      }
      if (!r.ok || !Array.isArray(r.data?.messages)) return;
      const prev = stateRef.current;
      if (prev.roomId !== id || prev.messages === null) return;
      // Asked on a list a full read has replaced since, or from a cursor the
      // frontier has moved back behind: these rows would not join what is on
      // screen. Dropped; the next tick asks from the frontier.
      if (epochRef.current !== epoch || !afterAnswerJoins(cursor, prev.readFrontier)) return;
      const applied = applyAfterRows(prev.messages, r.data.messages, prev.readFrontier);
      if (applied.fresh.length > 0 || applied.frontier !== prev.readFrontier) {
        commit({ ...prev, messages: applied.fresh.length > 0 ? applied.messages : prev.messages, readFrontier: applied.frontier });
      }
      // What I watched arrive is read (amendment 3, C; audit F05): a row by
      // someone else marks the room, once for this tick; a tick that brought
      // nothing still sends a mark that is owed.
      settleMark(id, arrivedFromOthers(applied.fresh, prev.viewerId));
    },
    [commit, settleMark],
  );

  // The schedule (9.3): the first read, the 4-s ticks while visible, the
  // full read on return from the background, the pause while hidden.
  useEffect(() => {
    if (!enabled || !roomId) return;
    const id = roomId;
    const gen = genRef.current + 1;
    genRef.current = gen;
    tickRef.current = 0;
    inFlightRef.current = false;
    onScreenRef.current = id;
    owedRef.current = false;

    const run = async (full: boolean, cursor: string | null) => {
      if (inFlightRef.current && performance.now() - inFlightSinceRef.current < ROOM_POLL_MS * 4) return;
      inFlightRef.current = true;
      inFlightSinceRef.current = performance.now();
      try {
        if (full || cursor === null) await readFull(id, gen);
        else await readAfter(id, gen, cursor);
      } finally {
        if (genRef.current === gen) inFlightRef.current = false;
      }
    };

    // The first read, unless the state already holds this room (the deep
    // link's page, or a return to a room read before).
    const held = stateRef.current.roomId === id && stateRef.current.messages !== null;
    if (!held) void run(true, null);
    // The mount's mark; a mount while the page is hidden owes it instead.
    settleMark(id, true);

    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => {
        if (!isVisible()) return;
        const cur = stateRef.current;
        // The viewer lost this room: no more asking until `reload()`.
        if (cur.roomId === id && cur.lostAccess) return;
        // A tick skipped for a read still in flight does not count, so the
        // every-5th full read is never the one skipped (9.3).
        if (inFlightRef.current && performance.now() - inFlightSinceRef.current < ROOM_POLL_MS * 4) return;
        tickRef.current += 1;
        const full = tickRef.current % ROOM_FULL_READ_EVERY === 0;
        // The cursor is the read frontier, never the newest row on screen: my
        // own sent row is not something a read brought.
        void run(full, cur.roomId === id ? cur.readFrontier : null);
      }, ROOM_POLL_MS);
    };
    const onVisibility = () => {
      if (isVisible()) {
        tickRef.current = 0;
        void run(true, null);
        start();
      } else {
        stop();
      }
    };
    if (isVisible()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving the room (unmount, another room, `enabled` false): rows by
      // others that arrived since the last mark are read, unless the page is
      // hidden (amendment 3, C).
      const last = markReadDecision({ arrived: false, owed: owedRef.current, visible: isVisible() });
      owedRef.current = false;
      onScreenRef.current = null;
      if (last.mark) markRead(id);
      // Anything still in flight answers to a generation nobody reads.
      genRef.current = gen + 1;
    };
  }, [enabled, roomId, readFull, readAfter, markRead, settleMark]);

  const loadEarlier = useCallback(async () => {
    const prev = stateRef.current;
    const id = prev.roomId;
    const oldest = oldestOf(prev.messages);
    if (!id || id !== roomId || oldest === null) return;
    const gen = genRef.current;
    const epoch = epochRef.current;
    const r = await vibeRequest<ThreadMessagesResponse>(
      threadUrl(id, { before: oldest, limit: String(ROOM_PAGE_LIMIT) }),
      { quiet: true, failure: lineRef.current },
    );
    if (genRef.current !== gen) return;
    if (!r.ok || !Array.isArray(r.data?.messages)) return;
    const cur = stateRef.current;
    if (cur.roomId !== id || cur.messages === null) return;
    // A full read replaced the list while this page was out, or another
    // earlier page landed first: these rows end before the OLD oldest row and
    // would sit under the new list with unread rows in between. Dropped;
    // `Earlier messages` asks again from the list as it is now.
    if (epochRef.current !== epoch || oldestOf(cur.messages) !== oldest) return;
    const known = new Set(cur.messages.map((m) => m.id));
    const earlier = r.data.messages.filter((m) => !known.has(m.id));
    commit({
      ...cur,
      messages: [...earlier, ...cur.messages],
      hasEarlier: r.data.messages.length >= ROOM_PAGE_LIMIT,
    });
  }, [commit, roomId]);

  const refreshOne = useCallback(
    async (createdAt: string) => {
      const id = stateRef.current.roomId;
      if (!id || id !== roomId) return;
      const gen = genRef.current;
      const r = await vibeRequest<ThreadMessagesResponse>(threadUrl(id, { after: createdAt, limit: "1" }), {
        quiet: true,
        failure: lineRef.current,
      });
      if (genRef.current !== gen) return;
      if (!r.ok || !Array.isArray(r.data?.messages)) return;
      const cur = stateRef.current;
      if (cur.roomId !== id || cur.messages === null) return;
      const fresh = new Map(r.data.messages.map((m) => [m.id, m] as const));
      if (fresh.size === 0) return;
      commit({ ...cur, messages: cur.messages.map((m) => fresh.get(m.id) ?? m) });
    },
    [commit, roomId],
  );

  const append = useCallback(
    (message: ChatMessage) => {
      const cur = stateRef.current;
      if (cur.roomId !== roomId) return;
      const rows = cur.messages ?? [];
      const messages = rows.some((m) => m.id === message.id)
        ? rows.map((m) => (m.id === message.id ? message : m))
        : [...rows, message];
      commit({ ...cur, messages });
    },
    [commit, roomId],
  );

  const replace = useCallback(
    (id: string, message: ChatMessage) => {
      const cur = stateRef.current;
      if (cur.roomId !== roomId || cur.messages === null) return;
      // The answer's row already arrived by a poll: the optimistic row goes.
      if (id !== message.id && cur.messages.some((m) => m.id === message.id)) {
        commit({ ...cur, messages: cur.messages.filter((m) => m.id !== id) });
        return;
      }
      commit({ ...cur, messages: cur.messages.map((m) => (m.id === id ? message : m)) });
    },
    [commit, roomId],
  );

  const remove = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      if (cur.roomId !== roomId || cur.messages === null) return;
      if (!cur.messages.some((m) => m.id === id)) return;
      commit({ ...cur, messages: cur.messages.filter((m) => m.id !== id) });
    },
    [commit, roomId],
  );

  const replaceCard = useCallback(
    (id: string, card: Card) => {
      const cur = stateRef.current;
      if (cur.roomId !== roomId || cur.messages === null) return;
      if (!cur.messages.some((m) => m.id === id)) return;
      commit({ ...cur, messages: cur.messages.map((m) => (m.id === id ? { ...m, card } : m)) });
    },
    [commit, roomId],
  );

  const reload = useCallback(async () => {
    if (!roomId) return;
    const cur = stateRef.current;
    // Retry after a failed first read: the skeleton again, then the read.
    if (cur.roomId === roomId && cur.messages === null && cur.failure !== null) {
      commit({ ...EMPTY, roomId });
    }
    await readFull(roomId, genRef.current);
  }, [commit, readFull, roomId]);

  const mine = state.roomId !== null && state.roomId === roomId;
  return {
    messages: mine ? state.messages : null,
    room: mine ? state.room : null,
    viewer: mine ? state.viewer : null,
    viewerId: mine ? state.viewerId : null,
    failure: mine ? state.failure : null,
    hasEarlier: mine ? state.hasEarlier : false,
    lostAccess: mine ? state.lostAccess : false,
    loadEarlier,
    refreshOne,
    append,
    replaceCard,
    reload,
    replace,
    remove,
  };
}
