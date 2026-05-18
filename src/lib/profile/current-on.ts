/** A single "Working on" entry. `text` is required. Each entry may
 *  carry either a short emoji `icon` OR an uploaded `logoUrl` — the
 *  UI prefers logoUrl when set, falls back to icon, and defaults to
 *  a generic glyph if neither is present. */
export type CurrentOnItem = {
  icon: string;
  text: string;
  logoUrl?: string | null;
};

/** Maximum items per user — keeps the row bounded + the UI scan-able.
 *  10 is comfortably above what any real user types in. */
const MAX_ITEMS = 10;
const MAX_ICON_LEN = 12; // ~2 grapheme cluster emoji
const MAX_TEXT_LEN = 160;
const MAX_URL_LEN = 2048;

/** Validate a URL — only http/https allowed. Returns the trimmed URL
 *  on success, null otherwise. Mirrors the work-experience logo flow. */
function sanitizeLogoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // data: URIs need to be uploaded first — drop them so we don't bloat
  // the row with base64.
  if (s.startsWith("data:")) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return s.slice(0, MAX_URL_LEN);
  } catch {
    return null;
  }
}

/**
 * Coerce any value into a safe array of CurrentOnItem. Used both when
 * reading a row out of Supabase (defensive — old rows might not have
 * the column populated) and when accepting input on the sync endpoint
 * (untrusted client payload).
 *
 * Returns an empty array if the input isn't an array. Filters out
 * items missing `text` (the only required field).
 */
export function sanitizeCurrentOn(v: unknown): CurrentOnItem[] {
  if (!Array.isArray(v)) return [];
  const out: CurrentOnItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const text =
      typeof o.text === "string" ? o.text.trim().slice(0, MAX_TEXT_LEN) : "";
    if (!text) continue;
    const icon =
      typeof o.icon === "string" ? o.icon.trim().slice(0, MAX_ICON_LEN) : "";
    // Accept either snake_case (server) or camelCase (profile.html) on
    // input — the UI emits the latter.
    const logoUrl =
      sanitizeLogoUrl(o.logoUrl) ?? sanitizeLogoUrl(o.logo_url) ?? null;
    out.push({ icon, text, logoUrl });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
