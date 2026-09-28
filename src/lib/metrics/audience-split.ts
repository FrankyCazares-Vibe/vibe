/**
 * The count and the name list, split so the count can never be steered.
 *
 * WHY THIS FILE EXISTS (security report 2026-09-27, finding #18, the
 * "mute-and-recount" oracle). The savers count and the free post-viewers
 * count used to be taken AFTER the owner's own blocked/muted people were
 * dropped. Muting is instant, silent and unlimited, so an author could mute a
 * suspect, re-read "N people saved this", and learn from a drop of exactly one
 * that the suspect saved it. Bisecting a group named every saver in a few
 * rounds, on a line that promises "Only you can see your saves".
 *
 * THE RULE (product call 7, handoffs/wave-plan-sec2/waveA-build.md): a count
 * is everyone, whatever the caller has muted or blocked; only the Vibe+ NAME
 * LIST leaves hidden people out. So the number never moves when you mute
 * someone, on any tier, and nothing the caller does to their own mute list can
 * be read back out of a number.
 *
 * PAGING FOLLOWS THE LIST, NEVER THE COUNT. The list is shorter than `total`
 * whenever a hidden person is in the audience, so `has_more` and
 * `next_offset` must come from the list's own length. Paging on `total` would
 * leave "Show more" on forever, appending nothing. Clients page on
 * `has_more`/`next_offset` (PostAudienceList.tsx, _postViewer.js,
 * ProfileViewersList.tsx), never on `total`.
 *
 * PURE ON PURPOSE. No imports at all, so node --test can load it: the
 * loaders that use it (post-audience.ts, profile-viewers.ts) import
 * "server-only", which node cannot resolve outside Next.
 */

export type AudienceSplit<T> = {
  /**
   * Distinct people in the audience. Nobody is taken out for being muted or
   * blocked by the caller. The caller must already have dropped the author
   * and collapsed the audience to one entry per person.
   */
  total: number;
  /** The same entries minus hidden people, in the order they came in. */
  listed: T[];
};

export type AudiencePage<T> = {
  page: T[];
  /** More of the LIST remains past this page. */
  has_more: boolean;
  /** Where the next page starts, counted in list entries consumed. */
  next_offset: number;
};

/**
 * Split one-per-person audience entries into the honest count and the list a
 * Vibe+ owner may see. `idOf` names the person on an entry; it defaults to
 * `user_id`, which is what the post audience loaders use.
 */
export function splitAudience<T>(
  entries: readonly T[],
  hiddenIds: Iterable<string>,
  idOf: (entry: T) => string = (e) => (e as { user_id: string }).user_id,
): AudienceSplit<T> {
  const hidden = hiddenIds instanceof Set ? (hiddenIds as Set<string>) : new Set(hiddenIds);
  const listed: T[] = [];
  for (const entry of entries) {
    if (!hidden.has(idOf(entry))) listed.push(entry);
  }
  return { total: entries.length, listed };
}

/**
 * One page of the visible list. `offset` and `limit` are clamped to sane
 * integers so a garbage query string cannot produce a negative slice or a
 * `next_offset` behind the one asked for.
 */
export function pageAudience<T>(
  listed: readonly T[],
  offset: number,
  limit: number,
): AudiencePage<T> {
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const size = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const page = listed.slice(start, start + size);
  const next_offset = start + page.length;
  return { page, has_more: next_offset < listed.length, next_offset };
}
