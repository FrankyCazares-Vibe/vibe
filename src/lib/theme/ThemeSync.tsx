"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  applyTheme,
  currentTheme,
  readThemePref,
  syncThemeColorMeta,
  THEME_STORAGE_KEY,
  watchSystemTheme,
} from "@/lib/theme/theme";

/**
 * The React pages' half of the theme after first paint (S67 wave 3, C4).
 * The boot script in layout.tsx sets `data-theme` before paint but leaves
 * `meta[name=theme-color]` alone (React rendered it from viewport.themeColor,
 * cream), so without this a hard load in Night kept cream browser chrome and
 * a cream Android status bar over a near-black page. Renders nothing.
 *
 * - On mount: `applyTheme(readThemePref())` (attribute, meta, event).
 * - Auto follows an OS flip live, like the legacy pages' `_persistence.js`
 *   does, so /messages never shows a Light shell around a Night iframe.
 * - A `storage` event on `vibe_theme` (another tab, the legacy iframes)
 *   repaints this document too.
 * - Next renders the viewport meta per route, so a navigation can put a
 *   fresh cream one in <head>: the head watcher and the pathname effect
 *   repaint it from the attribute. They only touch the meta and never
 *   re-read the preference, so they can't undo a Settings tap.
 * - The landing ("/") is always Night: syncThemeColorMeta paints its meta
 *   dark in either theme (NIGHT_ONLY_PATHS in theme.ts).
 */
export function ThemeSync(): null {
  const pathname = usePathname();

  useEffect(() => {
    applyTheme(readThemePref());

    // Read the key at flip time, not at mount: Settings may have changed it.
    const stopSystem = watchSystemTheme(() => {
      if (readThemePref() === "system") applyTheme("system");
    });

    // `key` is null when another document cleared localStorage outright.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(readThemePref());
    };
    window.addEventListener("storage", onStorage);

    // syncThemeColorMeta writes only a meta that differs, so its own write
    // lands here once and stops.
    const headWatch = new MutationObserver(() => syncThemeColorMeta(currentTheme()));
    headWatch.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content"],
    });

    return () => {
      stopSystem();
      window.removeEventListener("storage", onStorage);
      headWatch.disconnect();
    };
  }, []);

  // And on every soft navigation. The head watcher already sees a swapped
  // meta; this is the cheap, obvious second net (one querySelectorAll).
  useEffect(() => {
    syncThemeColorMeta(currentTheme());
  }, [pathname]);

  return null;
}
