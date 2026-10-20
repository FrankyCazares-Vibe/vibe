/**
 * Which picture a Saved (or Reposts) tile shows, one rule for the phone and
 * the desktop profile (critique batch B6, Oct 19, 2026).
 *
 * WHY. The desktop Saved grid never showed photos (D3), and both screens
 * picked the picture with `type === "post"`, which every saved post is, so a
 * video post put its video FILE in as a background picture and drew a black
 * tile. The bookmarks and reposts routes send `media_kind` (withPostMediaUrls
 * in src/lib/post-media-url.ts), so:
 * - a poster (`media_thumbnail_url`) always wins;
 * - otherwise a PHOTO's `media_url`;
 * - a video with no poster, or a post with no media, has no picture and is
 *   drawn as a plain text tile.
 *
 * THE STATIC TWIN. public/html/profile.html `_savedTileModel` (between
 * `// saved-tiles:start` and `// saved-tiles:end`) copies this.
 * src/lib/profile/static-profile-saved.test.ts runs both on the same posts.
 *
 * Pure, no imports: safe in client components and in node --test.
 */

export type SavedTileMedia = {
  media_url?: string | null;
  media_thumbnail_url?: string | null;
  media_kind?: "image" | "video" | null;
};

/** The picture to fill the tile with, or null for a text tile. */
export function savedTileThumb(p: SavedTileMedia): string | null {
  if (typeof p.media_thumbnail_url === "string" && p.media_thumbnail_url) return p.media_thumbnail_url;
  if (p.media_kind === "image" && typeof p.media_url === "string" && p.media_url) return p.media_url;
  return null;
}

/**
 * A picture tile's spoken name, "Saved photo. <caption>" or "Saved video.
 * <caption>" (Oct 19, 2026). The desktop tile says the same words (its
 * `.saved-tile-sr` span, then the caption), so both twins read alike; a tile
 * that shows its text has no separate name.
 */
export function savedTileLabel(p: { content?: string | null }, isVideo: boolean): string {
  const words = (p.content ?? "").trim().slice(0, 120);
  return (isVideo ? "Saved video." : "Saved photo.") + (words ? ` ${words}` : "");
}
