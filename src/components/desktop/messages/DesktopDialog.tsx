"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useNightTheme } from "@/components/mobile/messages/theme";
import { FONT, palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import { useLayerHistory } from "@/lib/chat/use-layer-history";

import type { DesktopDialogProps, DesktopPopoverProps } from "./contracts";

/**
 * The two layers of desktop Messages (wave-3 contract 6.1): what the phone's
 * bottom sheets become on a laptop. `DesktopDialog` is modal (a scrim, a
 * centred card); `DesktopPopover` is not (a box under the control that
 * opened it, no scrim).
 *
 * Shared rules:
 * - Both are portalled to `<body>` (as `LeftNav`'s dialogs are): a
 *   `position: fixed` box inside a pane that slides in with a transform would
 *   be placed against that pane, not the window. The theme tokens are on
 *   `<html>`; the font and the ink are set on the box itself.
 * - One history entry each (`useLayerHistory`, the phone's stack): Back
 *   closes the layer and nothing else. A caller that already holds an entry
 *   for its dialog (`CardSheet`, `RsvpSheet`) passes `ownsHistory={false}`,
 *   so one dialog is never two Back steps.
 * - Both STOP the Esc they handle (`stopPropagation`), so the shell's own
 *   Esc rule (3.5 rule 9: a bubble-phase `keydown` on the window) never also
 *   closes the chat under the layer. React hands a key pressed in a layer
 *   opened from another layer (a popover inside a dialog) to the inner one
 *   first, and the inner one stops it. A child with its own use for Esc (a
 *   search field that clears first) stops it the same way; an Esc that
 *   reaches the layer closes it.
 * - Focus can fall to `<body>` under a layer (the focused row was removed).
 *   Then no `onKeyDown` of the layer hears the key, so each layer also
 *   listens on the document for keys whose target is the body, and only the
 *   TOP layer answers (`layers`, below).
 * - Colours: `palette(night)` and CSS variables only; the one literal form
 *   is `rgba(var(--scrim-rgb), a)` (3.2, the calm rules). That variable is
 *   the INK tint (near-black in Light, white in Night): right for the Close
 *   button's wash, wrong for a scrim, which would be a white haze in Night.
 *   The dialog's scrim is the palette's `t.scrim`, as the phone sheets' is.
 *
 * z-index: the dialog 1200 (the phone sheets' own level, `sheet-styles.ts`),
 * the popover 1210 (it may open from inside a dialog). Both are under the
 * report sheet (10400) and the toasts (12000).
 */

/** The desktop layers on screen, bottom to top. Module level: a layer has to know whether another one is above it. */
const layers: symbol[] = [];

/** True while a `DesktopDialog` or a `DesktopPopover` is on screen (the shell's Esc rule may ask instead of trusting the event). */
export function desktopLayerOpen(): boolean {
  return layers.length > 0;
}

const DIALOG_Z = 1200;
const POPOVER_Z = 1210;
/** The popover's distance from its anchor, and the least distance of either layer from the window's edge. */
const GAP = 8;
const EDGE = 8;

const LAYER_CSS = `
@keyframes vibe-desk-layer-in { from { opacity: 0; } to { opacity: 1; } }
.vibe-desk-layer { animation: vibe-desk-layer-in 140ms ease-out; }
.vibe-desk-close { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-desk-close:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.1); }
@media (prefers-reduced-motion: reduce) { .vibe-desk-layer { animation: none; } }
`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * The Tab stops inside `box`, in document order: nothing that is not drawn,
 * and nothing Tab skips. A button with `tabIndex={-1}` (a roving list, a
 * toolbar's arrow-key items) matches the selector by its tag but is not a
 * stop: counted as the last one, the dialog's trap would never see Tab leave
 * the real last stop.
 */
function focusables(box: HTMLElement | null): HTMLElement[] {
  if (!box) return [];
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
}

/**
 * True when Tab (`back`: Shift+Tab) from `active` has no stop of `stops`
 * left to go to: focus is on the last (first) stop, on the box itself going
 * back, or on something Tab skips (an arrow-key item with `tabIndex={-1}`)
 * that sits after (before) every stop.
 */
function pastEdge(stops: HTMLElement[], active: Element, back: boolean): boolean {
  const way = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  return !stops.some((el) => el !== active && (active.compareDocumentPosition(el) & way) !== 0);
}

/** Where a dialog's focus starts: the first stop of its body or footer, else its Close button, else the card itself. */
function firstStop(card: HTMLElement | null, closeButton: HTMLElement | null): HTMLElement | null {
  return focusables(card).find((el) => el !== closeButton) ?? closeButton ?? card;
}

/** The element that has focus now; null for none, for `<body>` and on the server. */
function focusedNow(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

/**
 * Registers one layer while its component is mounted and answers
 * `isTop()`. `onStrayKey` gets the keys pressed while focus is nowhere (the
 * event's target is `<body>` or `<html>`), and only while this layer is the
 * top one: a key pressed inside a layer goes to that layer's own
 * `onKeyDown`, a key pressed in some other element is not this file's.
 */
function useDesktopLayer(onStrayKey: (e: KeyboardEvent) => void): () => boolean {
  const [id] = useState(() => Symbol("desktop-layer"));
  // The latest callback, so an inline arrow never re-registers the layer.
  const onStrayKeyRef = useRef(onStrayKey);
  useEffect(() => {
    onStrayKeyRef.current = onStrayKey;
  }, [onStrayKey]);
  useEffect(() => {
    layers.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      if (e.target !== document.body && e.target !== document.documentElement) return;
      onStrayKeyRef.current(e);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = layers.indexOf(id);
      if (at >= 0) layers.splice(at, 1);
    };
  }, [id]);
  return () => layers[layers.length - 1] === id;
}

/**
 * The modal dialog (6.1): a fixed scrim and a centred card, `width` wide
 * (440 by default) and at most 86vh tall; the title in the serif, a 32px
 * Close button, the children in a scrolling body (padded 20px at the sides
 * and the bottom: a full-width row list takes `margin: "0 -20px"`), and
 * `footer`, when given, in a row under a hairline, its buttons to the right.
 *
 * - `role="dialog"`, `aria-modal`, named by `title`.
 * - Focus moves in on open: to a child that took it itself (`autoFocus`),
 *   else the first Tab stop of the body or the footer, else Close. It
 *   returns on close to the element that had it before (the control that
 *   opened the dialog), read after the layers closing in the same commit
 *   have handed focus back: the "+" tray's popover returns it to the "+"
 *   before the card dialog it opened asks.
 * - Tab is trapped: past the last stop it goes to the first, and back. A
 *   control Tab skips (`tabIndex={-1}`) is never a stop (`focusables`).
 * - Esc, a press on the scrim and Close call `onClose`, unless `busy` (a
 *   write is out). Back does the same (`useLayerHistory`); while `busy` it
 *   is answered by a step forward, as the phone's card sheets do.
 */
export function DesktopDialog({ title, onClose, width = 440, busy = false, ownsHistory, children, footer }: DesktopDialogProps) {
  const t = palette(useNightTheme());
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Where the press that ends in a click began: a text selection dragged out of the card onto the scrim is not a press on the scrim.
  const pressedScrimRef = useRef(false);
  // What had focus at the first render (a child's `autoFocus` runs before any effect of this file).
  const [focusedBefore] = useState(focusedNow);

  const close = () => {
    if (!busy) onClose();
  };

  useLayerHistory(ownsHistory !== false, onClose, () => !busy);
  const isTop = useDesktopLayer((e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      // Focus was lost to the body: Tab comes back into the dialog, never to the page under the scrim.
      e.preventDefault();
      firstStop(cardRef.current, closeRef.current)?.focus();
    }
  });

  useEffect(() => {
    const card = cardRef.current;
    const active = focusedNow();
    const inside = !!card && !!active && card.contains(active);
    const returnTo = inside || !active ? focusedBefore : active;
    if (!inside) firstStop(card, closeRef.current)?.focus({ preventScroll: true });
    return () => {
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [focusedBefore]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    // A Tab inside a popover opened from this dialog reaches here too (React hands it up the tree): it is the popover's.
    const active = document.activeElement;
    if (!active || !cardRef.current?.contains(active)) return;
    const stops = focusables(cardRef.current);
    if (stops.length === 0) {
      e.preventDefault();
      cardRef.current.focus();
      return;
    }
    if (!pastEdge(stops, active, e.shiftKey)) return;
    e.preventDefault();
    (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="presentation"
      className="vibe-desk-layer"
      onPointerDown={(e) => {
        // Only the top layer's scrim: the press that closes a popover over this dialog does not also close the dialog.
        pressedScrimRef.current = e.target === e.currentTarget && isTop();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedScrimRef.current) close();
        pressedScrimRef.current = false;
      }}
      style={{ position: "fixed", inset: 0, zIndex: DIALOG_Z, boxSizing: "border-box", padding: 24, background: t.scrim, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <style>{LAYER_CSS}</style>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ width: "100%", maxWidth: width, maxHeight: "86vh", boxSizing: "border-box", borderRadius: 20, border: `1px solid ${t.fieldBorder}`, background: t.surface, boxShadow: "var(--card-shadow)", color: t.ink, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden", outline: "none" }}
      >
        <div style={{ flexShrink: 0, boxSizing: "border-box", padding: "14px 14px 10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, marginRight: "auto", minWidth: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: "24px", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="vibe-desk-close"
            aria-label="Close"
            aria-disabled={busy || undefined}
            onClick={close}
            style={{ width: 32, height: 32, flexShrink: 0, padding: 0, border: "none", borderRadius: 999, color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.4 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, boxSizing: "border-box", padding: "0 20px 20px", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain" }}>{children}</div>
        {footer ? <div style={{ flexShrink: 0, boxSizing: "border-box", padding: "12px 20px", borderTop: `1px solid ${t.hairline}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The popover (6.1): a box `width` wide (336 by default) under `anchor`,
 * its start edges in line (`align="end"`: its end edges), kept inside the
 * window; no scrim, not modal. With no room under the anchor and room above
 * (the "+" of a composer at the foot of the window) it opens above. With no
 * anchor it sits in the middle of the window.
 *
 * - The box is a flex column that scrolls when it is taller than the window:
 *   children stack and stretch (`MonthBody`'s plan rows need that).
 * - `role="dialog"`, named by `label`.
 * - It closes (`onClose`) on Esc, on a press outside it, when the window
 *   loses focus (focus went into the dm frame, where the shell hears no
 *   press and no key; map 04 5.7), on Back, and on a Tab past its last stop
 *   or back past its first: it is portalled to the end of `<body>`, so the
 *   stop after it is not the one after its anchor. A press on the anchor
 *   itself is the anchor's business (its own click closes or keeps it).
 * - Focus moves INTO it on open: its first Tab stop, else the box. It goes
 *   back to `anchor` when the popover leaves the screen, whatever closed it
 *   (the caller's own close too: a row of the "+" tray that opens a dialog).
 *   ONE case is left alone: the window lost focus because the person pressed
 *   inside the dm frame. Focus is in the frame, where they put it; taking
 *   it back to the anchor would send their typing to a button.
 */
export function DesktopPopover({ anchor, label, onClose, width = 336, align = "start", children }: DesktopPopoverProps) {
  const t = palette(useNightTheme());
  const boxRef = useRef<HTMLDivElement | null>(null);
  // The latest callback for the document's and the window's listeners.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayerHistory(true, onClose);
  useDesktopLayer((e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      // Focus was lost to the body: Tab comes back into the popover.
      e.preventDefault();
      const box = boxRef.current;
      (focusables(box)[0] ?? box)?.focus();
    }
  });

  // Where it sits. Written to the node, not to state: it is measured after
  // every change of its own size (the month's picked day has more or fewer
  // plans), of the window, and of any scroll that moves the anchor.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const place = () => {
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
      let left = (window.innerWidth - w) / 2;
      let top = (window.innerHeight - h) / 2;
      if (rect) {
        left = align === "end" ? rect.right - w : rect.left;
        top = rect.bottom + GAP;
        if (top + h > window.innerHeight - EDGE && rect.top - GAP - h >= EDGE) top = rect.top - GAP - h;
      }
      box.style.left = `${Math.round(Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE)))}px`;
      box.style.top = `${Math.round(Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE)))}px`;
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(box);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, align]);

  // Focus in on open; back to the anchor when the popover leaves the screen.
  useEffect(() => {
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) (focusables(box)[0] ?? box).focus({ preventScroll: true });
    return () => {
      // The window's blur with focus now in a frame: the person is in the dm thread (see the header).
      if (document.activeElement instanceof HTMLIFrameElement) return;
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);

  // A press outside, and the window's blur.
  useEffect(() => {
    const onPress = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (boxRef.current?.contains(target) || anchor?.contains(target)) return;
      onCloseRef.current();
    };
    const onBlur = (e: FocusEvent) => {
      if (e.target === window) onCloseRef.current();
    };
    document.addEventListener("pointerdown", onPress, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [anchor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    // A Tab inside a dialog opened from this popover is the dialog's.
    const active = document.activeElement;
    if (!active || !boxRef.current?.contains(active)) return;
    if (!pastEdge(focusables(boxRef.current), active, e.shiftKey)) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="vibe-desk-layer"
      onKeyDown={onKeyDown}
      style={{ position: "fixed", zIndex: POPOVER_Z, width, maxWidth: `calc(100vw - ${2 * EDGE}px)`, maxHeight: `calc(100vh - ${2 * EDGE}px)`, boxSizing: "border-box", overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column", borderRadius: 20, border: `1px solid ${t.fieldBorder}`, background: t.surface, boxShadow: "var(--card-shadow)", color: t.ink, fontFamily: FONT, outline: "none" }}
    >
      <style>{LAYER_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}
