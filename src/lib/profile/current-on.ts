/** A single "Working on" entry — a short text line plus an optional
 *  emoji-ish icon. Persisted in `public.users.current_on` as a JSON
 *  array of this shape; ordered. */
export type CurrentOnItem = {
  icon: string;
  text: string;
};

/** Maximum items per user — keeps the row bounded + the UI scan-able.
 *  10 is comfortably above what any real user types in. */
const MAX_ITEMS = 10;
const MAX_ICON_LEN = 12; // ~2 grapheme cluster emoji
const MAX_TEXT_LEN = 160;

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
    out.push({ icon, text });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
