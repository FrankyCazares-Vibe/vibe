/**
 * Where a caption's #tags sit, so a screen can highlight them and make them
 * tappable INSIDE the text (critique batch B6, Oct 19, 2026; decision 5: tags
 * live in the caption, the way Instagram and TikTok show them, with no chip
 * row under the post).
 *
 * WHY ONLY SAVED TAGS. A `#word` becomes a link only when the post stored that
 * tag (`post.tags`). Before this, the profile coloured every `#word`, so a 6th
 * tag (past POST_TAG_MAX), `#café` or a link's `#section` looked tappable but
 * would open a tag filter that doesn't show the post.
 *
 * WHERE A TAG MAY SIT is the write rule's: POST_TAG_IN_TEXT_RE over
 * blankPostLinks(text), both from ./edit. blankPostLinks keeps the length, so
 * the positions are on the original caption. Every occurrence of a saved tag
 * is returned ("#GameDay ... #gameday" gives two ranges). An old stored tag
 * the new rule wouldn't write ("#2026") still links; one the text can't show
 * any more ("caf" from an old "#café") simply has no range.
 *
 * THE STATIC TWINS. public/html/profile.html and public/html/_postViewer.js
 * each carry a copy (`vibeCaptionTagRanges`, between `// tags-twin:start` and
 * `// tags-twin:end`). src/lib/posts/static-profile-tags.test.ts runs every
 * copy beside this one: change all three together.
 *
 * Pure: no DOM, no React. Safe in client components (./edit is import-free).
 */

import { POST_TAG_IN_TEXT_RE, blankPostLinks } from "./edit";

/** `start` is the index of the `#`, `end` is exclusive, `tag` is lower-case. */
export type CaptionTagRange = { start: number; end: number; tag: string };

/** The ranges of `text` that are saved tags of the post, in caption order. */
export function captionTagRanges(text: unknown, savedTags: unknown): CaptionTagRange[] {
  if (typeof text !== "string" || !text.includes("#") || !Array.isArray(savedTags)) return [];
  const saved = new Set<string>();
  for (const t of savedTags) if (typeof t === "string" && t) saved.add(t.toLowerCase());
  if (saved.size === 0) return [];
  const out: CaptionTagRange[] = [];
  // A fresh copy: the shared global regex is never `exec`-ed (see edit.ts).
  for (const m of blankPostLinks(text).matchAll(new RegExp(POST_TAG_IN_TEXT_RE.source, "gu"))) {
    const tag = m[2].toLowerCase();
    if (!saved.has(tag)) continue;
    // Group 1 is the character before the `#` (UTF-16 length, like the index).
    const start = (m.index ?? 0) + m[1].length;
    out.push({ start, end: start + 1 + m[2].length, tag });
  }
  return out;
}
