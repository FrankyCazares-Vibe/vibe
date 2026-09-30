"use client";

import { useEffect } from "react";

/**
 * The one owner of `body.vibe-composer-open` on the wave-2 screens
 * (handoffs/chat-redesign/wave-2-contracts.md 11.0, SCREENS-H1).
 *
 * `.vibe-mobile-tabbar` is fixed at z-index 9988 (globals.css) and is hidden
 * only by `body.vibe-composer-open`. The old views each add and remove the
 * class with a boolean, which breaks when two of them overlap (MM:9): the
 * first to unmount takes the class away from the one still open. The new
 * screens count instead: the first mount adds the class, the last unmount
 * removes it, so `ClubSpace` with `EventChat` over it with `CardSheet` over
 * that keep the bar hidden until all three are gone.
 *
 * `ClubSpace`, `EventChat`, `CardSheet` and `RsvpSheet` call it; nothing
 * else in the club stack touches `document.body.classList`. The old boolean
 * mounters are untouched (they never overlap a new screen).
 */

const CLASS = "vibe-composer-open";

let mounted = 0;

export function useHideTabBar(): void {
  useEffect(() => {
    mounted += 1;
    if (mounted === 1) document.body.classList.add(CLASS);
    return () => {
      mounted = Math.max(0, mounted - 1);
      if (mounted === 0) document.body.classList.remove(CLASS);
    };
  }, []);
}
