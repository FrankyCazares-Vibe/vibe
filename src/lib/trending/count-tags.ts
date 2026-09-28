/**
 * Trending tags: turn a week of post rows into the strip's ranked tags
 * (S67 security wave B, batch B4; report #10, product call 6).
 *
 * THE COUNT IS PEOPLE. A tag's number is how many DIFFERENT authors used it in
 * the rows given, so one student repeating a tag in one post, or posting it
 * twenty times, counts once. The strip's chip says "N people this week"
 * (`tagChipTitle` in src/components/campus/rolling-strip-view.ts).
 *
 * THE READ-SIDE GUARD IS NOT OPTIONAL. `authenticated` can still INSERT and
 * UPDATE `posts.tags` straight through the data API, which skips every route
 * check, and the database trigger (`posts_check_tags`, migration
 * 20260929120000) can check a tag's shape but can't run the word list. So a
 * tag is counted only when it passes the stored-tag grammar
 * (`isValidPostTag`) AND the tag word filter (`firstBlockedTag`, which reads
 * `_` as a space too). Anything else never reaches a whole campus's strip.
 *
 * THE FLOOR. {@link TRENDING_MIN_AUTHORS} is 1 during the pilot so the strip
 * isn't empty; raise it to 2 at the student launch (launch checklist) so one
 * person alone can't put a phrase in front of the whole campus.
 *
 * Pure, relative extensionless import (house pattern): a node:test that loads
 * this needs the resolve hook from src/lib/posts/tags.test.ts.
 */

import { firstBlockedTag, isValidPostTag } from "../posts/tags";

/** Different people a tag needs before it shows on the strip. Pilot: 1. Launch: 2. */
export const TRENDING_MIN_AUTHORS = 1;

/** One post row as the trending route reads it. Both fields are untrusted. */
export type TrendingRow = { tags: unknown; user_id: unknown };

/** One strip entry: the tag (no `#`) and how many different people used it. */
export type TrendingTag = { tag: string; count: number };

export type CountTrendingOptions = {
  /** Most entries to return. */
  limit: number;
  /** Different authors a tag needs to be listed (clamped to at least 1). */
  minAuthors: number;
};

/** A stored tag read back the way publish-post stores it: trimmed, lower-case, no `#`. */
function readTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().toLowerCase().replace(/^#+/, "");
  return isValidPostTag(tag) ? tag : null;
}

/**
 * Rank the tags in `rows` by how many different people used them, most
 * first, ties by tag (code-point order, so the order never depends on the
 * server's locale). A row without an author id or a tags array is skipped;
 * a tag that fails the grammar or the word filter is never counted.
 */
export function countTrendingTags(
  rows: ReadonlyArray<TrendingRow> | null | undefined,
  opts: CountTrendingOptions,
): TrendingTag[] {
  const limit = Number.isFinite(opts.limit) ? Math.max(0, Math.floor(opts.limit)) : 0;
  const minAuthors = Number.isFinite(opts.minAuthors) ? Math.max(1, Math.floor(opts.minAuthors)) : 1;
  if (limit === 0 || !rows) return [];

  const authorsByTag = new Map<string, Set<string>>();
  // The word filter runs once per distinct tag, not once per use.
  const blocked = new Map<string, boolean>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const author = row.user_id;
    if (typeof author !== "string" || !author) continue;
    if (!Array.isArray(row.tags)) continue;

    for (const raw of row.tags) {
      const tag = readTag(raw);
      if (!tag) continue;
      let isBlocked = blocked.get(tag);
      if (isBlocked === undefined) {
        isBlocked = firstBlockedTag([tag]) !== null;
        blocked.set(tag, isBlocked);
      }
      if (isBlocked) continue;
      let authors = authorsByTag.get(tag);
      if (!authors) {
        authors = new Set<string>();
        authorsByTag.set(tag, authors);
      }
      authors.add(author);
    }
  }

  const out: TrendingTag[] = [];
  for (const [tag, authors] of authorsByTag) {
    if (authors.size >= minAuthors) out.push({ tag, count: authors.size });
  }
  out.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return out.slice(0, limit);
}
