"use client";

import { useRef, useState } from "react";

import { ClubSwitcherSheet } from "@/components/orgs/ClubSwitcherSheet";

/**
 * The small chevron after the club's name, for its owner and officers on a
 * phone (the club's view, wave 2, C9 item 3): it opens "Switch to." (C3),
 * the same sheet the Profile tab's hold opens. Hidden from 900px up
 * (globals.css `.vibe-club-switch`), where the left menu lists the clubs.
 */
export function SwitchChevron() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="vibe-club-switch"
        aria-label="Switch account"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          margin: "-6px -10px -6px -6px",
          flexShrink: 0,
          background: "transparent",
          border: "none",
          borderRadius: 999,
          color: "var(--charcoal)",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ClubSwitcherSheet
        open={open}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        me={null}
      />
    </>
  );
}
