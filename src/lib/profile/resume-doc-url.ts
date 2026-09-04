/**
 * Resume / portfolio document references — pure helpers, safe to import
 * from client components (no `server-only`, no Supabase client).
 *
 * Storage model (session 53 / A1):
 *   - Files live in the PRIVATE bucket `resumes` under
 *     `<uid>/resume-<uuid>.<ext>` — the same key shape the legacy public
 *     `profiles` bucket used, so old public URLs map 1:1 onto new keys.
 *   - The DB (`users.resume_url`, `users.resume_docs[].url`) stores the
 *     app-relative proxy path `/api/resume/<key>` for our own files.
 *     GET /api/resume/<key> checks auth + ownership + blocks and 307s to a
 *     short-TTL signed URL.
 *   - External http(s) links on OTHER hosts (a pasted Google-Drive resume)
 *     stay allowed as plain absolute URLs. Anything on our Supabase host
 *     that isn't a legacy public-profiles resume URL is rejected — the
 *     `authenticated` role can write these columns directly through
 *     PostgREST, so a stored value is never trusted as "a key I own"
 *     without checking the key's owner prefix against the row id.
 */

export const RESUME_BUCKET = "resumes";
export const RESUME_PROXY_PREFIX = "/api/resume/";

/** Legacy public path prefix in the `profiles` bucket. */
const LEGACY_PUBLIC_PREFIX = "/storage/v1/object/public/profiles/";

const MAX_EXTERNAL_URL_LEN = 2048;

/** `<uid>/resume-<uuid>.<ext>` — capture group 1 is the owner id. */
export const RESUME_KEY_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/resume-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpe?g|png|webp)$/i;

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

function stripQueryAndFragment(s: string): string {
  return s.split(/[?#]/)[0] ?? s;
}

/** Owner id (first path segment) when `key` is a well-formed resume key. */
export function resumeKeyOwnerId(key: string): string | null {
  const m = RESUME_KEY_RE.exec(key);
  return m ? m[1].toLowerCase() : null;
}

/** App-relative proxy path for a resume key. */
export function resumeDocProxyPath(key: string): string {
  return `${RESUME_PROXY_PREFIX}${key}`;
}

/**
 * Recognise a reference to one of OUR resume objects and extract its key.
 * Accepts:
 *   (a) proxy path            `/api/resume/<key>`
 *   (b) absolute URL of ANY origin whose pathname is `/api/resume/<key>`
 *       (clients may have resolved the relative path to absolute)
 *   (c) legacy public URL     `https://<our supabase host>/storage/v1/object/public/profiles/<key>`
 * Query / fragment are stripped. Returns null for anything else.
 */
export function parseResumeDocRef(
  value: string,
): { key: string; ownerId: string } | null {
  const v = value.trim();
  if (!v) return null;

  let key: string | null = null;

  if (v.startsWith(RESUME_PROXY_PREFIX)) {
    key = stripQueryAndFragment(v.slice(RESUME_PROXY_PREFIX.length));
  } else if (/^https?:\/\//i.test(v)) {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    if (u.pathname.startsWith(RESUME_PROXY_PREFIX)) {
      key = u.pathname.slice(RESUME_PROXY_PREFIX.length);
    } else if (
      u.protocol === "https:" &&
      u.pathname.startsWith(LEGACY_PUBLIC_PREFIX)
    ) {
      const own = supabaseHost();
      if (own === null || u.hostname.toLowerCase() !== own) return null;
      key = u.pathname.slice(LEGACY_PUBLIC_PREFIX.length);
    }
  }

  if (!key) return null;
  const ownerId = resumeKeyOwnerId(key);
  if (!ownerId) return null;
  return { key, ownerId };
}

/**
 * Normalise an untrusted `resume_url` / `resume_docs[].url` value for
 * storage on the row owned by `ownerId`.
 *   - our own resume ref (proxy / absolute-proxy / legacy public) whose key
 *     owner === ownerId              → `/api/resume/<key>`
 *   - our own resume ref, other owner → null
 *   - any other http(s) URL on our Supabase host → null
 *   - http(s) URL on another host    → `new URL(v).href` capped at 2048
 *     (external link — unchanged behaviour)
 *   - data:, javascript:, garbage, non-string → null
 */
export function normalizeResumeRef(value: unknown, ownerId: string): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;

  const ref = parseResumeDocRef(v);
  if (ref) {
    return ref.ownerId === ownerId.toLowerCase() ? resumeDocProxyPath(ref.key) : null;
  }

  if (!/^https?:\/\//i.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const own = supabaseHost();
  if (own !== null && u.hostname.toLowerCase() === own) return null;
  return u.href.slice(0, MAX_EXTERNAL_URL_LEN);
}

/** Viewer mode from the ref's extension (query / fragment ignored). */
export function resumeDocTypeFromRef(ref: string): "pdf" | "image" {
  const clean = stripQueryAndFragment(ref.trim()).toLowerCase();
  return clean.endsWith(".pdf") ? "pdf" : "image";
}

/**
 * Every resume key referenced by a row's `resume_url` + `resume_docs`
 * columns. No owner filtering here — the caller decides what an
 * off-owner key means (the proxy route treats it as "not a member").
 */
export function resumeKeysReferenced(resumeUrl: unknown, resumeDocs: unknown): Set<string> {
  const keys = new Set<string>();
  if (typeof resumeUrl === "string") {
    const ref = parseResumeDocRef(resumeUrl);
    if (ref) keys.add(ref.key);
  }
  if (Array.isArray(resumeDocs)) {
    for (const item of resumeDocs) {
      if (!item || typeof item !== "object") continue;
      const url = (item as { url?: unknown }).url;
      if (typeof url !== "string") continue;
      const ref = parseResumeDocRef(url);
      if (ref) keys.add(ref.key);
    }
  }
  return keys;
}
