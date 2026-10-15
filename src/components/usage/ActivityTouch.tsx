"use client";

import { useEffect } from "react";

import { TOUCH_TICK_MS } from "@/lib/usage/touch";
import { touchActivity } from "@/lib/usage/touch-client";

/**
 * "Vibe is open on my screen", from every page. Mounted once in the root
 * layout, next to BuildRefresh; renders nothing. It feeds "active now" (the
 * last-active time) and the founders' day and week totals
 * (src/lib/usage/touch.ts has the rules, the Privacy Policy 3d the words).
 *
 * - Signed out: nothing, ever. Only the sign-in cookie's name is checked,
 *   on every attempt, since signing in needs no reload.
 * - Tries on mount, when the tab comes back on screen, when the page
 *   returns from the back-forward cache, and every 30 s while on screen.
 *   A request leaves at most once every four minutes per tab
 *   (`touchActivity` keeps the gap in sessionStorage), so a phone reader
 *   who only scrolls still counts, at one request per four minutes.
 * - Not in a background tab: a page that isn't on screen isn't "open on
 *   your screen".
 * - Not inside a frame (the small Messages window, `/messages?mini=1`):
 *   the page around it checks in for the tab.
 * - The static desktop profile takes over the whole tab, so it runs a twin,
 *   public/html/_usageTouch.js, with the same gaps and storage keys.
 *
 * Unlike BuildRefresh this one has a timer on purpose: someone reading
 * without touching the tab is exactly who the totals would otherwise miss.
 */
export function ActivityTouch(): null {
  useEffect(() => {
    try {
      if (window.top !== window.self) return;
    } catch {
      return;
    }

    const attempt = () => {
      if (document.visibilityState !== "visible") return;
      void touchActivity();
    };
    // `persisted`: back whole from the back-forward cache. An ordinary load
    // fires pageshow too, with persisted false, and the mount covers it.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) attempt();
    };

    attempt();
    document.addEventListener("visibilitychange", attempt);
    window.addEventListener("pageshow", onPageShow);
    const tick = window.setInterval(attempt, TOUCH_TICK_MS);

    return () => {
      document.removeEventListener("visibilitychange", attempt);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(tick);
    };
  }, []);

  return null;
}
