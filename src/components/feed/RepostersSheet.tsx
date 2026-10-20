"use client";

import { useRef } from "react";
import { Drawer } from "vaul";

import { RepostersBody, useReposters } from "./reposters-list";

/**
 * "Reposted by" on the phone (Oct 19, 2026, decision 1a): the bottom sheet
 * the feed's repost line opens (wired in batch B1). The same shape as
 * MutualsSheet (handle, title, a scrolling list of people with a follow
 * button each), in theme tokens instead of its fixed cream, so it reads
 * right in Night. It names the people you follow and says everyone else as a
 * number; the list itself is reposters-list.tsx, shared with the desktop
 * pop-up.
 *
 * Contract for B1: `<RepostersSheet postId open onClose />`. Opened by state,
 * not by a trigger, so it remembers what had focus and hands it back on
 * close (the Tonight sheet's way). Layers: 10000 / 10001, over the phone tab
 * bar (globals.css .vibe-mobile-tabbar is 9988).
 */
export function RepostersSheet({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const { state, retry } = useReposters(postId, open);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      autoFocus
    >
      <Drawer.Portal>
        <Drawer.Overlay style={overlayStyle} />
        <Drawer.Content
          style={contentStyle}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            returnFocusRef.current = active instanceof HTMLElement ? active : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const back = returnFocusRef.current;
            returnFocusRef.current = null;
            if (back?.isConnected) back.focus({ preventScroll: true });
          }}
        >
          <div aria-hidden style={grabStyle} />
          <div style={topStyle}>
            <Drawer.Title style={titleStyle}>Reposted by</Drawer.Title>
            <button type="button" aria-label="Close" onClick={onClose} className="vibe-press" style={closeStyle}>
              <span aria-hidden style={closeDiscStyle}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                </svg>
              </span>
            </button>
          </div>
          {/* Scrolling a long list mustn't drag the sheet shut. */}
          <div data-vaul-no-drag style={bodyStyle}>
            <RepostersBody state={state} onRetry={retry} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.4)" };
const contentStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 10001,
  maxHeight: "80dvh",
  display: "flex",
  flexDirection: "column",
  background: "var(--paper)",
  color: "var(--charcoal)",
  borderTop: "1px solid var(--glass-border)",
  borderRadius: "24px 24px 0 0",
  boxShadow: "0 -16px 48px rgba(0,0,0,0.35)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  outline: "none",
};
const grabStyle: React.CSSProperties = { flexShrink: 0, alignSelf: "center", width: 38, height: 4, margin: "8px auto 4px", borderRadius: 999, background: "rgba(var(--scrim-rgb),0.18)" };
const topStyle: React.CSSProperties = { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px 0 16px" };
const titleStyle: React.CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--charcoal)" };
const closeStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  border: 0,
  padding: 0,
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink-2)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
const closeDiscStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.06)",
  background: "var(--paper-62)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const bodyStyle: React.CSSProperties = { maxHeight: "calc(80dvh - 64px)", overflowY: "auto", overscrollBehavior: "contain", padding: "0 8px 20px" };
