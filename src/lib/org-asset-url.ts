import { hasSafeMediaUrlShape, isOrgAssetKey } from "./posts/media-ownership";

/**
 * Build a stable proxy URL for an org banner / logo so the rest of the app
 * doesn't have to sign R2 GET URLs at every render. The asset route
 * `/api/orgs/[slug]/asset/[kind]` 307-redirects to a freshly signed URL.
 *
 * `?v=` is the stored key's file name (a fresh uuid per upload), so a new
 * logo or banner is a new URL. The route ignores it; it is there because a
 * visible club's redirect is kept in the browser for five minutes (rate
 * limits and upload caps, Oct 15, B1.3), and without it the officer who just
 * replaced the picture would keep seeing the old one, reload or not.
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
    const file = stored.slice(stored.lastIndexOf("/") + 1);
    const version = file ? `?v=${encodeURIComponent(file)}` : "";
    return `/api/orgs/${encodeURIComponent(handle)}/asset/${kind}${version}`;
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
  const own = supabaseHost();
  return own !== null && host === own;
}

const MAX_ASSET_LEN = 1024;

/** The org id folder of an `orgs/<id>/…` key, or null. */
const ORG_KEY_FOLDER_RE = /^orgs\/([0-9a-f-]{36})\//;

/**
 * Validate a client-supplied org logo/banner value.
 *  - `null`      → clears the asset
 *  - `orgs/...`  → R2 object key inside THIS club's folder, `orgs/<orgId>/`
 *                  (S67 security wave: before, any club's folder passed, so an
 *                  officer could point their club's logo at another club's
 *                  file, including a hidden club's)
 *  - `https://…` → must be on our Supabase host, with a plain path
 * Returns `undefined` when the value is invalid; the caller should 400.
 *
 * `orgId`:
 *  - the club's id → only keys under `orgs/<orgId>/` pass;
 *  - `null`        → the club doesn't exist yet (creation): no key can be
 *                    its own, so every `orgs/` key is refused;
 *  - omitted       → LEGACY, for callers not yet passing the id: any
 *                    well-formed `orgs/<uuid>/…` key passes here, and the
 *                    database trigger `orgs_check_asset_refs` (migration
 *                    20260927120000) refuses a key outside the row's own
 *                    folder. Pass the id so that is a 400, not a 500.
 */
export function normalizeOrgAssetInput(
  v: unknown,
  orgId?: string | null,
): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  if (s.length > MAX_ASSET_LEN) return undefined;
  if (s.startsWith("orgs/")) {
    if (orgId === null) return undefined;
    const owner = orgId === undefined ? ORG_KEY_FOLDER_RE.exec(s)?.[1] : orgId;
    return owner && isOrgAssetKey(s, owner) ? s : undefined;
  }
  if (hasSafeMediaUrlShape(s) && isSupabaseHttpsUrl(s)) return s;
  return undefined;
}

/**
 * Org post media must be scoped to the org's own R2 prefix
 * (`orgs/<orgId>/...`, no traversal) or live on a Supabase host with a plain
 * path. `clips/` keys belong to individual users and are deliberately not
 * accepted. Same rule as the database trigger `posts_check_media_refs`.
 */
export function isAllowedMediaUrl(v: string, orgId: string): boolean {
  if (!v || v.length > MAX_ASSET_LEN) return false;
  if (v.startsWith("orgs/")) return isOrgAssetKey(v, orgId);
  return hasSafeMediaUrlShape(v) && isSupabaseHttpsUrl(v);
}
