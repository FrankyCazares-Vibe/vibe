"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { RISE_PX, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import { RepostersBody, useReposters } from "./reposters-list";

/**
 * "Reposted by" on desktop (Oct 19, 2026, decision 1a): a small pop-up under
 * the feed's repost line (wired in batch B1), the phone sheet's twin. It
 * names the people you follow and says everyone else as a number; the list
 * itself is reposters-list.tsx, shared with the sheet.
 *
 * Contract for B1: `<RepostersPopover postId open onClose anchor />`, where
 * `anchor` is the element that opened it (the repost line).
 *
 * Not modal: no scrim, the feed stays usable. It closes on Esc, on a press
 * outside it (a press on the anchor is the anchor's own business, so its
 * click can toggle), when Tab walks off either end, when focus goes to
 * something outside, and when its line scrolls out of sight (as Instagram
 * and X do: pinned to the window's edge, it floated over other posts).
 * Portalled to <body> so a card's transform or overflow can't clip or
 * misplace it; placed under the anchor, above it when there's no room below,
 * never past the window's edge. Theme tokens only; it rises in on the app's
 * soft spring (src/lib/motion), which MotionRoot turns into a plain fade
 * under reduced motion.
 *
 * Focus (review of B2, Oct 19, 2026). It moves in on open. It goes back to
 * the line only after a keyboard close (Esc, or Shift+Tab off the top) or
 * when B1 closes it while focus is inside; Tab off the bottom goes on to the
 * stop after the line, as if the box sat right after it in the page (it is
 * portalled to the end, so a plain Tab would land at the bottom of the app).
 * A press outside, a scroll-away, or focus leaving for a real element never
 * moves focus: a press on bare page (or, in Safari, on any button) leaves
 * focus on <body>, and pulling it back to the line made the next Space, which
 * scrolls the feed, open the list again.
 */

const WIDTH = 320;
const GAP = 8;
const EDGE = 12;

/** What Tab stops on (DesktopDialog's list, which isn't exported). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** A real Tab stop: drawn, and not one Tab skips (tabIndex -1). */
const isStop = (el: HTMLElement) => el.tabIndex >= 0 && el.getClientRects().length > 0;

/** True when Tab (`back`: Shift+Tab) from `active` has no stop of `stops` left in that direction. */
function pastEdge(stops: HTMLElement[], active: Element, back: boolean): boolean {
  const way = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  return !stops.some((el) => el !== active && (active.compareDocumentPosition(el) & way) !== 0);
}

/** The first Tab stop after `anchor` in the page, outside it and the box: where Tab goes next from the line. */
function stopAfter(anchor: HTMLElement, box: HTMLElement): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (anchor.contains(el) || box.contains(el)) continue;
    if (!(anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (isStop(el)) return el;
  }
  return null;
}

export function RepostersPopover({
  postId,
  open,
  onClose,
  anchor,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>{open ? <Panel key={postId} postId={postId} onClose={onClose} anchor={anchor} /> : null}</AnimatePresence>,
    document.body,
  );
}

function Panel({ postId, onClose, anchor }: { postId: string; onClose: () => void; anchor: HTMLElement | null }) {
  const { state, retry } = useReposters(postId, true);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const isPresent = useIsPresent();
  // False from the moment it starts to leave: during the exit nothing it
  // hears is its business (an Esc then belongs to whatever is under it).
  const presentRef = useRef(true);
  // Set by each close this box makes itself, once it has put focus where
  // that close wants it (or chosen to leave it alone).
  const settledRef = useRef(false);
  // True while this box moves focus itself, so its own onBlur doesn't read
  // that as Tab leaving.
  const movingRef = useRef(false);
  // The latest onClose for the listeners, so an inline arrow never re-binds them.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** Close, putting focus on `focusTo` first (null: leave focus where it is). */
  const close = useCallback((focusTo: HTMLElement | null, preventScroll = true) => {
    if (!presentRef.current || settledRef.current) return;
    settledRef.current = true;
    if (focusTo?.isConnected) {
      movingRef.current = true;
      focusTo.focus({ preventScroll });
      movingRef.current = false;
    }
    onCloseRef.current();
  }, []);

  // Leaving, or back again (B1 reopened it mid-exit). Closed from outside
  // (B1 toggling the line, or closing it for its own reasons) with focus
  // still inside: back to the line, as a keyboard close would.
  useLayoutEffect(() => {
    presentRef.current = isPresent;
    if (isPresent) {
      settledRef.current = false;
      return;
    }
    if (settledRef.current) return;
    settledRef.current = true;
    const active = document.activeElement;
    if (active && boxRef.current?.contains(active) && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }, [isPresent, anchor]);

  // Where it sits, written to the node and measured again whenever its own
  // height changes (the list arriving), the window resizes or anything scrolls.
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
        left = rect.left;
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
  }, [anchor]);

  // The line scrolled out of sight: close (Oct 19, 2026, review of B2).
  // IntersectionObserver also sees the line leave an inner scrolling box,
  // which a check against the window alone would miss.
  useEffect(() => {
    if (!anchor?.isConnected || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1]?.isIntersecting === false) close(null);
    });
    io.observe(anchor);
    return () => io.disconnect();
  }, [anchor, close]);

  // Focus in on open.
  useEffect(() => {
    boxRef.current?.focus({ preventScroll: true });
  }, []);

  // Esc from anywhere (focus can sit on <body>), and a press outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || !presentRef.current) return;
      // Heard on the window in the capture phase, before any listener on the
      // document (the desktop post modals, DesktopDialog, Radix) or the page,
      // and stopped whole, so one Esc closes this box and nothing under it.
      // Only window-capture listeners added earlier still hear it (the
      // Messages shell's, which just notes whether a layer is up). A plain
      // stopPropagation on the document, as before Oct 19, 2026, didn't stop
      // the other listeners on the document itself.
      e.stopImmediatePropagation();
      close(anchor);
    };
    const onPress = (e: PointerEvent) => {
      if (!presentRef.current) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (boxRef.current?.contains(target) || anchor?.contains(target)) return;
      close(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [anchor, close]);

  // Tab off either end: Shift+Tab back to the line, Tab on to the stop after it.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (e.key !== "Tab" || !box || !anchor?.isConnected || !presentRef.current) return;
    const stops = stopsIn(box);
    const active = document.activeElement;
    const back = e.shiftKey;
    const edge = !active || active === box ? back || stops.length === 0 : pastEdge(stops, active, back);
    if (!edge) return;
    e.preventDefault();
    if (back) close(anchor);
    else close(stopAfter(anchor, box) ?? anchor, false);
  };

  return (
    <motion.div
      ref={boxRef}
      role="dialog"
      aria-label="Reposted by"
      tabIndex={-1}
      initial={{ opacity: 0, y: -RISE_PX / 2 }}
      animate={{ opacity: 1, y: 0 }}
      // It arrives on the soft spring and leaves on the snappy one: a close
      // is a tap's answer, and the feed under it shouldn't wait.
      exit={{ opacity: 0, y: -RISE_PX / 2, transition: SPRING_SNAPPY }}
      transition={SPRING_SOFT}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Focus went to a real element outside (a click on a field or a
        // button that takes focus). A null target is the window losing
        // focus, e.g. the unfollow confirm: stay open.
        if (movingRef.current) return;
        const next = e.relatedTarget;
        if (next instanceof Node && !boxRef.current?.contains(next) && !anchor?.contains(next)) close(null);
      }}
      // Leaving, it lets presses through to what's under it.
      style={isPresent ? boxStyle : { ...boxStyle, pointerEvents: "none" }}
    >
      <div style={headStyle}>
        <h2 style={titleStyle}>Reposted by</h2>
      </div>
      <div style={bodyStyle}>
        <RepostersBody state={state} onRetry={retry} />
      </div>
    </motion.div>
  );
}

/** The box's own Tab stops, in page order. */
function stopsIn(box: HTMLElement): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isStop);
}

const boxStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  zIndex: 1210,
  width: WIDTH,
  maxWidth: `calc(100vw - ${2 * EDGE}px)`,
  maxHeight: "min(440px, calc(100vh - 24px))",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  borderRadius: 18,
  border: "1px solid var(--hairline)",
  background: "var(--paper)",
  color: "var(--charcoal)",
  boxShadow: "0 18px 48px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.08)",
  outline: "none",
  overflow: "hidden",
};
const headStyle: React.CSSProperties = { flexShrink: 0, padding: "14px 16px 4px" };
const titleStyle: React.CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, color: "var(--charcoal)" };
const bodyStyle: React.CSSProperties = { minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "0 8px 10px" };
