/**
 * Build a stable proxy URL for a post's media. Mirrors `orgAssetProxyUrl`:
 * pass through full http(s) URLs, otherwise route through
 * `/api/posts/[id]/media` (which signs and 307-redirects). Keeps
 * `<img src>` / `<video src>` callers naive of where the file actually
 * lives.
 *
 * Returns null when nothing is stored.
 */
export function postMediaProxyUrl(
  postId: string,
  stored: string | null | undefined,
  variant: "media" | "thumbnail" = "media",
): string | null {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return stored;
  }
  // Anything else (R2 object key) → proxy. The proxy itself decides which
  // signing helper to use based on the prefix.
  const qs = variant === "thumbnail" ? "?variant=thumbnail" : "";
  return `/api/posts/${encodeURIComponent(postId)}/media${qs}`;
}

/** `media_kind` on the wire: which player a renderer should use. */
export type PostMediaKind = "video" | "image" | null;

/**
 * Image or video, judged from the STORED value — once it becomes a proxy
 * URL the key prefix is gone. Video posts store an R2 key under `clips/`
 * (legacy naming; it backs regular video posts, not clips). Same rule
 * /api/feed has always used for `media_kind`.
 */
export function postMediaKind(stored: string | null | undefined): PostMediaKind {
  if (!stored) return null;
  return stored.startsWith("clips/") ? "video" : "image";
}

/**
 * The one serializer for post media leaving the server. Every route or
 * page that hands a `posts` row (or an embedded post) to a client passes
 * it through here, so `media_url` / `media_thumbnail_url` are always
 * loadable: a full https URL, or the `/api/posts/[id]/media` proxy path.
 * A raw R2 key (`orgs/…`, `clips/…`) used as an `<img src>` resolves
 * against the page and 404s — the grey-box bug.
 *
 * Adds `media_kind` whenever `media_url` was selected, so renderers pick
 * `<img>` vs `<video>` from it instead of sniffing the URL.
 *
 * Tolerant of partial selects: a column the row doesn't carry stays absent.
 */
export function withPostMediaUrls<T extends { id: string }>(
  row: T,
): T & { media_kind?: PostMediaKind } {
  const out: Record<string, unknown> = { ...row };
  if ("media_url" in out) {
    const stored = typeof out.media_url === "string" ? out.media_url : null;
    out.media_url = postMediaProxyUrl(row.id, stored, "media");
    out.media_kind = postMediaKind(stored);
  }
  if ("media_thumbnail_url" in out) {
    const stored =
      typeof out.media_thumbnail_url === "string" ? out.media_thumbnail_url : null;
    out.media_thumbnail_url = postMediaProxyUrl(row.id, stored, "thumbnail");
  }
  return out as T & { media_kind?: PostMediaKind };
}
