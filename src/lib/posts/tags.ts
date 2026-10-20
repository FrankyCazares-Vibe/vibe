/**
 * What a post tag is: ONE rule for every writer and reader (S67 security wave
 * B, shared contract B0; critique-B4 §4, product call 6; critique Oct 19,
 * 2026, batch B3, decisions 3-5).
 *
 * TWO RULES SINCE OCT 19, 2026. Franky tightened what a NEW post may store
 * without breaking the tags old posts already carry:
 *   - WRITE (publish, edit, every composer): 2-32 of `a-z`, `0-9`, `_` with
 *     at least one letter, at most 5 per post, never from inside a word or a
 *     link. {@link isNewPostTag}, {@link POST_TAG_MAX} and the text reader
 *     `extractPostTags` are defined in src/lib/posts/edit.ts (it must stay
 *     import-free for client bundles; this file pulls in the word filter)
 *     and re-exported here, so there is one definition.
 *   - READ (filters, links, Trending): {@link isValidPostTag}, 1-32 of the
 *     same characters, exactly what the database accepts. An old "#1" or a
 *     post's 8th tag still filters, links and counts.
 * Stored lower-case, without the `#`, no duplicates.
 *
 * THE DATABASE TWIN. `public.post_tags_ok(text[])` (migration
 * 20260929120000_post_tags_rules.sql, trigger `posts_check_tags`) enforces the
 * READ rule: `^[a-z0-9_]{1,32}$` per tag, `cardinality <= 10`, no duplicates,
 * no nulls. It was deliberately NOT tightened on Oct 19: old rows must stay
 * editable, and the write rule is stricter, which is the safe direction. The
 * JS side must never be LOOSER than the SQL side: a tag this module keeps and
 * the trigger refuses is a bare 500 on publish.
 *
 * WHY 32 AND ASCII. Production had 0 tags outside `^[a-z0-9_]{1,32}$` on
 * 2026-09-28. ASCII also shuts out look-alike letters (a Cyrillic "і" is not
 * folded by the word filter) on the one surface that shows a tag to a whole
 * campus. Since Oct 19 "#café" is no tag at all (it used to save as "caf").
 *
 * THE WORD FILTER runs per tag through `checkToken` (as-is AND with `_` read as
 * a space; see src/lib/moderation/token-filter.ts), at publish, at edit and
 * again when Trending counts, because a direct database write skips the
 * routes and the database can't run the word list.
 *
 * Relative, extensionless value import (the house pattern for pure modules,
 * e.g. profile-filter.ts): a node:test that loads this file needs the resolve
 * hook from text-filter.test.ts / tags.test.ts.
 */

import { checkToken } from "../moderation/token-filter";
import { isNewPostTag, POST_TAG_MAX } from "./edit";

// The write rule, defined once in edit.ts (see the header).
export { isNewPostTag, POST_TAG_MAX };

/** Longest tag, in characters (all ASCII, so UTF-16 units = code points). */
export const POST_TAG_MAX_LEN = 32;
/** One STORED tag (the read rule). Mirrors the SQL `'^[a-z0-9_]{1,32}$'`. */
export const POST_TAG_RE = /^[a-z0-9_]{1,32}$/;

/**
 * True for a tag exactly as the database stores it: `^[a-z0-9_]{1,32}$`.
 * The READ rule: use it to filter, link and count tags already stored (an old
 * "#1" still passes). For what a new post may store, use {@link isNewPostTag}.
 */
export function isValidPostTag(tag: unknown): tag is string {
  return typeof tag === "string" && POST_TAG_RE.test(tag);
}

/**
 * Client-sent tags → the tags to store. Each entry is trimmed, lower-cased
 * and loses its leading `#`s; anything that then fails the write rule
 * ({@link isNewPostTag}) is DROPPED (never truncated, never a 400: the post
 * still publishes). Duplicates collapse to the first; the result stops at
 * {@link POST_TAG_MAX} (5 since Oct 19, 2026). Anything but an array gives
 * `[]`. Every output also passes {@link isValidPostTag}, so the database
 * trigger never refuses what this returns. Does NOT run the word filter:
 * follow it with {@link firstBlockedTag}.
 */
export function normalizePostTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim().toLowerCase().replace(/^#+/, "");
    if (!isNewPostTag(tag) || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= POST_TAG_MAX) break;
  }
  return out;
}

/**
 * The first tag the word filter refuses, or null when every tag is fine.
 * Pass normalized tags (this module's or `extractPostTags`' output); a raw
 * value is still checked, since the filter does its own normalising.
 *
 * The returned tag is for the caller's branch and its tests only: NEVER echo
 * it to the student (answer with the ordinary `content_blocked` line).
 */
export function firstBlockedTag(tags: readonly string[]): string | null {
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    if (!checkToken(tag).ok) return tag;
  }
  return null;
}
