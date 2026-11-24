"use client";

import { useEffect, useRef } from "react";

import "./starfield.css";

/**
 * The starfield camera (Nov 24, 2026, Franky: "every time you scroll, your scroll is meaningful... it moves you into
 * another part of the solar system").
 *
 * The page's starry dust (the two tiles in .fys-root's background) becomes a sky with depth behind the whole page. It
 * is the same stars, split by depth (the board's starfield-split.mjs): the dimmest half far away, then mid, then the
 * brightest and biggest near. As the page scrolls, far moves at 6% of the scroll, mid at 30% and near at 70% (the words
 * move at 100%), so the page reads as deep. Nothing streaks and nothing is drawn: each depth is one box of SVG tiles
 * (starfield.css), drawn once by the browser at the screen's own sharpness and moved whole.
 *
 * The move is the scroll's own (a CSS scroll-driven animation), off the main thread, in steps of exactly one screen pixel
 * at any scale, so the stars rest crisp. Each box loops every LOOP px it moves (just under, where LOOP isn't a whole
 * number of screen pixels: see fit); this sets how many loops it makes over RANGE px of scroll
 * (animation-range), so a box is always k x scroll along, whatever the page's height or a phone's toolbar does. Where a
 * browser can't take a range in pixels, the loops are counted over the page's own scroll and recounted when the screen
 * or the page's height changes. Where it has no scroll-driven animations at all (Firefox today), one passive scroll
 * listener moves the boxes in the next frame instead. Nothing runs at rest.
 *
 * On the first LOOP px of the page every star is where today's tiles put it, so on a screen up to LOOP px tall the
 * switch at the top is unseen at whole-number scales (at fractional ones, like 1.25 or 2.625, some stars are redrawn a
 * fraction of a pixel differently). A screen taller than that (below LOOP the stars would move) and a page loaded
 * partway down keep today's tiles until the first scroll, and switch as the page starts to move. The hero's own sky
 * (night-sky.tsx, with the warp) is left as it is. Without JavaScript or with reduced motion nothing here runs and the
 * dust is today's two tiles.
 */

/** Each depth's speed, as a share of the scroll (the words move at 1). Its tiles are starfield-<name>-*.svg. */
const DEPTHS = [{ name: "far", k: 0.06 }, { name: "mid", k: 0.3 }, { name: "near", k: 0.7 }] as const;
/** Each box's loop: its stars repeat every LOOP px down the page (starfield.css, and its keyframes). */
const LOOP = 877;
/** Room past the end of the travel (px), for a scroll that overshoots. */
const SPARE = 4;
/** The scroll the loops are counted over (px): far longer than the page, so the stars never stop. */
const RANGE = 100000;

export function Starfield() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = marker.current?.closest<HTMLElement>(".fys-root");
    if (!host) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop: (() => void) | null = null, pending = false, gone = false;

    const build = (): (() => void) => {
      // the scroll itself moves the boxes where it can; otherwise a passive listener does, in the next frame
      const timeline = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
      const ranged = timeline && CSS.supports("animation-range: 0px 1px");
      const boxes = DEPTHS.map(({ name, k }) => {
        const el = document.createElement("div");
        el.className = `fys-sf fys-sf-${name}`;
        el.setAttribute("aria-hidden", "true");
        return { el, k, y: NaN };
      });
      let max = 0, dpr = 1, raf = 0, on = false;
      // without the scroll's own timeline: each box at its share of the scroll, on whole screen pixels
      const place = () => {
        raf = 0;
        const s = Math.min(max, Math.max(0, window.scrollY));
        for (const b of boxes) {
          const y = Math.round(((b.k * s) % LOOP) * dpr) / dpr;
          if (y !== b.y) { b.y = y; b.el.style.transform = `translate3d(0, ${-y}px, 0)`; }
        }
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(place); };
      // each box is k x scroll along: so many loops over RANGE px (or over the whole scroll), in steps of one screen pixel
      const fit = () => {
        const tall = document.documentElement.scrollHeight;
        max = Math.max(0, tall - window.innerHeight);
        dpr = window.devicePixelRatio || 1;
        // the move's loop is a whole number of screen pixels (n), so every step is exactly one at any scale (1.25, 2.625):
        // n / dpr px, just under LOOP where LOOP x dpr isn't whole (876.8 at 1.25), exactly LOOP at 1x, 2x and 3x. The
        // jump back at its end lands within a screen pixel of the next step, so it can't be seen.
        const n = Math.max(1, Math.floor(LOOP * dpr)), loop = n / dpr;
        for (const b of boxes) {
          // the box: the screen plus as far as it can move (k x the page's height, which no scroll exceeds), at most a loop
          b.el.style.setProperty("--fys-sf-travel", `${Math.min(LOOP, Math.ceil(b.k * tall) + SPARE)}px`);
          if (timeline) {
            if (ranged) b.el.style.setProperty("animation-range", `0px ${RANGE}px`);
            b.el.style.setProperty("--fys-sf-loop", `${loop}px`);
            b.el.style.animationIterationCount = String((b.k * (ranged ? RANGE : max)) / loop);
            b.el.style.animationTimingFunction = `steps(${n}, end)`;
          }
        }
        if (!timeline && on) place();
      };
      const sized = new ResizeObserver(fit);
      // the switch, all in one frame: the boxes in, today's two tiles out (starfield.css)
      const go = () => {
        if (on) return;
        on = true;
        window.removeEventListener("scroll", go);
        fit();
        if (!timeline) place();
        host.prepend(...boxes.map((b) => b.el));
        host.dataset.starfield = "";
        if (!timeline) window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", fit);
        sized.observe(host);
      };
      // at the top of a screen up to LOOP px tall every star is where today's are; on a taller screen (its stars below
      // LOOP would move) or partway down, switch as the page starts to move
      if (window.scrollY === 0 && window.innerHeight <= LOOP) go();
      else window.addEventListener("scroll", go, { passive: true });
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", go);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", fit);
        sized.disconnect();
        delete host.dataset.starfield;
        for (const b of boxes) b.el.remove();
      };
    };

    // the tiles are pictures: switch only once they're ready, so no star ever blinks out
    const start = () => {
      if (still.matches || stop || pending) return;
      pending = true;
      // (the load event, then decode where it works: Safari has rejected decode() for SVG pictures)
      Promise.all(DEPTHS.flatMap(({ name }) => ["613", "613-top", "877"].map((tile) => new Promise<void>((ok, no) => {
        const img = new Image();
        img.onload = () => { img.decode().catch(() => undefined).then(() => ok()); };
        img.onerror = no;
        img.src = `/landing/system/starfield-${name}-${tile}.svg`;
      }))))
        .then(() => { pending = false; if (!gone && !still.matches && !stop) stop = build(); })
        .catch(() => { pending = false; });
    };
    const onMotion = () => { if (still.matches) { stop?.(); stop = null; } else start(); };
    still.addEventListener("change", onMotion);
    start();
    return () => { gone = true; still.removeEventListener("change", onMotion); stop?.(); stop = null; };
  }, []);
  return <span ref={marker} hidden />;
}
