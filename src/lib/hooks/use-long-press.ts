"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type React from "react";

/**
 * A finger held on something (wave 2, WAVE2-DESIGN.md C4): the chat bubble's
 * gesture (MessageBubble.tsx), lifted out so the Profile tab can use it too.
 *
 *   - 500 ms, iOS's own long-press. At 360 ms a thumb resting on a bubble
 *     while reading was enough to fire it.
 *   - Only the first finger's primary press arms it; a second finger (a
 *     pinch) cancels one that's pending.
 *   - A drift of more than 10 px is a scroll, not a hold; lifting the finger,
 *     leaving the element or the browser taking the touch cancels it too.
 *   - A short buzz where the phone has one.
 *   - The browser's own long-press menu is suppressed (pair it with
 *     `-webkit-touch-callout: none` on the element for iOS's link preview),
 *     and the click that ends a hold is swallowed, so a held link doesn't
 *     also navigate.
 *
 * Spread the returned handlers on the element. `enabled: false` returns none.
 */

export const LONG_PRESS_MS = 500;
/** Squared: 10 px. */
const DRIFT_SQ = 100;

export type LongPressHandlers = {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onPointerLeave?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
};

export function useLongPress(
  onLongPress: () => void,
  opts: {
    enabled?: boolean;
    ms?: number;
    /** Asked when the timer ends (`pressedAt` is performance.now() at the press); false skips the hold. */
    shouldFire?: (pressedAt: number) => boolean;
  } = {},
): LongPressHandlers {
  const { enabled = true, ms = LONG_PRESS_MS } = opts;
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // The latest callbacks, so the handlers below never go stale.
  const latest = useRef({ onLongPress, shouldFire: opts.shouldFire });
  useEffect(() => {
    latest.current = { onLongPress, shouldFire: opts.shouldFire };
  });

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return useMemo<LongPressHandlers>(() => {
    if (!enabled) return {};
    return {
      onPointerDown: (e) => {
        if (!e.isPrimary || e.button !== 0) {
          clear();
          return;
        }
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        const pressedAt = performance.now();
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          start.current = null;
          const { onLongPress: fire, shouldFire } = latest.current;
          if (shouldFire && !shouldFire(pressedAt)) return;
          fired.current = true;
          try {
            navigator.vibrate?.(8);
          } catch {
            // Unsupported.
          }
          fire();
        }, ms);
      },
      onPointerMove: (e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (dx * dx + dy * dy > DRIFT_SQ) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e) => {
        // Mobile Safari and Chrome open their own menu on a long-press; we own the gesture.
        e.preventDefault();
      },
      onClickCapture: (e) => {
        if (!fired.current) return;
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    };
  }, [enabled, ms, clear]);
}
