/**
 * Client-side helpers for resume / portfolio document URLs.
 *
 * Resume docs live in PRIVATE storage. The server never hands the client
 * a raw storage URL; instead `resumePortfolio[].url` / `resume_url` come
 * down as an app-relative proxy path:
 *
 *     /api/resume/<uid>/resume-<uuid>.<ext>
 *
 * A plain same-origin GET of that path (with the session cookie) 307s to
 * a short-lived signed URL — which is all `<img src>`, `<iframe src>` and
 * `<a href target=_blank>` need. pdf.js is the exception: it issues extra
 * Range requests (xref at the end of the file), and each one would re-hit
 * the proxy through the redirect and mint a fresh signed URL. So for
 * pdf.js (and any fetch-based consumer) we resolve ONCE via `?json=1`
 * and hand it the absolute signed URL.
 *
 * Client-safe: no server-only imports. The server module owns the
 * canonical prefix; this copy is duplicated on purpose so the client
 * bundle never pulls server code.
 */

export const RESUME_PROXY_PREFIX = "/api/resume/";

/**
 * True when `url` is a resume proxy path: either app-relative
 * (`/api/resume/...`) or an absolute same-origin URL whose pathname
 * starts with the prefix. External links (other hosts), `data:` and
 * `blob:` URLs are NOT proxy paths and are left alone by callers.
 */
export function isResumeProxyPath(url: string): boolean {
  if (typeof url !== "string" || !url) return false;
  if (url.startsWith(RESUME_PROXY_PREFIX)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith(RESUME_PROXY_PREFIX)) return false;
    // Only trust our own origin — a pasted external link that happens to
    // contain /api/resume/ in its path must not trigger a credentialed
    // fetch. Outside the browser we can't know our origin; accept the
    // pathname match alone.
    if (typeof window !== "undefined" && window.location) {
      return u.origin === window.location.origin;
    }
    return true;
  } catch {
    return false;
  }
}

/** Friendly copy for the statuses the proxy is documented to return.
 *  Returns "" for anything else so the caller can fall back to the
 *  server's own message (or a generic one). */
function messageForKnownStatus(status: number): string {
  switch (status) {
    case 401:
      return "Sign in to view this document";
    case 403:
    case 404:
      return "This document isn't available";
    case 429:
      return "Too many document requests — try again in a few minutes";
    default:
      return "";
  }
}

/**
 * For pdf.js / fetch consumers: turn a proxy path into a short-lived
 * signed absolute URL via `?json=1`.
 *
 * Non-proxy inputs (`data:`, external https, other relative paths) are
 * returned unchanged, resolved to absolute if relative. Throws with a
 * readable message on 401 / 404 / 429 / 5xx or a network failure.
 */
export async function resolveResumeDocUrl(url: string): Promise<string> {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) throw new Error("No document URL");

  if (!isResumeProxyPath(raw)) {
    if (/^(data|blob):/i.test(raw)) return raw;
    if (typeof window === "undefined") return raw;
    return new URL(raw, window.location.href).href;
  }

  // Never append the query after a fragment.
  const hashIdx = raw.indexOf("#");
  const base = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const target = base + (base.includes("?") ? "&" : "?") + "json=1";

  let res: Response;
  try {
    res = await fetch(target, { credentials: "include", cache: "no-store" });
  } catch {
    throw new Error("Network error while opening this document");
  }

  type ProxyJson = { ok?: boolean; url?: unknown; error?: unknown };
  let body: ProxyJson | null;
  try {
    body = (await res.json()) as ProxyJson;
  } catch {
    body = null;
  }

  if (!res.ok) {
    // Known statuses get our copy (the server's `error` there is a code
    // like "unauthorized", not something to show a person). Anything
    // else: prefer the server's message, then a generic HTTP fallback.
    const serverMsg =
      body && typeof body.error === "string" && body.error.trim()
        ? body.error.trim()
        : "";
    throw new Error(
      messageForKnownStatus(res.status) ||
        serverMsg ||
        `Couldn't open this document (HTTP ${res.status})`,
    );
  }
  if (!body || !body.ok || typeof body.url !== "string" || !body.url) {
    throw new Error("Couldn't open this document");
  }
  return body.url;
}
