"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The page inside the small Messages window (`/messages?mini=1`, framed by
 * public/html/_miniMessenger.js on the static profile and by
 * `MiniMessenger` on the shelled pages). What is inside is the phone's
 * Messages itself: the inbox, and a tap opens the chat in the window, with
 * its composer.
 *
 * Messages stays in the frame; everything else takes the whole tab. A link
 * or a screen change that leaves `/messages` (a profile, a club page, an
 * event, `Find clubs`) would otherwise load the site inside a 420px frame.
 */

/** The `source` of the messages the window and this frame send each other. */
export const MINI_SOURCE = "vibe-mini";

const HOME = "/messages";

/** Send the whole tab, or this one when the page is not framed. */
function goTop(url: string) {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // A parent on another origin: fall through to this window.
  }
  window.location.assign(url);
}

/** The address as this frame would load it, or null when it stays in Messages (or cannot be read). */
function leaving(url: string | URL | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  try {
    const next = new URL(String(url), window.location.href);
    if (next.origin === window.location.origin && next.pathname === HOME) return null;
    return next.href;
  } catch {
    return null;
  }
}

export function MiniFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    // A plain left click on a link that leaves Messages: the whole tab goes,
    // before React or next/link sees the click.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = leaving((a as HTMLAnchorElement).href);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      goTop(href);
    };
    document.addEventListener("click", onClick, true);

    // A screen change made in code (the router's push to a profile or a club
    // page) writes the frame's history: the write is the whole tab's instead.
    const push = window.history.pushState;
    const replace = window.history.replaceState;
    const guard = (write: typeof push): typeof push =>
      function guarded(this: History, state, unused, url) {
        const href = leaving(url);
        if (href) {
          goTop(href);
          return;
        }
        write.call(this, state, unused, url);
      };
    window.history.pushState = guard(push);
    window.history.replaceState = guard(replace);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.history.pushState = push;
      window.history.replaceState = replace;
    };
  }, []);

  return <div style={{ minHeight: "100dvh", background: "var(--cream)" }}>{children}</div>;
}
