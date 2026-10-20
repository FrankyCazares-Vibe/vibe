/**
 * A caption cut into plain text, @mentions and #tags, for the feed card, the
 * desktop row and the open post (Oct 19, 2026, critique decisions 3-5).
 *
 * WHY ONE CUTTER. Each screen had its own regex, and they disagreed with what
 * a post actually saves: "#café" lit up "#caf", "x.com/page#section" lit up
 * "#section", and an 11th tag was highlighted though it was never saved, so
 * tapping it opened a filter that didn't show the post. Now:
 * - A #tag is highlighted (and tappable) only where the tag rule finds one
 *   (`POST_TAG_IN_TEXT_RE` over `blankPostLinks`, the same reading
 *   `extractPostTags` makes when the post is saved), AND only when that tag
 *   is in the post's saved `tags`. What you can tap is always what filters.
 * - The tags come from `captionTagRanges` (../posts/caption-tag-ranges, B6),
 *   the one TypeScript source the profile and the static twins in
 *   profile.html / _postViewer.js also copy (Oct 19, 2026, review r3). This
 *   file only adds the mention pass, so the feed, the open post and the
 *   profile can never read a caption's tags differently.
 * - Tags live inside the caption only: the chip rows under it are gone
 *   (decision 5, the way Instagram and TikTok do it).
 * - An @mention keeps the rule the screens already used: `@` plus 3 to 32 of
 *   `A-Za-z0-9_`, not glued to a word, a `@` or a `#`. Unchanged on purpose.
 *
 * Imports only caption-tag-ranges.ts and, through it, edit.ts, neither of
 * which pulls anything else in, so it stays light in the browser bundle
 * (tags.ts would drag the word list in; batch-B3 note 3).
 */

import { captionTagRanges } from "../posts/caption-tag-ranges";

export type CaptionSegment =
  | { kind: "text"; text: string }
  /** `handle` is lower-case, without the `@`. */
  | { kind: "mention"; text: string; handle: string }
  /** `tag` is lower-case, without the `#`: the value `?tag=` filters on. */
  | { kind: "tag"; text: string; tag: string };

/** The screens' existing mention rule (renderPostContent, renderInlineContent). */
const MENTION_SOURCE = "(^|[^A-Za-z0-9_@#])(@[A-Za-z0-9_]{3,32})";

type Hit = { start: number; end: number; seg: CaptionSegment };

/**
 * `text` in order, as segments. `savedTags` is the post's stored `tags` (any
 * case); a #tag outside it stays plain text. Joining every segment's `text`
 * gives back `text` exactly.
 */
export function captionSegments(
  text: string | null | undefined,
  savedTags: readonly string[] | null | undefined,
): CaptionSegment[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const hits: Hit[] = [];

  if (text.includes("@")) {
    for (const m of text.matchAll(new RegExp(MENTION_SOURCE, "g"))) {
      const token = m[2];
      const start = (m.index ?? 0) + m[1].length;
      hits.push({
        start,
        end: start + token.length,
        seg: { kind: "mention", text: token, handle: token.slice(1).toLowerCase() },
      });
    }
  }

  for (const { start, end, tag } of captionTagRanges(text, savedTags)) {
    hits.push({ start, end, seg: { kind: "tag", text: text.slice(start, end), tag } });
  }

  hits.sort((a, b) => a.start - b.start);
  const out: CaptionSegment[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start < at) continue; // overlaps an earlier hit: keep the first
    if (h.start > at) out.push({ kind: "text", text: text.slice(at, h.start) });
    out.push(h.seg);
    at = h.end;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}
