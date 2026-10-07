"use client";

import { useCallback, useEffect, useState } from "react";

import type { HomeFilter } from "@/components/mobile/messages/home/home-rules";
import { MessagesHome } from "@/components/mobile/messages/home/MessagesHome";

/**
 * The inbox inside the small Messages window (`/messages/mini`, framed by
 * public/html/_miniMessenger.js). It is `MessagesHome` with `mini`: the same
 * reads, rows and rules as the phone's home, so the window can never drift
 * from the inbox again.
 *
 * Nothing opens in the frame. A row, a week card, a plan of the month sheet
 * and every link (`Find clubs`, `Browse events`) take the WHOLE tab: a chat
 * to `/messages?channel=<id>`, a link to its own address.
 */

/** Send the whole tab, or this one when the page is not framed. */
function go(url: string) {
  try {
    if (window.top && window.top !== window) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // A parent on another origin: fall through to this window.
  }
  window.location.assign(url);
}

const chatUrl = (id: string) => `/messages?channel=${encodeURIComponent(id)}`;

/** `MessagesHome` hands the lists up for the phone shell's deep links; the window has none. */
const noThreads = () => {};

export function MiniInbox({ chatV2 }: { chatV2: boolean }) {
  const [filter, setFilter] = useState<HomeFilter>("all");
  const openChat = useCallback((id: string) => go(chatUrl(id)), []);

  // Every link in the column, before React or next/link sees the click: a
  // plain left click goes to the link's address in the whole tab. A new-tab
  // click (Cmd, Ctrl, Shift, middle) is the browser's and already leaves the frame.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      go((a as HTMLAnchorElement).href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!chatV2) {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <a href="/messages" style={{ color: "var(--coral)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          Open Messages
        </a>
      </main>
    );
  }

  return (
    <MessagesHome
      mini
      filter={filter}
      onFilter={setFilter}
      refreshKey={0}
      onThreads={noThreads}
      onOpenClub={(_orgHandle, roomId) => openChat(roomId)}
      onOpenThread={openChat}
      onOpenRoom={(roomId) => openChat(roomId)}
      onCompose={() => go("/messages")}
    />
  );
}
