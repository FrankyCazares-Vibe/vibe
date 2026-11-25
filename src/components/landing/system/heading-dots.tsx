"use client";

import { useEffect, useRef } from "react";
import { FALL } from "./coral-drop";
import { HOLD, STEP, lineAt } from "./heading-line";

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
 * It is written from the scroll in every browser (a review on Nov 25 measured the CSS view-timeline version repainting
 * each visible headline on every scroll frame, where this repaints a line only when its step changes, and drawing the
 * same frames): line positions are measured on resize, fonts and CoralDrop's fys-measure, never per frame; each frame
 * only does arithmetic and writes --fys-line where a step changed. With reduced motion, or without JavaScript, nothing
 * is set and every headline looks as it does today. Starfield, the collapse and "vibe." are untouched; the wordmark
 * never dissolves.
 */

type Line = { el: HTMLElement; hero: boolean; hold: number; top: number; h: number; step: number };

export function HeadingDots() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>(".fys-root");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!CSS.supports("(-webkit-background-clip: text) or (background-clip: text)")) return;
    root.dataset.condense = "";

    const lines: Line[] = [...root.querySelectorAll<HTMLElement>(".fys-hl > span")].map((el) => ({
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
        const step = Math.round(lineAt(l.top - y, vh, l.h, l.hold, l.hero, l.top, FALL) / STEP);
        if (step !== l.step) { l.step = step; l.el.style.setProperty("--fys-line", `${(step * STEP).toFixed(3)}em`); }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const onResize = () => { measure(); paint(); };
    const onMeasure = (e: Event) => {
      // the leaving zone starts where the drop takes off (LAND_AT less REST): say so if coral-drop's REST changes
      if (process.env.NODE_ENV !== "production") {
        const { rest } = (e as CustomEvent<{ rest: number }>).detail;
        if (Math.abs(rest / window.innerHeight - 0.34) > 0.005) console.warn("heading-dots: coral-drop's REST changed; move OUT0 to match");
      }
      onResize();
    };
    measure(); paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    root.addEventListener("fys-measure", onMeasure);
    document.fonts?.ready.then(() => { if (!gone) onResize(); });
    const sized = new ResizeObserver(onResize);
    sized.observe(root);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.removeEventListener("fys-measure", onMeasure);
      sized.disconnect();
      lines.forEach((l) => l.el.style.removeProperty("--fys-line"));
      delete root.dataset.condense;
    };
  }, []);
  return <span ref={marker} hidden />;
}
