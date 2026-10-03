"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * One real screen from the demo film, framed like an instrument readout
 * (S72 design 2, after sibaldesign.com): a hairline window with corner ticks
 * in the kind's colour and a mono caption strip, "Fig. 0X · Name".
 *
 * The stills live in public/landing/ and are committed: each is cropped below
 * the app's crimson campus bar and has no photo of anyone in it (the Orgs crop
 * stops above SAE, whose picture is a photo; the DM crop starts below the
 * header and its photo). scripts/demo-video/stills.sh cuts them from the
 * master film again: frame times and crops are there.
 */
export type Still = {
  /** File stem in public/landing/: <stem>-480/960.avif|webp and <stem>-720.jpg. */
  stem: string;
  fig: string;
  alt: string;
  /** The bottom edge cuts through a card: fade it out instead. */
  fade?: boolean;
  /** The screen's point is at its bottom (the newest message): a phone's square crop keeps that end. */
  bottom?: boolean;
};

// The window is 4:5 (the crops are 1170 x 1462), square on a phone. Phones:
// the panel's width less its padding; 760-999px: a 300px column beside the
// text; wider: a third.
const SIZES = "(min-width: 1000px) 320px, (min-width: 760px) 300px, calc(100vw - 82px)";

/**
 * `watch` is the film's part of the day this screen comes from: the caption's
 * link takes the film there. A build with no film passes none, and the
 * caption is the figure's name alone.
 */
export function Readout({ still, n, watch }: { still: Still; n: number; watch?: { part: string; go: () => void } }) {
  const box = useRef<HTMLElement>(null);

  // A one-time switch-on: a dark veil with faint scan rows slides down once
  // when the window is well into view, led by a lit line in the kind's
  // colour. Only for a readout still below the fold when the page loads, and
  // never with reduced motion; without JavaScript there is no veil at all.
  // data-scan is set on the element directly: React never renders it, so a
  // re-render of the page can't reset it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.scan = "off";
    // 60% of the window, or 60% of the screen height for a window taller
    // than that (a phone held sideways), so the veil always lifts.
    const io = new IntersectionObserver(([e]) => {
      const tall = e.intersectionRect.height >= (e.rootBounds?.height ?? window.innerHeight) * 0.6;
      if (e.intersectionRatio < 0.6 && !tall) return;
      el.dataset.scan = "on";
      io.disconnect();
    }, { threshold: [0.2, 0.3, 0.4, 0.5, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const src = (w: number, ext: string) => `/landing/${still.stem}-${w}.${ext}`;
  return (
    <figure ref={box} className="vln-readout">
      <div className={`vln-readout-win${still.fade ? " is-cut" : ""}${still.bottom ? " is-bottom" : ""}`}>
        <picture>
          <source type="image/avif" srcSet={`${src(480, "avif")} 480w, ${src(960, "avif")} 960w`} sizes={SIZES} />
          <source type="image/webp" srcSet={`${src(480, "webp")} 480w, ${src(960, "webp")} 960w`} sizes={SIZES} />
          <img src={src(720, "jpg")} width={1170} height={1462} alt={still.alt} loading="lazy" decoding="async" />
        </picture>
      </div>
      <figcaption>
        <span>Fig. 0{n} · {still.fig}</span>
        {/* The part of the day it comes from, in the film below. The href is for a page without JavaScript. */}
        {watch ? (
          <a
            href="#vln-film"
            aria-label={`${watch.part}: watch it in A day on Vibe`}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              watch.go();
            }}
          >
            {watch.part} <span aria-hidden="true">↓</span>
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
