"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the answer only changes once, when hydration ends. */
function subscribeToNothing(): () => void {
  return () => {};
}

function readClient(): boolean {
  return true;
}

/** The server has no client, and hydration repeats the server's answer. */
function readServer(): boolean {
  return false;
}

/**
 * `false` on the server and during hydration, `true` from the first client
 * render after it. For a tree that must not mount until the real viewport is
 * known: `useIsMobile` reports desktop on the server, so without this a phone
 * mounts the desktop tree (and runs its mount effects) for one frame on every
 * hard load. The `OnboardingSwitch` shape, as a hook.
 */
export function useClientReady(): boolean {
  return useSyncExternalStore(subscribeToNothing, readClient, readServer);
}
