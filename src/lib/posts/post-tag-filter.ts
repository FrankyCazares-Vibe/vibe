/**
 * The tag word filter for a post, the same way at publish AND at edit
 * (S67 security wave B polish P1b; crosscheck-waveB "Tags").
 *
 * WHAT IT CHECKS. The tags the post STORES plus every #tag a reader SEES in
 * its text. Those are not the same list: the stored tags are ASCII only, the
 * first 10, at most 32 characters each (`extractPostTags` at edit,
 * `normalizePostTags` at publish), so an eleventh tag, a `#café_<term>` or a
 * tag longer than 32 characters shows in the caption but is never stored.
 * `captionHashtags` returns all of them, uncapped, and `firstBlockedTag`
 * reads `_` as a space (the caption's own `checkText` misses a term glued on
 * with `_`).
 *
 * WHO CALLS IT. PATCH /api/posts/[id] (an edit), with
 * `extractPostTags(content)` as the stored tags. publish-post runs the same
 * expression inline: `firstBlockedTag([...tags, ...captionHashtags(content)])`.
 * Keep the two identical.
 *
 * The returned tag is for the caller's branch and its tests only: NEVER echo
 * it to the student (answer with the ordinary `content_blocked` line).
 *
 * Relative, extensionless value imports (the house pattern, as in tags.ts):
 * a node:test that loads this file needs the resolve hook from tags.test.ts.
 */

import { captionHashtags } from "./caption-tags";
import { firstBlockedTag } from "./tags";

/**
 * The first tag the word filter refuses, among `storedTags` and every #tag in
 * `content`; null when all of them are fine.
 */
export function firstBlockedPostTag(
  storedTags: readonly string[],
  content: string,
): string | null {
  return firstBlockedTag([...storedTags, ...captionHashtags(content)]);
}
