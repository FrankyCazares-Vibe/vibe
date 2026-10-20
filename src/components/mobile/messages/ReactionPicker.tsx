"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { TrashIcon } from "./DeleteConfirm";
import { DELETE_LABEL } from "./delete-rules";
import { type MessageReaction } from "./types";

export const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥", "😮", "😢"] as const;

// Eats the click that ends one press, so the tap that closes the
// reaction picker doesn't also open whatever is under the finger. It
// listens in the capture phase on document, ahead of React and links.
// The next press, this press turning into a scroll (pointercancel), or
// a second with no click ends it without eating anything.
function swallowNextClick(pointerId: number) {
  let timer = 0;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) stop();
  };
  const stop = () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("pointercancel", onCancel, true);
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("pointercancel", onCancel, true);
  timer = window.setTimeout(stop, 1000);
}

export function ReactionPicker({
  darkMode,
  isMine,
  existing,
  onPick,
  onReply,
  onPin,
  pinLabel,
  onReport,
  onRemove,
  onDelete,
  onClose,
}: {
  darkMode: boolean;
  isMine: boolean;
  existing: MessageReaction[];
  onPick: (emoji: string) => void;
  /** Adds "↩ Reply", on the emoji row's far side from the bubble. */
  onReply?: () => void;
  /** Adds "Pin message" / "Unpin message", between Reply and Report: a pin
   *  for everyone in a dm or a group (wave-3 desktop contract 4d.6). Only the
   *  flag-on phone conversation passes it; absent on a row still sending and
   *  in a pending request. Not "Pin to top", which pins the chat. */
  onPin?: () => void;
  /** The pin row's words, whichever state the message is in. */
  pinLabel?: string;
  /** Adds "Report", under Reply. Absent on the viewer's own message and on
   *  one still sending. */
  onReport?: () => void;
  /** Adds "Remove", under Report: an officer's or a mod's removal of
   *  someone else's message in a club room (wave-2 contract 11.5). */
  onRemove?: () => void;
  /** Adds a red "Delete", last: the viewer's own message, card or reply
   *  (Oct 19, 2026; delete-rules.ts `canDeleteOwn`). The caller confirms. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Opens above the bubble unless the message list can't show it
  // there, then below. The list clips it at its top edge, and above the
  // first message no scroll brings it back, so on a request or DM with
  // one or two messages the emojis and Reply were cut off. Measured
  // before paint, so it never shows on the wrong side first.
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const el = pickerRef.current;
    // The bubble wrapper it's positioned against.
    const anchor = el?.offsetParent;
    if (!el || !anchor) return;
    let list = anchor.parentElement;
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) {
      list = list.parentElement;
    }
    const listTop = list ? list.getBoundingClientRect().top : 0;
    if (anchor.getBoundingClientRect().top - listTop < el.offsetHeight + 6) {
      setBelow(true);
    }
  }, []);

  // Outside-tap dismiss — but only if the tap is OUTSIDE the picker.
  // Previously we used `once: true`, which also fired when the user
  // tapped an emoji inside, unmounting the picker before the emoji's
  // click could fire (pointerdown happens before click on mobile). Now
  // we check the event target and short-circuit if it's inside.
  // Closing still happens on pointerdown, so a scroll that starts
  // outside closes it too. That tap's click is eaten: it used to open
  // the shared post, reaction chip or More sheet under the finger.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && pickerRef.current?.contains(target)) return;
      swallowNextClick(e.pointerId);
      onClose();
    };
    // Bind on the next tick so the pointerdown that opened the picker
    // doesn't immediately close it.
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", handler);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [onClose]);

  const reactedSet = new Set(
    existing.filter((r) => r.viewer_reacted).map((r) => r.emoji),
  );

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="React"
      style={{
        position: "absolute",
        ...(below
          ? { top: "calc(100% + 6px)" }
          : { bottom: "calc(100% + 6px)" }),
        ...(isMine ? { right: 0 } : { left: 32 }),
        display: "flex",
        // The emojis sit next to the bubble on either side (above, that's
        // where they were before Reply), and Reply goes on the far side.
        flexDirection: below ? "column" : "column-reverse",
        padding: "6px 8px",
        // A pill for the emoji row alone; a card once Reply (or Report)
        // joins it. They get their own rows because beside the emojis the
        // picker ran past a phone's width and scrolled the list sideways.
        borderRadius: onReply || onPin || onReport || onRemove || onDelete ? 20 : 999,
        background: darkMode
          ? "rgba(20,16,28,0.92)"
          : "rgba(255,255,255,0.96)",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid rgba(28,28,30,0.10)",
        boxShadow: darkMode
          ? "inset 0 1px 0 rgba(255,255,255,0.10),0 12px 28px rgba(0,0,0,0.42)"
          : "0 12px 28px rgba(180,120,60,0.18)",
        backdropFilter: darkMode ? "blur(20px) saturate(180%)" : undefined,
        WebkitBackdropFilter: darkMode ? "blur(20px) saturate(180%)" : undefined,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {REACTION_EMOJIS.map((emoji) => {
          const on = reactedSet.has(emoji);
          return (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(emoji);
              }}
              style={{
                background: on ? "rgba(255,140,90,0.22)" : "transparent",
                border: "none",
                padding: 0,
                width: 32,
                height: 32,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                boxShadow: on
                  ? "0 0 0 1.5px rgba(255,180,150,0.7)"
                  : "none",
                transition: "transform 120ms ease",
              }}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      {onReply || onPin || onReport || onRemove || onDelete ? (
        <>
          <div
            aria-hidden
            style={{
              height: 1,
              // 6px on the emoji side, 4px on Reply's, in either order.
              margin: below ? "6px 2px 4px" : "4px 2px 6px",
              background: darkMode ? "rgba(255,255,255,0.12)" : "rgba(28,28,30,0.08)",
            }}
          />
          {onReply ? (
            <button
              type="button"
              aria-label="Reply"
              onClick={(e) => {
                e.stopPropagation();
                onReply();
              }}
              style={pickerRowStyle(darkMode, false)}
            >
              <span aria-hidden>↩</span>
              Reply
            </button>
          ) : null}
          {onPin ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
              style={pickerRowStyle(darkMode, false)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M5.5 2h5l-.75 4.25L12 8.5v1.25H4V8.5l2.25-2.25L5.5 2zM8 9.75V14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {pinLabel ?? "Pin message"}
            </button>
          ) : null}
          {onReport ? (
            <button
              type="button"
              aria-label="Report this message"
              onClick={(e) => {
                e.stopPropagation();
                onReport();
              }}
              style={pickerRowStyle(darkMode, true)}
            >
              <span aria-hidden>⚑</span>
              Report
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              style={pickerRowStyle(darkMode, true)}
            >
              <span aria-hidden>✕</span>
              Remove
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={pickerRowStyle(darkMode, true)}
            >
              <TrashIcon />
              {DELETE_LABEL}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Reply, the pin row, Report, Remove and Delete, so the rows in the long-press picker can't drift. */
function pickerRowStyle(darkMode: boolean, danger: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 36,
    padding: "0 8px",
    borderRadius: 12,
    border: "none",
    background: "transparent",
    color: danger ? (darkMode ? "#FFAE9E" : "#C42B1C") : darkMode ? "#fff" : "#1C1C1E",
    fontFamily: "DM Sans, sans-serif",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };
}
