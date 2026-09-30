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
