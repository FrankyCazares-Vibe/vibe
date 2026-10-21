"use client";

import { useSyncExternalStore } from "react";

/**
 * The club page's own phone breakpoint, the width at which globals.css
 * switches the page to its phone layout (`.vibe-club-*`, 720px). Sheets and
 * dialogs on this page pick their shell off the same number, so a centred
 * dialog never opens over the phone layout. NOT `useIsMobile` (899px): the
 * 180px between the two would give a bottom sheet on a page still in its
 * desktop layout. OrgPostsList.tsx keeps its own copy of the query.
 */
export const PHONE_QUERY = "(max-width: 720px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** The server renders the desktop shell; the client reads the real viewport
 *  on the first paint after hydration. */
function serverSnapshot(): boolean {
  return false;
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
