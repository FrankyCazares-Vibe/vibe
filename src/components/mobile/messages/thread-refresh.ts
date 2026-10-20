/**
 * The open dm or group on the phone, kept current (Oct 20, 2026; the
 * follow-up of handoffs/2026-10-19-critique/batch-B7.md). `ConversationView`
 * used to read the thread once, so the other person's open chat kept a
 * message its sender had deleted (and never showed a new one) until it was
 * reopened. It now reads it again the way the desktop pane does
 * (public/html/messages.html `__dmLoadMessages`, `POLL_MS` 2000): the last
 * page, `?limit=50`, every 2 s while the page is visible, merged into what is
 * on screen. No new realtime channel: the app has none, and the desktop's
 * read already answers every case (a new message, a note, a reaction, a
 * removal).
 *
 * PURE: no React, no DOM, no fetch, so `node --test` loads it.
 */

import { mergeFullPage, TEMP_ID_PREFIX } from "@/lib/chat/page-merge";

/** How often the open chat reads its last page again: the desktop pane's `POLL_MS`. */
export const THREAD_REFRESH_MS = 2000;

/**
 * A read still out after this long counts as settled, so a request the OS
 * dropped without an answer never stops the refresh for good (the club
 * rooms' rule, `use-room-poll.ts`).
 */
export const THREAD_REFRESH_STUCK_MS = THREAD_REFRESH_MS * 4;

/** What the rule reads of a row; `MessageRow` fits. */
export type RefreshRow = { id: string; created_at: string; user_id: string; deleted?: boolean };

export type ThreadRefresh<T> = {
  /**
   * The list to show: `mergeFullPage(current, page)`, each row that reads
   * the same as before kept as the same object, and `current` itself when
   * nothing changed (`changed` false: no new state, no re-render every 2 s).
   */
  messages: T[];
  changed: boolean;
  /** A row by someone else that was not on screen: the chat is marked read again. */
  arrived: boolean;
  /**
   * Rows on screen that this read turned into the note or took away: a reply
   * being written to one lets go, and the pinned list is read again.
   */
  goneIds: string[];
};

/**
 * What one refresh read does to the list on screen.
 *
 * `null` (drop the answer, change nothing) when:
 * - `busy`: a change of mine is still out (a send, a reaction, a delete):
 *   the read may hold its row, or not yet, and merging it would duplicate a
 *   row or put back what I just changed;
 * - the list changed since the read went out (`current !== startedWith`):
 *   the read may predate that change. The next tick asks again;
 * - nothing has loaded yet (`current` null): the first read owns that.
 *
 * Otherwise `mergeFullPage`: the page's rows replace their own, rows in the
 * page's span that it no longer holds go (deleted or removed since), older
 * rows stay, an unsent `temp_` row is never dropped. The media addresses
 * are stable (message-read.ts `prepareForClient`), so a row nobody touched
 * reads the same every time.
 */
export function applyThreadRefresh<T extends RefreshRow>(
  current: readonly T[] | null,
  startedWith: readonly T[] | null,
  page: readonly T[],
  viewerId: string | null,
  busy: boolean,
): ThreadRefresh<T> | null {
  if (busy || current === null || current !== startedWith) return null;
  const before = new Map(current.map((m) => [m.id, m]));
  const merged = mergeFullPage(current, page).map((m) => {
    const old = before.get(m.id);
    return old !== undefined && sameRow(old, m) ? old : m;
  });
  const changed = merged.length !== current.length || merged.some((m, i) => m !== current[i]);
  const messages = changed ? merged : (current as T[]);
  const after = new Map(messages.map((m) => [m.id, m]));
  const arrived = page.some((m) => !before.has(m.id) && !m.id.startsWith(TEMP_ID_PREFIX) && m.user_id !== viewerId);
  const goneIds: string[] = [];
  for (const m of current) {
    const now = after.get(m.id);
    if (!now || (now.deleted === true && m.deleted !== true)) goneIds.push(m.id);
  }
  return { messages, changed, arrived, goneIds };
}

/** Two rows that read the same: the route's JSON, compared as JSON (one key order from one server). */
function sameRow(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
