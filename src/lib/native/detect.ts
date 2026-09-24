/**
 * Is this page running inside Vibe's App Store / Google Play app?
 *
 * The store apps are a Capacitor shell around the live site
 * (handoffs/wave-plan-pwa/plan.md §5–§6). The shell appends
 * `VibeApp/1 (ios)` or `VibeApp/1 (android)` to the web view's user agent
 * (mobile/capacitor.config.ts), so the server can read it from the request
 * and the page can read it from `navigator.userAgent`. On the client,
 * `window.Capacitor.isNativePlatform()` is the second signal.
 *
 * Pure: no React, no `server-only`, no runtime `@/` imports, so `node --test`
 * loads it directly (detect.test.ts). Only erasable TypeScript.
 */

export type AppShell = "ios-app" | "android-app";

/**
 * `VibeApp/<major> (ios|android)`, anywhere in the user agent. Capacitor 8.5
 * puts a space before `appendUserAgent` on both platforms
 * (CAPBridgeViewController.swift, Bridge.java), but the regex doesn't rely on
 * it, so a shell that glues the token on still counts.
 */
const APP_UA = /VibeApp\/\d+\s*\((ios|android)\)/;

/** The store app this user agent belongs to, or null for any browser. */
export function detectAppShell(ua: string | null | undefined): AppShell | null {
  if (!ua) return null;
  const m = APP_UA.exec(ua);
  if (!m) return null;
  return m[1] === "ios" ? "ios-app" : "android-app";
}

/** The slice of `window.Capacitor` this file reads. */
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

/**
 * Client-side check. False on the server and in every browser, including an
 * installed Home Screen web app (that's `isStandalone` in
 * src/lib/pwa/display-mode.ts, a different thing).
 */
export function appShellOnClient(): AppShell | null {
  if (typeof window === "undefined") return null;
  const fromUa = detectAppShell(window.navigator?.userAgent);
  if (fromUa) return fromUa;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (cap?.isNativePlatform?.() === true) {
    return cap.getPlatform?.() === "android" ? "android-app" : "ios-app";
  }
  return null;
}
