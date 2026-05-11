"use client";

import { useSyncExternalStore } from "react";

/**
 * Viewport breakpoint that separates the desktop UI from the mobile UI.
 * Everything < this width gets the mobile component tree.
 *
 * Kept in sync with the legacy `.vibe-app-shell` media query at the same
 * width so a stray <CampusAppShell>-using route still collapses
 * correctly during the migration. After every route is forked, the shell
 * media queries can come out.
 */
export const MOBILE_BREAKPOINT_PX = 900;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(QUERY);
  const handler = () => callback();
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  // Older Safari
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Viewport class hook backed by `matchMedia`. Returns `true` on mobile
 * widths, `false` on desktop. `useSyncExternalStore` handles SSR +
 * hydration consistency — server always reports desktop, client reads
 * the real viewport on first paint after hydration.
 *
 * Note: this returns a concrete boolean, not `boolean | null`. SSR
 * renders the desktop tree, then if the user is actually on mobile the
 * component swaps after hydration. The tradeoff is a one-frame flicker
 * on mobile vs. a blank-flash if we returned null first. We picked the
 * flicker — mobile users will mostly arrive via Capacitor where SSR
 * defaults won't apply, and a flash of "nothing" feels worse than a
 * flash of "the other layout".
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
