/**
 * `mergeFullPage(state, page)` — the every-5th-poll merge of a room thread
 * (handoffs/chat-redesign/wave-2-contracts.md 9.3, 11.5; W2-S2).
 *
 * The screens poll `?after=<cursor>` every 4 s; every 5th tick and on return
 * from the background they read the last page without `after` (`?limit=50`)
 * and merge it here, so votes, RSVP counts, reactions, reply counts,
 * removals and stubs catch up, and rows deleted or removed since fall out.
 *
 * Pure: no React, no DOM, no fetch. Both arrays are oldest first, as the
 * route sends them (`ThreadMessagesResponse.messages`).
 *
 * The rule, exactly 9.3:
 * - a row of the page replaces the row of the same id in state;
 * - a row of state whose `created_at >= page[0].created_at` (the page's
 *   oldest) and whose id is not in the page is dropped (deleted or removed
 *   since) — except a row whose id starts with `temp_` (an optimistic send in
 *   flight is never dropped here; N18);
 * - rows older than the page's oldest stay (earlier history loaded with
 *   `?before=`);
 * - a page row state did not have is added.
 *
 * An empty page drops nothing (there is no oldest to compare with): a room
 * whose every row was removed keeps what it has until the next `?after=`
 * or a reload; the route never answers an empty page for a room that has
 * rows.
 *
 * `created_at` strings compare as strings: the server sends them in one
 * format (ISO 8601, UTC, microseconds), so lexical order is time order, the
 * same comparison the route's `gte` makes.
 *
 * S71 amendment 3 (contract 17.10) added two more pure pairs below, read by
 * `use-room-poll.ts` only: `pageLeavesGap` / `applyFullPage` (D: a full
 * read that cannot join what the reads brought replaces the list; with the
 * read frontier, `applyAfterRows` and `afterAnswerJoins` since the repair) and
 * `arrivedFromOthers` / `markReadDecision` (C: when the open room is marked
 * read). `mergeFullPage` itself is unchanged.
 */

/** The three fields the merge reads; `ChatMessage` fits. */
export type MergeableRow = { id: string; created_at: string };

export const TEMP_ID_PREFIX = "temp_";

export function mergeFullPage<T extends MergeableRow>(state: readonly T[], page: readonly T[]): T[] {
  if (page.length === 0) return state.slice();
  const byId = new Map<string, T>();
  for (const row of page) byId.set(row.id, row);
  const oldest = page[0].created_at;

  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of state) {
    const fresh = byId.get(row.id);
    if (fresh !== undefined) {
      out.push(fresh);
      seen.add(row.id);
      continue;
    }
    if (row.created_at >= oldest && !row.id.startsWith(TEMP_ID_PREFIX)) continue;
    out.push(row);
  }
  for (const row of page) {
    if (!seen.has(row.id)) out.push(row);
  }
  // Oldest first, as both inputs were: a page row state lacked may be older
  // than a kept temp_ row or a row it slots between.
  out.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return out;
}

/** The newest `created_at` among rows; null for none. */
export function newestCreatedAt<T extends MergeableRow>(rows: readonly T[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    if (newest === null || row.created_at > newest) newest = row.created_at;
  }
  return newest;
}

/**
 * THE READ FRONTIER (S71 amendment 3 repair, D): the newest `created_at` a
 * READ delivered (the first page, a full read, an `?after=` read), kept by the
 * hook next to the list. A row the composer put on screen (`append`, then
 * `replace` with the POST's answer) never moves it: my own sent message being
 * the newest row on screen says nothing about the rows before it having been
 * read. The gap test and the `?after=` cursor both read the frontier, never
 * the list.
 *
 * `pageLeavesGap(frontier, page, pageLimit)` — true when a full read cannot
 * be merged without skipping messages (audit F08).
 *
 * Back from a locked phone on a busy room the newest 50 may all be newer than
 * what the reads brought: rows lie between that no read delivered, and
 * `mergeFullPage` would show the old rows and the page with nothing to say
 * some are missing.
 *
 * A gap = the page is FULL (`page.length >= pageLimit`, so older rows may
 * exist that it did not carry) and its oldest row is newer than the frontier.
 * A page that overlaps or touches what was read (its oldest is at or before
 * the frontier), or a page that is not full (it holds everything the room
 * has), leaves no gap.
 *
 * No frontier (no read has delivered a row yet) and a full page is a gap too:
 * the rows before the page were never read, and only `hasEarlier` reaches
 * them (the first read of a room is this case).
 */
export function pageLeavesGap<T extends MergeableRow>(frontier: string | null, page: readonly T[], pageLimit: number): boolean {
  if (page.length === 0 || page.length < pageLimit) return false;
  if (frontier === null) return true;
  return page[0].created_at > frontier;
}

/**
 * `applyFullPage(state, page, pageLimit, frontier)` — what a full read does to
 * the list on screen: `mergeFullPage` when the page joins what was read, and
 * on a gap (`pageLeavesGap`) the list is REPLACED by the page. `gap: true`
 * tells the hook to set `hasEarlier`, so `Earlier messages` pages back through
 * the rows in between.
 *
 * Kept after the page on a gap, in their order: the unsent `temp_` rows, and
 * the rows newer than the page's newest that the page does not hold. Past the
 * frontier those can only be my own sends whose POST answered while the read
 * was in flight (the page was taken before they existed); the next `?after=`
 * read starts at the page's newest, so a row that landed between the page and
 * my send still arrives and sorts above it.
 *
 * `frontier` in the answer: the page's newest row, the place the next
 * `?after=` read asks from. After a merge no server row newer than that is
 * left in the list (`mergeFullPage` drops them as deleted), so a page that
 * answered late, or after the newest rows were deleted, moves the frontier
 * BACK and the next `?after=` read brings back whatever still exists. An
 * empty page leaves it where it was.
 */
export function applyFullPage<T extends MergeableRow>(
  state: readonly T[],
  page: readonly T[],
  pageLimit: number,
  frontier: string | null,
): { messages: T[]; gap: boolean; frontier: string | null } {
  const next = newestCreatedAt(page) ?? frontier;
  if (!pageLeavesGap(frontier, page, pageLimit)) return { messages: mergeFullPage(state, page), gap: false, frontier: next };
  const inPage = new Set(page.map((row) => row.id));
  const pageNewest = next as string;
  const kept = state.filter(
    (row) => !inPage.has(row.id) && (row.id.startsWith(TEMP_ID_PREFIX) || row.created_at > pageNewest),
  );
  return { messages: [...page, ...kept], gap: true, frontier: next };
}

/**
 * `applyAfterRows(state, rows, frontier)` — what an `?after=<frontier>` read
 * does to the list: the rows the list lacks are added (oldest first; a row
 * that landed between the frontier and my own send sorts above my row, the
 * sort is stable), and the frontier moves to the newest row the read
 * delivered, known or not. `fresh`: the rows that were new to the list (the
 * mark-read rule reads them).
 */
export function applyAfterRows<T extends MergeableRow>(
  state: readonly T[],
  rows: readonly T[],
  frontier: string | null,
): { messages: T[]; fresh: T[]; frontier: string | null } {
  const known = new Set(state.map((row) => row.id));
  const fresh = rows.filter((row) => !known.has(row.id));
  const delivered = newestCreatedAt(rows);
  const next = delivered !== null && (frontier === null || delivered > frontier) ? delivered : frontier;
  if (fresh.length === 0) return { messages: state.slice(), fresh, frontier: next };
  const messages = [...state, ...fresh].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return { messages, fresh, frontier: next };
}

/**
 * `afterAnswerJoins(cursor, frontier)` — may an `?after=<cursor>` answer still
 * be added to the list? Its rows run on from `cursor`; the list is whole only
 * up to its frontier. A cursor past the frontier (a late full read moved the
 * frontier back while this read was out) would leave rows unread in between,
 * so the answer is dropped and the next tick asks again from the frontier.
 */
export function afterAnswerJoins(cursor: string, frontier: string | null): boolean {
  return frontier !== null && cursor <= frontier;
}

/**
 * The mark-read rule of a room on screen (S71 amendment 3, C; audit F05):
 * what the reader watched arrive is read.
 *
 * `arrivedFromOthers(rows, viewerId)`: at least one of the rows a read just
 * added is by someone else (my own send coming back is nothing new to me; a
 * stub, `user_id: ""`, is someone else's).
 */
export function arrivedFromOthers(rows: readonly { id: string; user_id: string }[], viewerId: string | null): boolean {
  return rows.some((row) => !row.id.startsWith(TEMP_ID_PREFIX) && row.user_id !== viewerId);
}

/**
 * `markReadDecision({ arrived, owed, visible })` → `{ mark, owed }`.
 *
 * - `arrived`: this read (or the mount) put rows on screen that a mark should
 *   cover; `owed`: an earlier one did and no mark went out since;
 * - visible → one mark for both, nothing owed after it;
 * - hidden → NEVER a mark: it stays owed until a read answers while the page
 *   is visible again, or until the hook's cleanup (which asks with
 *   `arrived: false`).
 *
 * One call per read, so at most one mark per tick.
 */
export function markReadDecision(input: { arrived: boolean; owed: boolean; visible: boolean }): { mark: boolean; owed: boolean } {
  const due = input.arrived || input.owed;
  if (!due) return { mark: false, owed: false };
  if (!input.visible) return { mark: false, owed: true };
  return { mark: true, owed: false };
}
