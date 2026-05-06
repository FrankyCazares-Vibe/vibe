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
