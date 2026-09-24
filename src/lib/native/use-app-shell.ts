"use client";

import { useSyncExternalStore } from "react";

import { appShellOnClient, type AppShell } from "@/lib/native/detect";

/**
 * React's view of `detect.ts`: is this page inside Vibe's App Store / Google
 * Play app, and which one (handoffs/wave-plan-pwa/plan.md §6 S2A;
 * critic-s2s3.md item 17).
 *
 * Same shape as `usePlatform` in src/lib/pwa/use-standalone.ts. The hook
 * gives the server's answer (null) while the server renders and while the
 * page hydrates, so the first client render matches the HTML; the real value
 * follows straight after. A component mounted later, after a client-side
 * navigation, reads the real value at once, so only the page that hydrates
 * ever sees the one null frame.
 *
 * Anything that asks "am I in the app?" uses this, never `usePlatform()`:
 * the platform answers "which browser", which is a different question.
 */

// Neither signal changes under a live page: the shell sets the user agent
// before the first request, and Capacitor's `window.Capacitor` is injected
// at document start. So the answer is read once and kept.
let shellCache: AppShell | null | undefined;

function readAppShell(): AppShell | null {
  if (typeof window === "undefined") return null;
  if (shellCache === undefined) shellCache = appShellOnClient();
  return shellCache;
}

function serverAppShell(): AppShell | null {
  return null;
}

function subscribeNothing(): () => void {
  return () => {};
}

/**
 * "ios-app" or "android-app" inside the store apps; null in every browser,
 * including an installed Home Screen web app (that's `useIsStandalone`).
 * Null on the server and during hydration.
 */
export function useAppShell(): AppShell | null {
  return useSyncExternalStore(subscribeNothing, readAppShell, serverAppShell);
}
