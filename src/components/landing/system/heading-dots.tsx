"use client";

import { useEffect, useRef } from "react";
import { FALL } from "./coral-drop";

/**
 * Headings that turn into the next (Nov 24, 2026, Franky: "as you scroll, the wording, since it's dotted at the bottom,
 * it like transforms into the next slide… into the next heading"). Picked from four prototypes by three judges:
 * campaigns/2026-11-landing-revamp/heading-dots/DECISION.md in vibe-marketing (A, condense and dissolve).
 *
 * Each headline forms out of the halftone as it rises into the screen, and goes back to dust as it leaves the top, in
 * the same beat the coral full stop takes off from it: the words you just read turn to star dust while the next ones
 * condense out of it, and the full stop falls between them. The halftone is today's (system.css), dot for dot, on a
 * taller tile; the line where the letters stop being solid (--fys-line) moves in whole steps of the dots' repeat, so
 * the dots never slide, they only grow or shrink in place. At rest the hero and "made of your people." keep their
 * dotted foot (.fys-dotted) and every other headline is solid.
 *
 * Where the browser ties animations to the scroll and has round() (Chrome 125+, Safari 26+), the CSS runs it on each
 * line's own view timeline (data-condense="css") and this component only switches it on. Elsewhere (Firefox, older
 * Safari) it writes --fys-line itself from the scroll (data-condense="raf"): measured on resize, fonts and CoralDrop's
 * fys-measure, never per frame, and written only when a line's step changes. With reduced motion, or without
 * JavaScript, nothing is set and every headline looks as it does today. Starfield, the collapse and "vibe." are
 * untouched; the wordmark never dissolves.
 */

/** Where each line rests (in em, from where today's dotted foot starts): solid from 7 steps; the dotted headlines at
 *  0. Dust is 11 steps above, where every letter is the finest dots. One step is two rows of the halftone. */
const HOLD = 0.546, DUST = -0.858, STEP = 0.078;
/** Shares of a line's trip across the screen (its padded top entering at the bottom = 0, its padded bottom leaving at
 *  the top = 1), the same as system.css's fys-condense keyframes. On an 844 px screen it condenses between its top at
 *  97% and 89% of the screen's height (done before the drop falls back into view), and breaks between 8% (where the
 *  drop takes off: LAND_AT 0.42 less REST 0.34) and just above the top. */
const IN0 = 0.03, IN1 = 0.1025, OUT0 = 0.8575, OUT1 = 0.946;

/** The line (em) for a line of type p of the way across the screen: condensing slows as the letters set, dissolving
 *  speeds up like the drop's own fall. The hero is on screen from the first frame, so it only dissolves. */
export function lineAt(p: number, hold: number, hero: boolean): number {
  if (!hero && p < IN1) {
    if (p <= IN0) return DUST;
    const u = (p - IN0) / (IN1 - IN0);
    return DUST + (hold - DUST) * (1 - (1 - u) ** FALL);
  }
  if (p <= OUT0) return hold;
  if (p >= OUT1) return DUST;
  return hold + (DUST - hold) * ((p - OUT0) / (OUT1 - OUT0)) ** FALL;
}

export function HeadingDots() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>(".fys-root");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!CSS.supports("(-webkit-background-clip: text) or (background-clip: text)")) return;
    // the scroll-tied path needs view() and round() both: without round() the stepped background-position is dropped
    const tied = CSS.supports("animation-timeline: view()") && CSS.supports("top: round(1px, 1px)");
    root.dataset.condense = tied ? "css" : "raf";
    const onMeasure = (e: Event) => {
      // the keyframes' 85.75% is where the drop takes off (LAND_AT less REST): say so if coral-drop's REST changes
      if (process.env.NODE_ENV !== "production") {
        const { rest } = (e as CustomEvent<{ rest: number }>).detail;
        if (Math.abs(rest / window.innerHeight - 0.34) > 0.005) console.warn("heading-dots: coral-drop's REST changed; move fys-condense's 85.75% to match");
      }
    };
    if (tied) {
      root.addEventListener("fys-measure", onMeasure);
      return () => { root.removeEventListener("fys-measure", onMeasure); delete root.dataset.condense; };
    }

    const lines = [...root.querySelectorAll<HTMLElement>(".fys-hl span")].map((el) => ({
      el, hero: !!el.closest(".fys-hero-hl"), hold: el.closest(".fys-dotted") ? 0 : HOLD, top: 0, h: 0, step: NaN,
    }));
    let vh = window.innerHeight, raf = 0, gone = false;
    // where each line is on the page: measured when the page changes size, never while scrolling
    const measure = () => {
      vh = window.innerHeight;
      const y = window.scrollY;
      for (const l of lines) { const b = l.el.getBoundingClientRect(); l.top = b.top + y; l.h = b.height; }
    };
    const paint = () => {
      raf = 0;
      if (gone) return;
      const y = window.scrollY;
      for (const l of lines) {
        const step = Math.round(lineAt((vh - (l.top - y)) / (vh + l.h), l.hold, l.hero) / STEP);
        if (step !== l.step) { l.step = step; l.el.style.setProperty("--fys-line", `${(step * STEP).toFixed(3)}em`); }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const onResize = () => { measure(); paint(); };
    const onDropMeasure = (e: Event) => { onMeasure(e); onResize(); };
    measure(); paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    root.addEventListener("fys-measure", onDropMeasure);
    document.fonts?.ready.then(() => { if (!gone) onResize(); });
    const sized = new ResizeObserver(onResize);
    sized.observe(root);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.removeEventListener("fys-measure", onDropMeasure);
      sized.disconnect();
      lines.forEach((l) => l.el.style.removeProperty("--fys-line"));
      delete root.dataset.condense;
    };
  }, []);
  return <span ref={marker} hidden />;
}
