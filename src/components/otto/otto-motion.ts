"use client";

import { useLayoutEffect, useRef } from "react";

import { springLinear, type SpringSpec } from "@/lib/motion/spring-curve";
import { RISE_PX, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

/**
 * Otto's moves (motion 1, Nov 12, 2026; Franky: "when clicking from tab to
 * tab it glides / slides / smoothens over to the next thing … and same for
 * when opening and closing otto"). Transform and opacity only, on the app's
 * springs, sampled into CSS `linear()` (spring-curve.ts) and run by the
 * browser (Web Animations, no fill): when a move ends the part keeps no
 * transform or opacity of its own, so nothing boxes in the fixed sheets
 * inside it (Look, the club pickers). With reduce motion on nothing moves;
 * the selected tab's words carry the state.
 */

/** The device asks for less motion (read at the moment of the move, so a change applies at once). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** How long each spring runs here: the tab pill, things arriving, Planet's bounce. */
const RUN_MS = { snappy: 320, soft: 380, pop: 600 } as const;
const SPRINGS: Record<keyof typeof RUN_MS, SpringSpec> = { snappy: SPRING_SNAPPY, soft: SPRING_SOFT, pop: SPRING_POP };
type SpringName = keyof typeof RUN_MS;

function run(el: HTMLElement, frames: Keyframe[], spring: SpringName): void {
  if (prefersReducedMotion() || typeof el.animate !== "function") return;
  let easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  try {
    if (CSS.supports("animation-timing-function", "linear(0, 1)")) easing = springLinear(SPRINGS[spring], RUN_MS[spring]);
  } catch {
    /* no CSS.supports: the plain curve */
  }
  el.animate(frames, { duration: RUN_MS[spring], easing });
}

/**
 * The selected tab's pill glides from the tab it left. The pill is drawn
 * inside the selected tab (`ref` on it), so the page is right with no
 * script; on a change the new pill starts over the old tab (translateX +
 * scaleX, from the tabs' layout boxes, which no transform skews) and
 * springs home on SPRING_SNAPPY. `key` is the selected tab.
 */
export function usePillGlide<T extends HTMLElement = HTMLSpanElement>(key: string) {
  const pill = useRef<T | null>(null);
  const last = useRef<{ key: string; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = pill.current;
    const tab = el?.parentElement;
    if (!el || !tab || !tab.offsetWidth) return;
    const now = { key, left: tab.offsetLeft, width: tab.offsetWidth };
    const was = last.current;
    last.current = now;
    if (!was || was.key === key) return;
    const dx = was.left - now.left;
    const sx = was.width / now.width;
    if (Math.abs(dx) < 1 && Math.abs(sx - 1) < 0.01) return;
    run(el, [{ transform: `translateX(${dx}px) scaleX(${sx})` }, { transform: "none" }], "snappy");
  }, [key]);
  return pill;
}

/** Which way a tab move goes: 1 to the right, -1 to the left, 0 when it doesn't move. */
export function travel<T>(order: readonly T[], from: T, to: T): -1 | 0 | 1 {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  return a < 0 || b < 0 || a === b ? 0 : b > a ? 1 : -1;
}

/**
 * New tab content arrives: it fades in and slides 8px (RISE_PX) from the
 * side it travels from (`dir` 1: from the right), on SPRING_SOFT. Call it
 * right after the new content is in the DOM (a layout effect), so its first
 * frame is already the start.
 */
export function arriveFrom(el: HTMLElement | null, dir: -1 | 0 | 1): void {
  if (!el) return;
  moveFrom(el, dir === 0 ? { y: RISE_PX, opacity: 0 } : { x: dir * RISE_PX, opacity: 0 });
}

/**
 * A part springs home from where it was drawn a moment ago (a FLIP): it
 * starts `x`/`y` px away (and at `opacity`, when given) and settles on
 * SPRING_SOFT.
 */
export function moveFrom(el: HTMLElement, from: { x?: number; y?: number; opacity?: number }): void {
  const start: Keyframe = { transform: `translate(${from.x ?? 0}px, ${from.y ?? 0}px)` };
  const end: Keyframe = { transform: "none" };
  if (from.opacity !== undefined) {
    start.opacity = from.opacity;
    end.opacity = 1;
  }
  run(el, [start, end], "soft");
}

/**
 * A part springs back to its size from `scale`: Planet's happy bounce when
 * the panel opens (from a touch small, on SPRING_POP: one small overshoot)
 * and his settle when it closes (SPRING_SOFT).
 */
export function scaleFrom(el: HTMLElement | null, scale: number, spring: "pop" | "soft" = "pop"): void {
  if (!el) return;
  run(el, [{ transform: `scale(${scale})` }, { transform: "none" }], spring);
}
