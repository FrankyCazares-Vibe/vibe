"use client";

import { useSyncExternalStore } from "react";

import { detectPlatform, isStandalone, type Platform } from "@/lib/pwa/display-mode";

/**
 * React's view of `display-mode.ts`: is this the installed app, and which
 * browser is it (handoffs/wave-plan-pwa/plan.md §2 1E; critic-w1.md item 10).
 *
 * Both hooks give the server answer (false / null) while the server renders
 * and while the page hydrates, so the first client render matches the HTML,
 * then the real one. A component mounted later, after a client-side
 * navigation, reads the real value straight away. Same shape as
 * `src/lib/use-is-mobile.ts`.
 */

const STANDALONE_QUERY = "(display-mode: standalone)";
const FULLSCREEN_QUERY = "(display-mode: fullscreen)";

function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

// Display mode can change under a live page: desktop Chrome's "Open in app"
// moves the tab into an app window, and fullscreen comes and goes.
function subscribeDisplayMode(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const lists = [window.matchMedia(STANDALONE_QUERY), window.matchMedia(FULLSCREEN_QUERY)];
  const handler = () => callback();
  for (const mq of lists) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", handler);
    else mq.addListener(handler); // Safari before 14
  }
  return () => {
    for (const mq of lists) {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    }
  };
}

function readStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return isStandalone({
    navigatorStandalone: (window.navigator as Navigator & { standalone?: unknown }).standalone,
    matchStandalone: mediaMatches(STANDALONE_QUERY),
    matchFullscreen: mediaMatches(FULLSCREEN_QUERY),
  });
}

function serverStandalone(): boolean {
  return false;
}

/**
 * True when Vibe is running as the installed app (Home Screen on a phone,
 * an app window on a desktop), false in a browser tab. False on the server
 * and during hydration.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeDisplayMode, readStandalone, serverStandalone);
}

// The user agent doesn't change under a live page, so it's read once.
let platformCache: Platform | null = null;

function readPlatform(): Platform | null {
  if (typeof window === "undefined") return null;
  if (platformCache === null) {
    platformCache = detectPlatform({
      ua: window.navigator.userAgent,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
  }
  return platformCache;
}

function serverPlatform(): Platform | null {
  return null;
}

function subscribeNothing(): () => void {
  return () => {};
}

/**
 * The student's platform (see `detectPlatform`), or null on the server and
 * during hydration. Components ask this instead of reading the user agent
 * themselves; `isIosPlatform` answers "is this an iPhone or iPad?".
 */
export function usePlatform(): Platform | null {
  return useSyncExternalStore(subscribeNothing, readPlatform, serverPlatform);
}
