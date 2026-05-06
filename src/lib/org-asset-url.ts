/**
 * Build a stable proxy URL for an org banner / logo so the rest of the app
 * doesn't have to sign R2 GET URLs at every render. The asset route
 * `/api/orgs/[slug]/asset/[kind]` 307-redirects to a freshly signed URL.
 *
 * Pass through full http(s) URLs unchanged for forward compatibility with
 * any direct-set values that pre-date the upload flow.
 *
 * Returns null when nothing is stored (caller renders the gradient
 * fallback). Use the returned URL as a CSS `url(...)` or `<img src>`.
 */
export function orgAssetProxyUrl(
  handle: string,
  stored: string | null | undefined,
  kind: "banner" | "logo",
): string | null {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return stored;
  }
  if (stored.startsWith("orgs/")) {
    return `/api/orgs/${encodeURIComponent(handle)}/asset/${kind}`;
  }
  return null;
}
