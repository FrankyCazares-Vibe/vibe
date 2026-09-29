/**
 * The theme mechanism (S67 wave 3, contracts C4).
 *
 * One attribute carries the theme: `<html data-theme="light" | "dark">`, the
 * RESOLVED theme, never "system". The student's preference is the enum
 * `light | dark | system` (the product says Light / Night / Auto), kept in
 * `localStorage.vibe_theme` on the device and mirrored to
 * `otto_settings.theme` on the account by the Settings page.
 *
 * Zero imports on purpose: `THEME_BOOT_SCRIPT` is pasted verbatim into the
 * four static heads (public/html/{profile,messages,onboarding}.html and
 * public/offline.html), and `theme.test.ts` loads this file under node:test
 * to check that paste hasn't drifted.
 */

export const THEME_PREFS = ["light", "dark", "system"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export type ResolvedTheme = "light" | "dark";

/** Auto since S68 wave 5 (2026-09-29): the legacy desktop pages are fully
 *  dark now, so a student whose phone or laptop is dark gets Night from the
 *  first visit. Changing it again: this line, then
 *  `node --test src/lib/theme/theme.test.ts`, paste the new script where the
 *  drift test fails, `_VIBE_THEME_DEFAULT` in _persistence.js, bump SW_VERSION. */
export const DEFAULT_THEME_PREF: ThemePref = "system";

/** Device key. Survives sign-out on purpose (not in ACCOUNT_KEYS): the phone
 *  stays Night through a re-login; the account value catches up on the next
 *  Settings visit. */
export const THEME_STORAGE_KEY = "vibe_theme";

/** What `meta[name=theme-color]` (browser chrome, status bar) paints per
 *  theme. Light is the cream `--cream`, dark the near-black Night paper. The
 *  static pages keep the cream text in their markup so check-pwa.mjs passes;
 *  `applyTheme` rewrites the live meta after mount. */
export const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  light: "#FAF7F2",
  dark: "#0C0B0B",
};

/** Fired on `window` by `applyTheme`. NativeBridge (status bar) and any
 *  surface that can't read the attribute listen for it. */
export const THEME_EVENT = "vibe:theme";
export type ThemeEventDetail = { pref: ThemePref; theme: ResolvedTheme };

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePref(value: unknown): value is ThemePref {
  return typeof value === "string" && (THEME_PREFS as readonly string[]).includes(value);
}

/** Pure. "system" follows the OS; anything that isn't "dark" is light, so a
 *  stale or unknown value can never paint Night by accident. */
export function resolveTheme(pref: ThemePref, prefersDark: boolean): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "system") return prefersDark ? "dark" : "light";
  return "light";
}

type PrefStorage = Pick<Storage, "getItem">;

function deviceStorage(): PrefStorage | null {
  try {
    // Touching localStorage can throw (blocked storage, some private modes).
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The saved preference, validated; `DEFAULT_THEME_PREF` when missing,
 *  unreadable or not one of the three. `storage` is injectable for tests. */
export function readThemePref(storage: PrefStorage | null = deviceStorage()): ThemePref {
  try {
    const raw = storage ? storage.getItem(THEME_STORAGE_KEY) : null;
    return isThemePref(raw) ? raw : DEFAULT_THEME_PREF;
  } catch {
    return DEFAULT_THEME_PREF;
  }
}

/** Does the OS ask for dark right now? False where matchMedia is missing. */
export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  );
}

/**
 * The pre-paint script: the FIRST child of every `<head>` (layout.tsx renders
 * it; the static pages paste it). Plain ES5 and self-contained. It reads the
 * key, validates, resolves "system" through matchMedia and sets
 * `data-theme` on <html>. NOTHING else: the theme-color meta belongs to
 * React on the app pages (viewport.themeColor), so the script never touches
 * it; `applyTheme` does, from a client effect after mount. The inner
 * try/catch keeps a blocked localStorage from also losing the OS answer.
 */
export const THEME_BOOT_SCRIPT =
  "(function(){try{" +
  `var k=${JSON.stringify(THEME_STORAGE_KEY)},p=null;` +
  "try{p=localStorage.getItem(k)}catch(e){}" +
  `if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME_PREF)};` +
  `if(p==="system")p=window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";` +
  "document.documentElement.dataset.theme=p" +
  "}catch(e){}})();";

/**
 * Client only, from an effect after mount (never pre-hydration: React owns the
 * theme-color meta it rendered). Sets the attribute, repaints the meta and
 * tells listeners. Returns the resolved theme. ThemeSync (mounted by
 * layout.tsx) calls it on every load, on an OS flip in Auto and when another
 * tab or the legacy iframes change `vibe_theme`; the Settings card on a tap. Does NOT save the preference;
 * the Settings card writes `vibe_theme` and PATCHes the account itself.
 */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const theme = resolveTheme(pref, systemPrefersDark());
  if (typeof document === "undefined" || typeof window === "undefined") return theme;
  document.documentElement.dataset.theme = theme;
  syncThemeColorMeta(theme);
  window.dispatchEvent(
    new CustomEvent<ThemeEventDetail>(THEME_EVENT, { detail: { pref, theme } }),
  );
  return theme;
}

/** Client only. Paints every `meta[name=theme-color]` for `theme`, writing
 *  only the ones that differ, so a MutationObserver that calls it never
 *  feeds itself. `applyTheme` uses it; ThemeSync calls it alone when Next
 *  puts a fresh (cream) viewport meta in the head on a navigation. */
export function syncThemeColorMeta(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const color = THEME_META_COLORS[theme];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (meta.content !== color) meta.setAttribute("content", color);
  });
}

/** The theme on <html> right now: what the boot script, or the last
 *  `applyTheme`, set. Light without a document or with no attribute. */
export function currentTheme(): ResolvedTheme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
}

/** Calls `cb(prefersDark)` whenever the OS flips. Returns the unsubscribe;
 *  a no-op pair where matchMedia is missing (SSR, old web views). Callers
 *  on Auto re-run `applyTheme("system")` from the callback. */
export function watchSystemTheme(cb: (prefersDark: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(DARK_QUERY);
  const onChange = (event: MediaQueryListEvent) => cb(event.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
