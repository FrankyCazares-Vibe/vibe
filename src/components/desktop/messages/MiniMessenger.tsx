"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { allBadgeCount } from "@/components/mobile/messages/home/home-rules";
import type { ThreadEntry } from "@/components/mobile/messages/types";
import type { FeaturesResponse, InboxResponse } from "@/lib/chat/types";
import { useClientReady } from "@/lib/use-client-ready";
import { useIsMobile } from "@/lib/use-is-mobile";

import { MINI_SOURCE } from "./MiniFrame";

/**
 * Messages inside Otto's panel on the shelled desktop pages (the feed,
 * Network, Otto, Settings): the `Messages` tab of `OttoSidePanel` frames
 * `/messages?mini=1`, the phone's Messages itself, so a person reads and
 * answers a chat without leaving the page they are on. `MiniFrame` (the
 * framed page) sends the whole tab anywhere that is not Messages.
 *
 * The static desktop profile has the same frame in its own small window,
 * from public/html/_miniMessenger.js: a rule changed here is changed there.
 *
 * Laptops with the new chat only (`chat_v2`); nothing on a phone, where
 * Messages is a tab of its own.
 */

const MINI_SRC = "/messages?mini=1";
const HOME = "/messages";
const BADGE_MS = 30_000;

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

/**
 * Does this laptop get Messages in Otto's panel, and how many chats are
 * unread. The number is read every 30 s while `counting` (the panel closed:
 * open, the inbox shows its own marks) and once more each time it closes.
 */
export function useMiniMessages(counting: boolean): { available: boolean; unread: number } {
  const ready = useClientReady();
  const isMobile = useIsMobile();
  const [hasChat, setHasChat] = useState(false);
  const [unread, setUnread] = useState(0);
  const wanted = ready && !isMobile;

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

  const available = wanted && hasChat;
  useEffect(() => {
    if (!available || !counting) return;
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
  }, [available, counting]);

  return { available, unread: available ? unread : 0 };
}

/** What the panel's own buttons ask of the frame. */
export type MiniMessagesHandle = {
  /** Open the new-message sheet in the frame. */
  compose: () => void;
  /** The chat on screen, in full Messages, in the whole tab. */
  openInMessages: () => void;
};

/**
 * The frame itself. Mounted only while its tab is on screen: its page reads
 * the lists every 30 s while "visible", and a hidden frame still is.
 * `data-holds-reload`: a draft typed in the frame is not this page's typed
 * text, so the new-build check is told the frame is in use.
 */
export const MiniMessagesFrame = forwardRef<MiniMessagesHandle, { style?: React.CSSProperties }>(function MiniMessagesFrame({ style }, ref) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useImperativeHandle(ref, () => ({
    compose() {
      try {
        frameRef.current?.contentWindow?.postMessage({ source: MINI_SOURCE, type: "compose" }, window.location.origin);
      } catch {
        // Nothing to open it in.
      }
    },
    openInMessages() {
      let url = HOME;
      try {
        const channel = new URLSearchParams(frameRef.current?.contentWindow?.location.search ?? "").get("channel");
        if (channel) url += `?channel=${encodeURIComponent(channel)}`;
      } catch {
        // The plain address.
      }
      // A full load on purpose: the panel, the frame and its history go with the page.
      window.location.href = url;
    },
  }));
  return (
    <iframe
      ref={frameRef}
      src={MINI_SRC}
      title="Messages"
      data-holds-reload=""
      // The page left Messages by a full load (a sign-in or Terms redirect):
      // that belongs to the whole tab.
      onLoad={(e) => {
        try {
          const at = e.currentTarget.contentWindow?.location;
          if (at && at.pathname !== HOME && at.href !== "about:blank") window.location.href = at.href;
        } catch {
          // Another origin: leave it.
        }
      }}
      // The frame draws its own cursor: this page's would sit frozen on the
      // frame's edge. Its own "the pointer left the page" handler hides it.
      onMouseEnter={() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave"))}
      style={{ flex: 1, minHeight: 0, width: "100%", border: "none", display: "block", background: "var(--cream)", colorScheme: "normal", ...style }}
    />
  );
});
