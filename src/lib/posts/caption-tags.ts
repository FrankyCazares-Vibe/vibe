/**
 * Every #tag written in a caption, for the TAG word filter (S67 security wave
 * B, batch B4; critique-B4 §7).
 *
 * WHY NOT `extractPostTags`. That one (src/lib/posts/edit.ts) builds the tags
 * a post STORES: ASCII only, the first 10, at most 32 characters each. The
 * word filter needs every tag a reader SEES in the caption, and the caption's
 * own filter (`checkText(content)`) misses a listed term glued to anything by
 * `_` (in a JS regex `_` is a word character, so `\b` never fires). So this
 * returns every `#` run of letters (any language), digits and `_`, with no
 * count or length cap: a `#café_<term>` or an eleventh tag is still checked.
 * Feed the result to `firstBlockedTag` (src/lib/posts/tags.ts), which reads
 * `_` as a space.
 *
 * Lower-cased, without the `#`, de-duplicated, in caption order. Pure, no
 * imports.
 */

const CAPTION_TAG_RE = /#+([\p{L}\p{N}_]+)/gu;

/** Every distinct #tag in `content` (lower-case, no `#`); `[]` for anything but a string. */
export function captionHashtags(content: unknown): string[] {
  if (typeof content !== "string" || !content.includes("#")) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(CAPTION_TAG_RE)) {
    const tag = match[1].toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}
