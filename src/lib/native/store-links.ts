/**
 * Where "get the app" goes: the App Store and Google Play listings, and which
 * one a given phone should be sent to (plan §8.2, wave 3′).
 *
 * Lifted from `src/app/get/route.ts` (storeListingUrl and the two prefixes),
 * so the Settings Notifications card can offer the App Store to an iPhone
 * browser tab (§8 W13). Wave 3′b moves `/get` and the landing page
 * (`src/components/landing/home-landing.tsx`) onto this file too; until then
 * they keep their own copies of the same rule.
 *
 * A store URL is used only when it starts with that store's own origin, so a
 * mistyped or hostile env value can never turn a "get the app" link into a
 * link somewhere else. NEXT_PUBLIC_* values are inlined at build time, and
 * only when read as the literal `process.env.NEXT_PUBLIC_…` (a computed key
 * isn't), so changing one on Vercel needs a redeploy (.env.example).
 *
 * Pure: no React, no `server-only`, no value imports, so `node --test` can
 * load it (store-links.test.ts) and any client or server file can use it.
 */

import type { Platform } from "@/lib/pwa/display-mode";

export const APP_STORE_PREFIX = "https://apps.apple.com/";
export const PLAY_STORE_PREFIX = "https://play.google.com/";

/** The listing URL if it's a real one for that store, else null. */
export function storeListingUrl(raw: string | undefined, prefix: string): string | null {
  const value = (raw ?? "").trim();
  if (!value.startsWith(prefix) || value.length === prefix.length) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

/** The App Store listing, or null until NEXT_PUBLIC_APP_STORE_URL is set. */
export const APP_STORE_URL: string | null = storeListingUrl(
  process.env.NEXT_PUBLIC_APP_STORE_URL,
  APP_STORE_PREFIX,
);

/** The Google Play listing, or null until NEXT_PUBLIC_PLAY_STORE_URL is set. */
export const PLAY_STORE_URL: string | null = storeListingUrl(
  process.env.NEXT_PUBLIC_PLAY_STORE_URL,
  PLAY_STORE_PREFIX,
);

/**
 * The store listing this device should be offered, or null for "don't offer
 * one": an iPhone or iPad browser (in-app browsers included) → the App
 * Store; an Android browser → Google Play; the store apps themselves, a
 * computer, an unknown device, or a store whose URL isn't set yet → null.
 *
 * The platform checks are spelled out rather than borrowed from
 * display-mode.ts (isIosPlatform), so this file keeps no value imports.
 */
export function storeUrlFor(platform: Platform | null): string | null {
  switch (platform) {
    case "ios-safari":
    case "ios-other-browser":
    case "ios-in-app":
      return APP_STORE_URL;
    case "android-chrome":
    case "android-samsung":
    case "android-other":
      return PLAY_STORE_URL;
    default:
      return null;
  }
}
