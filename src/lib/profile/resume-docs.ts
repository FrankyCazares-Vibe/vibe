/** Single resume / portfolio document on the user's profile.
 *  Stored in `public.users.resume_docs` as a JSONB array of this shape. */
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

function inferTypeFromUrl(url: string): "pdf" | "image" {
  const lower = url.toLowerCase();
  // Strip query/fragment so a signed URL with ?token=… still classifies.
  const clean = lower.split(/[?#]/)[0] ?? lower;
  if (clean.endsWith(".pdf")) return "pdf";
  return "image";
}

/** Coerce an untrusted payload into a safe array. Drops malformed
 *  items silently. Used by profile-sync. */
export function sanitizeResumeDocs(input: unknown): ResumeDocRow[] {
  if (!Array.isArray(input)) return [];
  const out: ResumeDocRow[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const rawUrl = typeof o.url === "string" ? o.url.trim() : "";
    if (!rawUrl) continue;
    let url: string;
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      url = rawUrl.slice(0, MAX_URL_LEN);
    } catch {
      continue;
    }
    const name =
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().slice(0, MAX_NAME_LEN)
        : "Resume";
    const tRaw =
      typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
    const type: "pdf" | "image" =
      tRaw === "pdf" || tRaw === "image" ? tRaw : inferTypeFromUrl(url);
    out.push({ name, type, url });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
