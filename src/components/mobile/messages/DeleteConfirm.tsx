"use client";

import { useEffect, useId, useRef } from "react";

import { useLayerHistory } from "@/lib/chat/use-layer-history";

import type { DeleteCopy } from "./delete-rules";
import { FONT, palette } from "./v2-tokens";

/**
 * The confirm before deleting your own message (Oct 19, 2026; batch B7), on
 * the phone and the desktop, in a dm, a group, a club room, an event chat
 * and on the Board: the title, one sentence of what happens
 * (`deleteConfirmCopy`), Cancel and a red Delete. It is `RemoveConfirm`'s
 * twin (club/RoomThread.tsx): focus lands on Cancel, Tab cycles the two
 * buttons, Escape cancels (and is stopped, so on the desktop it never also
 * closes the chat), focus returns to what had it, and Back cancels it alone
 * (its own history entry, `useLayerHistory`).
 *
 * Drawn `position: fixed` where it is mounted: inside the phone
 * conversation's drawer it stays inside that drawer's focus trap.
 *
 * `focusAfter` (review of Oct 19, 2026): after a delete the button that
 * opened this (the hover toolbar's More, a byline's "...") is usually gone
 * with the row it sat on, and focus fell to the page body, so a keyboard
 * user lost their place. When what had focus is no longer there (or the
 * body has it a frame later), focus goes to what `focusAfter` finds: the
 * note in the message's place (`data-chat-row`), or the post's replies.
 */
export function rowFocusTarget(scope: HTMLElement | null, ...ids: (string | null | undefined)[]): HTMLElement | null {
  if (!scope) return null;
  // Only what can take focus: a note (tabindex -1) or a post's replies button.
  const pick = (attr: string, sel: string, id: string) =>
    Array.from(scope.querySelectorAll<HTMLElement>(sel)).find((x) => x.getAttribute(attr) === id) ?? null;
  for (const id of ids) {
    if (!id) continue;
    const el = pick("data-chat-row", "[data-chat-row][tabindex]", id) ?? pick("data-replies-toggle", "[data-replies-toggle]", id);
    if (el) return el;
  }
  return null;
}

/** The confirm itself (see above). */
export function DeleteConfirm({
  night,
  busy,
  copy,
  onConfirm,
  onCancel,
  focusAfter,
}: {
  night: boolean;
  busy: boolean;
  copy: DeleteCopy;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus goes when what had it before is gone (after a delete). */
  focusAfter?: () => HTMLElement | null;
}) {
  const t = palette(night);
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useLayerHistory(true, onCancel);
  const focusAfterRef = useRef(focusAfter);
  useEffect(() => {
    focusAfterRef.current = focusAfter;
  });
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (returnTo && returnTo.isConnected) returnTo.focus();
      const after = focusAfterRef.current;
      if (!after) return;
      // A frame later: the row may turn into its note in the same commit
      // that closes this, or in the next one.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || !returnTo || !returnTo.isConnected;
        if (lost) after()?.focus({ preventScroll: true });
      });
    };
  }, []);
  const button: React.CSSProperties = {
    flex: 1,
    height: 44,
    borderRadius: 999,
    border: "none",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };
  return (
    <div
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1150, background: t.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            (document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current)?.focus();
          }
        }}
        style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", padding: 18, borderRadius: 20, border: `1px solid ${t.hairline}`, background: t.surface, color: t.ink, fontFamily: FONT, display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--card-shadow)" }}
      >
        <p id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
          {copy.title}
        </p>
        <p id={bodyId} style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: t.secondary }}>
          {copy.body}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button ref={cancelRef} type="button" onClick={onCancel} style={{ ...button, background: "rgba(var(--scrim-rgb),0.07)", color: t.ink }}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              if (!busy) onConfirm();
            }}
            aria-disabled={busy}
            style={{ ...button, background: "var(--danger-ink)", color: "var(--paper)", opacity: busy ? 0.6 : 1 }}
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The trash can of every Delete row (inline, `currentColor`, never an emoji). */
export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M4.4 4.5l.6 8.1c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9l.6-8.1M6.8 7v4.2M9.2 7v4.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
