"use client";

import { springLinear, springProgress } from "@/lib/motion/spring-curve";
import { SPRING_SNAPPY } from "@/lib/motion/springs";

/**
 * The app's tab marker glides to the tab you pick (motion 1, Nov 12, 2026;
 * Franky: "when clicking from tab to tab it glides / slides / smoothens over
 * to the next thing"). One marker per nav: the computer's left menu pill
 * (LeftNav) and the phone tab bar's coral line (MobileTabBar).
 *
 * Every page draws its own nav, so the nav on screen after a tap is a new
 * element. The glide is kept here, outside React, by `key`: where the marker
 * last sat and where a glide in flight started, so the new nav carries on
 * the glide the old one began on the tap instead of jumping. The marker is
 * drawn inside the active item (right with no script, and on the server);
 * a glide starts it over the item it left and lets it travel home, with a
 * transform only, on SPRING_SNAPPY. Reduce motion: no glide at all; the
 * active item's weight and colour carry the state.
 */

/** SPRING_SNAPPY has settled by then. */
const GLIDE_MS = 320;
const GLIDE_EASE = springLinear(SPRING_SNAPPY, GLIDE_MS);

type Glide = { from: number; to: number; at: number };
const glides = new Map<string, Glide>();

export type GlideTarget = {
  /** The active item: its offset in the nav is the marker's place. */
  slot: HTMLElement;
  /** What moves: the marker element, or `slot` with `pseudoElement`. */
  mark: HTMLElement;
  pseudoElement?: string;
  /** The mark's own resting transform (e.g. a centring translateX(-50%)). */
  rest?: string;
};

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function easing(): string {
  try {
    if (CSS.supports("animation-timing-function", "linear(0, 1)")) return GLIDE_EASE;
  } catch {
    /* an old browser: the plain curve below */
  }
  return "cubic-bezier(0.22, 1, 0.36, 1)";
}

/**
 * Call from a layout effect whenever the active item changes, and on mount
 * (`target` null: nothing is lit, so the next marker appears in place).
 */
export function glideMarker(key: string, axis: "x" | "y", target: GlideTarget | null): void {
  if (!target) {
    glides.delete(key);
    return;
  }
  const { slot, mark, pseudoElement, rest = "" } = target;
  const to = axis === "x" ? slot.offsetLeft : slot.offsetTop;
  const now = performance.now();
  const was = glides.get(key);
  if (!was || reducedMotion()) {
    glides.set(key, { from: to, to, at: now - GLIDE_MS });
    return;
  }
  const elapsed = now - was.at;
  const moving = elapsed < GLIDE_MS && was.from !== was.to;
  let from: number;
  let resumeAt = 0;
  if (was.to === to) {
    // The same place: a new nav mid-glide carries on; a settled one stays.
    if (!moving) return;
    from = was.from;
    resumeAt = elapsed;
  } else {
    // Retargeted: from wherever the marker is now.
    from = moving
      ? was.from + (was.to - was.from) * springProgress(SPRING_SNAPPY, elapsed / 1000)
      : was.to;
    glides.set(key, { from, to, at: now });
  }
  const d = Math.round(from - to);
  if (Math.abs(d) < 1) return;
  const fn = axis === "x" ? "translateX" : "translateY";
  try {
    const run = mark.animate(
      [{ transform: `${rest} ${fn}(${d}px)`.trim() }, { transform: `${rest} ${fn}(0px)`.trim() }],
      { duration: GLIDE_MS, easing: easing(), pseudoElement },
    );
    if (resumeAt) run.currentTime = resumeAt;
  } catch {
    /* no Web Animations: the marker simply sits in its new place */
  }
}
