/**
 * The phone profile's post card: its caption parts and the spoken name of
 * its open button (critique batch B6 review, Oct 19, 2026).
 *
 * WHY ONE CUTTER. The card used to carry its own mention regex (`@` plus 1
 * to 32 characters) beside the tag ranges, while the feed card and the open
 * post use `captionSegments` (`@` plus 3 to 32). So "@jo" was a coloured
 * mention on the profile card and plain text on the feed card for the same
 * post. The card now cuts its caption with `captionSegments`, the feed's own
 * cutter, whose tags come from `captionTagRanges` (the source the static
 * twins in profile.html and _postViewer.js copy). One rule, every screen.
 *
 * WHY THE OPEN BUTTON SAYS THE CAPTION. Since B6 the card is a box with a
 * full-size "open" button under its words (the tag links can't sit inside a
 * button). A screen reader moving through buttons heard "Open post, 2d ago"
 * three times in a row with nothing to tell the posts apart. The name now
 * starts with the caption, the way the Saved tiles say "Saved photo. <caption>".
 *
 * Pure: no DOM, no React. Relative imports with no extension, like
 * caption-segments.ts; the node tests add ".ts" with a resolve hook.
 */

import { captionSegments } from "../feed/caption-segments";

export type ProfileCaptionPart = {
  /** Unique within one caption: the part's kind and its place in the caption. */
  key: string;
  kind: "text" | "mention" | "tag";
  text: string;
  /** A saved tag's campus-feed filter; null for text and mentions. */
  href: string | null;
};

/** The campus feed filtered by one tag (the feed's `?tag=` value, lower-case). */
export function tagFeedHref(tag: string): string {
  return `/campus?tab=feed&tag=${encodeURIComponent(tag)}`;
}

/** The caption as the card draws it, in order. Joining `text` gives the caption back. */
export function profileCaptionParts(
  text: string | null | undefined,
  savedTags: readonly string[] | null | undefined,
): ProfileCaptionPart[] {
  let at = 0;
  return captionSegments(text, savedTags).map((seg) => {
    const part: ProfileCaptionPart = {
      key: `${seg.kind}@${at}`,
      kind: seg.kind,
      text: seg.text,
      href: seg.kind === "tag" ? tagFeedHref(seg.tag) : null,
    };
    at += seg.text.length;
    return part;
  });
}

/** At most this many characters of the caption go into a spoken name. */
export const SPOKEN_CAPTION_MAX = 80;

/** The caption on one line, cut at a word near the limit, with "…" when cut. */
export function spokenCaption(text: string | null | undefined, max = SPOKEN_CAPTION_MAX): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The open button's name: "Open post: <caption>, 2d ago". With no caption it
 * says what the post is: "Open photo post, 2d ago" / "Open video post, …".
 * `when` is the card's own time words ("2d ago"), or empty when it has none.
 */
export function postOpenLabel(
  post: { content?: string | null; media_kind?: string | null },
  when: string,
): string {
  const words = spokenCaption(post.content);
  const tail = when ? `, ${when}` : "";
  if (words) return `Open post: ${words}${tail}`;
  if (post.media_kind === "video") return `Open video post${tail}`;
  // A media file with no kind could be either, so it is just a post.
  if (post.media_kind === "image") return `Open photo post${tail}`;
  return `Open post${tail}`;
}
