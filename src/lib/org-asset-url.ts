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

/** Hostname of the configured Supabase project, or null when unset/malformed. */
function supabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when `url` is an https:// URL whose host is a Supabase host — either
 * `*.supabase.co` or exactly the host of NEXT_PUBLIC_SUPABASE_URL. Used to
 * keep stored asset URLs from turning our asset proxy into an open redirect
 * and to stop arbitrary third-party URLs landing in org media columns.
 */
export function isSupabaseHttpsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".supabase.co")) return true;
  const own = supabaseHost();
  return own !== null && host === own;
}

const MAX_ASSET_LEN = 1024;

/**
 * Validate a client-supplied org logo/banner value.
 *  - `null`      → clears the asset
 *  - `orgs/...`  → R2 object key (no `..` traversal segments)
 *  - `https://…` → must be on a Supabase host
 * Returns `undefined` when the value is invalid; the caller should 400.
 */
export function normalizeOrgAssetInput(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  if (s.length > MAX_ASSET_LEN) return undefined;
  if (s.startsWith("orgs/")) {
    if (s.includes("..") || s.includes("\\") || /[\u0000-\u001f]/.test(s)) return undefined;
    return s;
  }
  if (s.startsWith("https://") && isSupabaseHttpsUrl(s)) return s;
  return undefined;
}

/**
 * Org post media must be scoped to the org's own R2 prefix
 * (`orgs/<orgId>/...`, no traversal) or live on a Supabase host. `clips/`
 * keys belong to individual users and are deliberately not accepted.
 */
export function isAllowedMediaUrl(v: string, orgId: string): boolean {
  if (!v || v.length > MAX_ASSET_LEN) return false;
  if (v.includes("..") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return false;
  if (v.startsWith(`orgs/${orgId}/`)) return true;
  return v.startsWith("https://") && isSupabaseHttpsUrl(v);
}
