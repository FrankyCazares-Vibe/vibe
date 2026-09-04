import {
  normalizeResumeRef,
  parseResumeDocRef,
  resumeDocProxyPath,
  resumeDocTypeFromRef,
} from "@/lib/profile/resume-doc-url";

/** Single resume / portfolio document on the user's profile.
 *  Stored in `public.users.resume_docs` as a JSONB array of this shape.
 *  `url` is either our proxy path `/api/resume/<key>` (private bucket,
 *  see resume-doc-url.ts) or an external http(s) link. */
export type ResumeDocRow = {
  name: string;
  /** "pdf" or "image" — drives which viewer mode to use. */
  type: "pdf" | "image";
  url: string;
};

/** Cap items so a runaway upload doesn't bloat the user row. Three is
 *  comfortably above what any real user keeps (resume + portfolio +
 *  transcript). Caller enforces — bumping it here doesn't need a
 *  migration. */
const MAX_ITEMS = 3;
const MAX_NAME_LEN = 80;
const MAX_URL_LEN = 2048;

/** Fallback when no owner id is available: accept our proxy / legacy refs
 *  (converted to proxy form — the proxy route re-checks ownership) and any
 *  other http(s) URL, exactly like the pre-A1 sanitizer. */
function normalizeDocUrlLoose(rawUrl: string): string | null {
  const ref = parseResumeDocRef(rawUrl);
  if (ref) return resumeDocProxyPath(ref.key);
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // Store the normalized form so quotes/angle brackets in a crafted URL
    // are percent-encoded before they can reach an HTML attribute.
    return u.href.slice(0, MAX_URL_LEN);
  } catch {
    return null;
  }
}

/** Coerce an untrusted payload into a safe array. Drops malformed
 *  items silently. Used by profile-sync and normalize-profile-view.
 *  Pass `ownerId` (the row's user id) whenever it's known: own-bucket
 *  refs are then only kept when the key's owner prefix matches. */
export function sanitizeResumeDocs(input: unknown, ownerId?: string): ResumeDocRow[] {
  if (!Array.isArray(input)) return [];
  const out: ResumeDocRow[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const rawUrl = typeof o.url === "string" ? o.url.trim() : "";
    if (!rawUrl) continue;
    const url = ownerId
      ? normalizeResumeRef(rawUrl, ownerId)
      : normalizeDocUrlLoose(rawUrl);
    if (!url) continue;
    const name =
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().replace(/[<>"'&]/g, "").slice(0, MAX_NAME_LEN)
        : "Resume";
    const tRaw =
      typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
    const type: "pdf" | "image" =
      tRaw === "pdf" || tRaw === "image" ? tRaw : resumeDocTypeFromRef(url);
    out.push({ name, type, url });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
