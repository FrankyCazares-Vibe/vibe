"use client";

import { useEffect, useState } from "react";

/**
 * When I last read each Board I follow (wave-2 repair, finding 12): a
 * follower holds no `channel_members` row, so the server keeps no read mark
 * for them, and this browser does instead. A per-viewer convenience only:
 * storage that is empty, blocked or throws reads as "seen nothing", which
 * marks every Board with a post as new until it is opened, never the other
 * way round. `boardHasNew` (club/helpers.ts) decides; this only remembers.
 */

const KEY = "vibe.followed-board-seen.v1";
const EVENT = "vibe:followed-board-seen";
/** Boards remembered at most (the follows list is capped at 50). */
const MAX_BOARDS = 200;

type Seen = Record<string, string>;

/** The newest post time I have seen on each Board, by its room id. */
export function readBoardSeen(): Seen {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Seen = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) if (typeof at === "string") out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** Remember that the Board's posts up to `at` were on my screen (never moves back). */
export function markBoardSeen(roomId: string, at: string | null | undefined): void {
  if (!roomId || !at || !Number.isFinite(Date.parse(at))) return;
  const seen = readBoardSeen();
  const before = seen[roomId];
  if (before && Date.parse(before) >= Date.parse(at)) return;
  seen[roomId] = at;
  const ids = Object.keys(seen);
  if (ids.length > MAX_BOARDS) {
    ids.sort((a, b) => Date.parse(seen[a]) - Date.parse(seen[b]));
    for (const id of ids.slice(0, ids.length - MAX_BOARDS)) delete seen[id];
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Blocked storage: the mark lasts until the page goes, nothing more.
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // No window events (a test): nothing listens.
  }
}

/** `readBoardSeen`, kept current while the list is on screen (this tab and others). */
export function useBoardSeen(): Seen {
  const [seen, setSeen] = useState<Seen>({});
  useEffect(() => {
    const read = () => setSeen(readBoardSeen());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return seen;
}
