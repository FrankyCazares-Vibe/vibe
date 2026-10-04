"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { REACTION_EMOJIS } from "../ReactionPicker";
import { FONT, palette } from "../v2-tokens";
import { authorName } from "./helpers";

/**
 * The hover toolbar of a club message on the desktop surface
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 6.4, 1.3 K9, 6.5): the
 * laptop's form of the phone's long-press picker. `RoomThread` wraps each row
 * in it ONLY on the desktop surface and hands it the handlers it already
 * builds per row; on the phone it is never mounted (the long-press stays).
 *
 * A `position: relative` wrapper around the row, and a 30px pill
 * (`role="toolbar"`, `Message actions`) at the row's outer top corner: the
 * far side from the bubble's own edge, kept inside the thread's width. One
 * button per handler passed: React (the seven `REACTION_EMOJIS` in a row),
 * Reply, and "..." (`More`: a small menu, `Report` and `Remove`). A row with
 * no handler at all (a removed-content card, a `temp_` row still sending)
 * gets the bare wrapper: no pill, no Tab stop, the same element, so the
 * bubble is not remounted when its row turns real.
 *
 * HOW IT HIDES. Only with `opacity: 0` and `pointer-events: none`
 * (`HOVER_ACTIONS_CSS`), never by taking the pill out of the tree or the
 * layout: its buttons must be able to take focus, or the toolbar could not
 * be opened by keyboard. It shows while the pointer is over the row, while
 * the row or a button of the pill holds keyboard focus, and while the emoji
 * row or the menu is open; it leaves 150 ms after (the CSS delay).
 *
 * KEYBOARD (K9). The wrapper is the row's ONE Tab stop (`tabIndex={0}`,
 * `role="group"`, named `Message from <name>`); every button here is
 * `tabIndex={-1}`. Enter or Space on the row moves focus to the first
 * button; Left / Right move along the pill and along the emoji row, Up /
 * Down along the menu; Enter presses; Esc closes the emoji row or the menu
 * when one is open, else returns focus to the row; Tab goes on to the next
 * row. Every Esc handled here is stopped, so it never reaches the shell's
 * "Esc closes the chat".
 *
 * A press with the mouse never moves focus onto a button (`keepFocus`), so
 * a click leaves no pill showing behind it and no text selection is lost.
 */

export type HoverActionsProps = {
  night: boolean;
  isMine: boolean;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onReport?: () => void;
  onRemove?: () => void;
  children: ReactNode;
  /** The row's spoken line (`Message from <name>`); `RoomThread` builds it per row. */
  label?: string;
};

/** The pill's height, and how far it stands above the row's top edge. */
const BAR_H = 30;
const BAR_RISE = 14;
/** One button of the pill, one emoji, one menu row. */
const BTN_W = 28;
const EMOJI = 30;
const MENU_ROW = 34;
const MENU_W = 148;
/** The gap between the pill and the emoji row or the menu. */
const POP_GAP = 4;
/** The avatar gutter of someone else's row (`MessageBubble`'s 32px): nothing here sits over it. */
const GUTTER = 32;
/** The widest a row's content gets: `MessageBubble`'s 520px text bubble on this surface. */
const ROW_MAX = 520;

/**
 * Rendered once by the thread in a `<style>` (as the week strip's slide
 * classes are). Colours are CSS variables only, so one string serves Light
 * and Night.
 *
 * `vibe-hover-list` goes on the thread's column of rows: a size container,
 * so `100cqw` in the pill's position is the thread's width.
 *
 * "Focus within" is keyboard focus: the row's own `:focus-visible`, a
 * button of the pill, or anything inside the row that shows a focus ring
 * (`:has`, in a rule of its own so a browser without it keeps the rest).
 * A plain `:focus-within` on the row would also hold after every mouse
 * click on a message (the row is focusable), leaving a pill up on each row
 * that was clicked.
 */
export const HOVER_ACTIONS_CSS = `
.vibe-hover-list { container-type: inline-size; }
.vibe-hover-row { outline: none; border-radius: 12px; }
.vibe-hover-row:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-hover-bar { opacity: 0; pointer-events: none; transition: opacity 120ms ease 150ms, pointer-events 0s linear 150ms; transition-behavior: allow-discrete; }
.vibe-hover-row:hover > .vibe-hover-bar,
.vibe-hover-row:focus-visible > .vibe-hover-bar,
.vibe-hover-row[data-open] > .vibe-hover-bar,
.vibe-hover-bar:focus-within { opacity: 1; pointer-events: auto; transition-delay: 0s; }
.vibe-hover-row:has(:focus-visible) > .vibe-hover-bar { opacity: 1; pointer-events: auto; transition-delay: 0s; }
.vibe-hover-btn { background: transparent; }
.vibe-hover-btn:hover, .vibe-hover-btn[aria-expanded="true"] { background: rgba(var(--scrim-rgb), 0.08); }
.vibe-hover-btn:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .vibe-hover-bar { transition-duration: 0s; } }
`;

/** The emoji row or the menu, and the side of the pill it opened on. */
type OpenLayer = { kind: "react" | "more"; below: boolean };

/** A mouse press on a button must not take focus (the click still fires). */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function ReactIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v3" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** The nearest scrolling ancestor's top edge (the thread's box): what clips a layer that opens upward. */
function scrollerTop(row: HTMLElement): number {
  let list = row.parentElement;
  while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) list = list.parentElement;
  return list ? list.getBoundingClientRect().top : 0;
}

export function HoverActions({ night, isMine, onReact, onReply, onReport, onRemove, children, label }: HoverActionsProps) {
  const t = palette(night);
  const [open, setOpen] = useState<OpenLayer | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const reactRef = useRef<HTMLButtonElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  const hasMore = !!onReport || !!onRemove;
  const count = (onReact ? 1 : 0) + (onReply ? 1 : 0) + (hasMore ? 1 : 0);
  // A layer whose button is gone (the row lost its handlers under it) is not open.
  const layer = open && (open.kind === "react" ? !!onReact : hasMore) ? open : null;
  const kind = layer?.kind ?? null;

  // While the emoji row or the menu is open. Focus goes in when it was opened
  // by keyboard (its button holds focus; a mouse press never gives it any).
  // Esc closes it from wherever focus is, before anything else hears the key
  // (capture on the document), and a press outside the toolbar closes it.
  useEffect(() => {
    if (!kind) return;
    const opener = (kind === "react" ? reactRef : moreRef).current;
    if (opener && document.activeElement === opener) popRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (popRef.current?.contains(document.activeElement)) opener?.focus();
      setOpen(null);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target && rowRef.current?.contains(target) && target.closest("[data-hover-group]")) return;
      setOpen(null);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [kind]);

  // No handler: the bare wrapper (the same element, so the bubble keeps its state when the row turns real).
  if (count === 0) return <div style={{ position: "relative" }}>{children}</div>;

  const toggle = (next: OpenLayer["kind"]) => {
    if (kind === next) {
      setOpen(null);
      return;
    }
    // Above the pill, unless the thread's top edge would cut it: then under it.
    const row = rowRef.current;
    const height = next === "react" ? EMOJI + 10 : (onReport ? MENU_ROW : 0) + (onRemove ? MENU_ROW : 0) + 10;
    const below = row ? row.getBoundingClientRect().top - scrollerTop(row) < height + BAR_RISE + POP_GAP : false;
    setOpen({ kind: next, below });
  };
  // A pick or a menu row: focus goes back to the button that opened the layer
  // before the layer leaves (so a dialog that opens next can return it there).
  const leave = (opener: React.RefObject<HTMLButtonElement | null>) => {
    if (popRef.current?.contains(document.activeElement)) opener.current?.focus();
    setOpen(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const row = e.currentTarget;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target === row) {
      // The row itself: Enter or Space moves into the toolbar.
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      barRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    // A key inside the bubble (a vote, a reaction chip, a link) is not ours.
    const group = target?.closest<HTMLElement>("[data-hover-group]");
    if (!group || !row.contains(group)) return;
    if (e.key === "Escape") {
      // No layer is open here (an open one took the key on the document): back to the row.
      e.preventDefault();
      e.stopPropagation();
      setOpen(null);
      row.focus();
      return;
    }
    const column = group.dataset.hoverGroup === "column";
    const step = e.key === (column ? "ArrowDown" : "ArrowRight") ? 1 : e.key === (column ? "ArrowUp" : "ArrowLeft") ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const buttons = Array.from(group.querySelectorAll<HTMLElement>("button"));
    const at = buttons.indexOf(target?.closest("button") as HTMLElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };

  // The outer top corner: just past the row's far edge (12px over it, so the
  // pointer never crosses a gap), pulled back inside the thread when the row
  // reaches the thread's edge. `100cqw` is the thread column's width: the
  // thread marks its column as a size container (`vibe-hover-list`).
  const outer = (width: number): React.CSSProperties => {
    const at = `min(calc(100% - 12px), calc(100cqw - ${width}px))`;
    return isMine ? { right: at } : { left: at };
  };
  const barWidth = count * BTN_W + 8;
  const shell: React.CSSProperties = { position: "absolute", boxSizing: "border-box", border: `1px solid ${t.chipBorder}`, background: t.surface, boxShadow: "var(--card-shadow)", fontFamily: FONT };
  const button: React.CSSProperties = { flexShrink: 0, padding: 0, border: "none", borderRadius: 999, color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", cursor: "pointer" };
  const layerAt: React.CSSProperties = layer?.below ? { top: BAR_H - BAR_RISE + POP_GAP } : { bottom: `calc(100% + ${BAR_RISE + POP_GAP}px)` };

  return (
    <div
      ref={rowRef}
      className="vibe-hover-row"
      role="group"
      aria-label={label ?? `Message from ${authorName(null)}`}
      tabIndex={0}
      data-open={kind ? "" : undefined}
      onKeyDown={onKeyDown}
      // Focus leaving the row (Tab, a click elsewhere) closes an open layer.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(null);
      }}
      // As wide as its row and no wider, so the far edge is the bubble's.
      style={{ position: "relative", alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: `min(100%, ${ROW_MAX + (isMine ? 0 : GUTTER)}px)` }}
    >
      {children}
      <div
        ref={barRef}
        role="toolbar"
        aria-label="Message actions"
        className="vibe-hover-bar"
        data-hover-group="row"
        style={{ ...shell, ...outer(barWidth), top: -BAR_RISE, zIndex: 3, width: barWidth, height: BAR_H, padding: "0 3px", borderRadius: 999, display: "flex", alignItems: "center", color: t.secondary }}
      >
        {onReact ? (
          <button ref={reactRef} type="button" tabIndex={-1} className="vibe-hover-btn" aria-label="React" aria-expanded={kind === "react"} onMouseDown={keepFocus} onClick={() => toggle("react")} style={{ ...button, width: BTN_W, height: 24 }}>
            <ReactIcon />
          </button>
        ) : null}
        {onReply ? (
          <button type="button" tabIndex={-1} className="vibe-hover-btn" aria-label="Reply" onMouseDown={keepFocus} onClick={() => { setOpen(null); onReply(); }} style={{ ...button, width: BTN_W, height: 24 }}>
            <ReplyIcon />
          </button>
        ) : null}
        {hasMore ? (
          <button ref={moreRef} type="button" tabIndex={-1} className="vibe-hover-btn" aria-label="More" aria-haspopup="menu" aria-expanded={kind === "more"} onMouseDown={keepFocus} onClick={() => toggle("more")} style={{ ...button, width: BTN_W, height: 24 }}>
            <MoreIcon />
          </button>
        ) : null}
      </div>
      {kind === "react" && onReact ? (
        <div
          ref={popRef}
          role="group"
          aria-label="React"
          data-hover-group="row"
          style={{ ...shell, ...outer(REACTION_EMOJIS.length * EMOJI + 10), ...layerAt, zIndex: 4, width: REACTION_EMOJIS.length * EMOJI + 10, height: EMOJI + 10, padding: "0 4px", borderRadius: 999, display: "flex", alignItems: "center", color: t.ink }}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              tabIndex={-1}
              className="vibe-hover-btn"
              onMouseDown={keepFocus}
              onClick={() => {
                leave(reactRef);
                onReact(emoji);
              }}
              style={{ ...button, width: EMOJI, height: EMOJI, fontSize: 17, lineHeight: 1 }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {kind === "more" && hasMore ? (
        <div
          ref={popRef}
          role="menu"
          aria-label="More"
          data-hover-group="column"
          style={{ ...shell, ...outer(MENU_W), ...layerAt, zIndex: 4, width: MENU_W, padding: 4, borderRadius: 14, display: "flex", flexDirection: "column", color: t.ink }}
        >
          {onReport ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="vibe-hover-btn"
              onMouseDown={keepFocus}
              onClick={() => {
                leave(moreRef);
                onReport();
              }}
              style={{ ...button, justifyContent: "flex-start", height: MENU_ROW, padding: "0 10px", borderRadius: 10, fontSize: 13.5, fontWeight: 600 }}
            >
              Report
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="vibe-hover-btn"
              onMouseDown={keepFocus}
              onClick={() => {
                leave(moreRef);
                onRemove();
              }}
              style={{ ...button, justifyContent: "flex-start", height: MENU_ROW, padding: "0 10px", borderRadius: 10, fontSize: 13.5, fontWeight: 600 }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
