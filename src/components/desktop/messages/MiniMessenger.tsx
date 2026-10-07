"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { allBadgeCount, badgeText } from "@/components/mobile/messages/home/home-rules";
import type { ThreadEntry } from "@/components/mobile/messages/types";
import type { FeaturesResponse, InboxResponse } from "@/lib/chat/types";
import { useClientReady } from "@/lib/use-client-ready";
import { useIsMobile } from "@/lib/use-is-mobile";

import { MINI_SOURCE } from "./MiniFrame";

/**
 * The small Messages window on the shelled desktop pages (the feed, Network,
 * Otto, Settings): a `Messages` button at the bottom right, left of Otto,
 * that opens a 420px window framing `/messages?mini=1`. Inside is the
 * phone's Messages itself, so a person reads and answers a chat without
 * leaving the page they are on. `MiniFrame` (the framed page) sends the
 * whole tab anywhere that is not Messages.
 *
 * The static desktop profile has the same window from
 * public/html/_miniMessenger.js: a rule changed here is changed there.
 *
 * Laptops with the new chat only (`chat_v2`); never on `/messages`, which is
 * the full thing; nothing on a phone, where Messages is a tab.
 *
 * The frame exists only while the window is open: its page reads the lists
 * every 30 s while "visible", and a frame in a hidden window still is.
 */

const MINI_SRC = "/messages?mini=1";
const HOME = "/messages";
const BADGE_MS = 30_000;
/** Otto's orb sits at right 24, 56 wide: the button and the window stand left of it. */
const RIGHT = 96;

const plainClick = (e: React.MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** The inbox's unread number (`allBadgeCount`), or null when a read failed. */
async function readUnread(): Promise<number | null> {
  try {
    const get = <T,>(url: string) => fetch(url, { credentials: "include", cache: "no-store" }).then((r) => r.json() as Promise<T>);
    const [t, c] = await Promise.all([
      get<{ ok?: boolean; threads?: ThreadEntry[] }>("/api/me/threads?scope=chats"),
      get<InboxResponse | { ok: false }>("/api/me/inbox"),
    ]);
    if (!t.ok || !Array.isArray(t.threads) || !c.ok || !Array.isArray(c.clubs)) return null;
    return allBadgeCount(t.threads, c.clubs, new Date());
  } catch {
    return null;
  }
}

export function MiniMessenger() {
  const pathname = usePathname();
  const ready = useClientReady();
  const isMobile = useIsMobile();
  const [hasChat, setHasChat] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const wanted = ready && !isMobile && !pathname?.startsWith(HOME);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    fetch("/api/me/features", { credentials: "include" })
      .then((r) => r.json() as Promise<FeaturesResponse | { ok: false }>)
      .then((j) => {
        if (live && j.ok && j.chat_v2 === true) setHasChat(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wanted]);

  // The dot on the button, while the window is closed (open, the inbox shows its own).
  useEffect(() => {
    if (!wanted || !hasChat || open) return;
    let live = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const n = await readUnread();
      if (live && n !== null) setUnread(n);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), BADGE_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [wanted, hasChat, open]);

  const openInMessages = useCallback(() => {
    let url = HOME;
    try {
      const channel = new URLSearchParams(frameRef.current?.contentWindow?.location.search ?? "").get("channel");
      if (channel) url += `?channel=${encodeURIComponent(channel)}`;
    } catch {
      // The plain address.
    }
    window.location.assign(url);
  }, []);

  const compose = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.postMessage({ source: MINI_SOURCE, type: "compose" }, window.location.origin);
    } catch {
      // Nothing to open it in.
    }
  }, []);

  if (!wanted || !hasChat) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="vibe-mini-launch"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
        style={{
          position: "fixed",
          bottom: 30,
          right: RIGHT,
          zIndex: 9989,
          height: 44,
          padding: "0 16px 0 14px",
          borderRadius: 999,
          border: "1px solid var(--hairline)",
          background: "var(--paper)",
          color: "var(--charcoal)",
          boxShadow: "0 8px 24px rgba(0,0,0,.14)",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20l1.2-5.3A8.4 8.4 0 1 1 21 11.5z" />
        </svg>
        Messages
        {unread > 0 ? (
          <span aria-hidden="true" style={{ minWidth: 18, height: 18, boxSizing: "border-box", padding: "0 5px", borderRadius: 999, background: "var(--coral)", color: "#140806", fontSize: 11.5, fontWeight: 800, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {badgeText(unread)}
          </span>
        ) : null}
      </button>
    );
  }

  const iconButton: React.CSSProperties = { width: 30, height: 30, border: "none", borderRadius: 8, background: "transparent", color: "var(--ink-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };
  return (
    // `data-holds-reload`: a draft typed in the frame is not this page's
    // typed text, so the new-build check is told the window is in use.
    <section
      aria-label="Messages"
      data-holds-reload=""
      style={{
        position: "fixed",
        bottom: 24,
        right: RIGHT,
        zIndex: 9995,
        width: 420,
        maxWidth: "calc(100vw - 120px)",
        height: 600,
        maxHeight: "calc(100vh - 44px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--paper)",
        boxShadow: "0 24px 60px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.08)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <header style={{ flexShrink: 0, padding: "10px 12px 10px 14px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ flex: 1, fontFamily: "'Fraunces', serif", fontWeight: 800, fontSize: 15, color: "var(--charcoal)" }}>Messages</div>
        <button type="button" onClick={compose} aria-label="New message" title="New message" style={iconButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h8" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" />
          </svg>
        </button>
        <a
          href={HOME}
          onClick={(e) => {
            if (!plainClick(e)) return;
            e.preventDefault();
            openInMessages();
          }}
          style={{ fontSize: 11, fontWeight: 600, color: "var(--coral)", textDecoration: "none", padding: "4px 8px", borderRadius: 6 }}
        >
          Open
        </a>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ ...iconButton, fontSize: 18, lineHeight: 1 }}>
          ×
        </button>
      </header>
      <iframe
        ref={frameRef}
        src={MINI_SRC}
        title="Messages"
        // The page left Messages by a full load (a sign-in or Terms
        // redirect): that belongs to the whole tab.
        onLoad={(e) => {
          try {
            const at = e.currentTarget.contentWindow?.location;
            if (at && at.pathname !== HOME && at.href !== "about:blank") window.location.assign(at.href);
          } catch {
            // Another origin: leave it.
          }
        }}
        // The frame draws its own cursor: this page's would sit frozen on the
        // frame's edge. Its own "the pointer left the page" handler hides it.
        onMouseEnter={() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave"))}
        style={{ flex: 1, minHeight: 0, width: "100%", border: "none", display: "block", background: "var(--cream)", colorScheme: "normal" }}
      />
    </section>
  );
}
