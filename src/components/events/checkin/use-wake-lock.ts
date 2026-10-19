"use client";

/**
 * useWakeLock(active): keeps the screen on while the door shows a live code
 * (Oct 19 2026; contract §4.3). A phone left on a table at the door would
 * otherwise dim and lock in a minute, and the line stalls.
 *
 * - Asks for a `screen` wake lock when `active` turns on, and again when the
 *   page comes back into view: the browser drops the lock whenever the tab
 *   is hidden, so it has to be asked for each time.
 * - Lets it go when `active` turns off or the page unmounts.
 * - Fails silently: an old browser, a low battery or a refusal just means the
 *   screen may dim; nothing on the door depends on it. Permissions-Policy
 *   doesn't block it (next.config.ts lists no `screen-wake-lock`).
 */
import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    const api = navigator.wakeLock;
    if (!api || typeof api.request !== "function") return;

    let sentinel: WakeLockSentinel | null = null;
    let asking = false;
    let stopped = false;

    const ask = async () => {
      if (stopped || asking || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      asking = true;
      try {
        const lock = await api.request("screen");
        // Turned off (or unmounted) while the browser was answering: give
        // the lock straight back instead of holding it with nobody to free it.
        if (stopped) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Refused or unsupported: the screen may dim, nothing else changes.
      } finally {
        asking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void ask();
    };

    void ask();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const held = sentinel;
      sentinel = null;
      if (held && !held.released) void held.release().catch(() => {});
    };
  }, [active]);
}
