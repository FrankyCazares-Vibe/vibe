"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import {
  boxesTouch,
  COOKIE_NOTICE_COPY,
  COOKIE_NOTICE_GAP,
  COOKIE_NOTICE_KEEP_CLEAR,
  COOKIE_NOTICE_STORAGE_KEY,
  cookieNoticeAllowedHere,
  cookieNoticeClosed,
  rememberCookieNoticeClosed,
} from "@/lib/legal/cookie-notice";
import { appShellOnClient } from "@/lib/native/detect";

import "./cookie-notice.css";

/**
 * Closed during this page view. It is what hides the notice when the browser
 * refuses storage (private mode): gone for now, back on the next load.
 */
let closedThisView = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Closed in another tab: this one follows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === COOKIE_NOTICE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function framed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Should the notice be on screen? Read in the browser only. */
function shouldShow(): boolean {
  if (closedThisView) return false;
  // The store apps are not the website: no web notice inside them.
  if (appShellOnClient()) return false;
  if (!cookieNoticeAllowedHere(framed(), window.location.search)) return false;
  return !cookieNoticeClosed(browserStorage());
}

/** The server never draws it, so a returning visitor never sees it flash. */
const neverOnServer = () => false;

function close() {
  closedThisView = true;
  rememberCookieNoticeClosed(browserStorage());
  listeners.forEach((fn) => fn());
}

/**
 * The one-time cookie notice for the signed-out pages (the landing, the
 * waitlist, log in, sign up, forgot password). A notice, not a consent wall:
 * Vibe sets only the sign-in cookies, so there is nothing to accept or
 * decline. "Got it" writes one note in this browser and that is all: no
 * request, no count, no cookie (rules in src/lib/legal/cookie-notice.ts;
 * Privacy Policy section 7 describes it).
 *
 * Fixed to the bottom, so it moves nothing. Whenever a main button, a form's
 * submit button or the human-check box is under its place, it fades out and
 * lets taps through, then comes back once they have scrolled clear; keyboard
 * focus inside it always brings it back.
 *
 * `tone="night"` is for the landing and the waitlist, which are Night in
 * either app theme.
 */
export function CookieNotice({ tone = "theme" }: { tone?: "theme" | "night" }) {
  const show = useSyncExternalStore(subscribe, shouldShow, neverOnServer);
  const box = useRef<HTMLDivElement>(null);

  // Before paint, so it is never drawn over a button even for one frame.
  useLayoutEffect(() => {
    const el = box.current;
    if (!show || !el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const mine = el.getBoundingClientRect();
      let covering = false;
      for (const other of document.querySelectorAll(COOKIE_NOTICE_KEEP_CLEAR)) {
        if (el.contains(other)) continue;
        if (boxesTouch(mine, other.getBoundingClientRect(), COOKIE_NOTICE_GAP)) {
          covering = true;
          break;
        }
      }
      el.toggleAttribute("data-aside", covering);
    };
    const ask = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    // Capture: a scroll inside any panel counts, not only the page's.
    window.addEventListener("scroll", ask, { passive: true, capture: true });
    window.addEventListener("resize", ask);
    // The page growing or shrinking (an error line, the human-check box landing).
    const grown = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(ask);
    grown?.observe(document.body);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", ask, { capture: true });
      window.removeEventListener("resize", ask);
      grown?.disconnect();
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={box}
      role="region"
      aria-label={COOKIE_NOTICE_COPY.label}
      className={`vibe-cookie-notice${tone === "night" ? " vibe-cookie-notice--night" : ""}`}
    >
      <p className="vibe-cookie-notice-text">{COOKIE_NOTICE_COPY.text}</p>
      <div className="vibe-cookie-notice-row">
        <Link href={COOKIE_NOTICE_COPY.linkHref} className="vibe-cookie-notice-link">
          {COOKIE_NOTICE_COPY.link}
        </Link>
        <button type="button" className="vibe-cookie-notice-btn" onClick={close}>
          {COOKIE_NOTICE_COPY.button}
        </button>
      </div>
    </div>
  );
}
