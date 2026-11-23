"use client";

import { useEffect, useRef } from "react";

/**
 * The coral full stop's fall (rounds 6 to 8, Nov 23, Franky: "fall into the
 * next screen's period", "make sure the period keeps dropping"), bouncing
 * like the sign-in screen's dot and the videos' end card.
 *
 * There is one coral full stop on the page, and it travels. It starts in
 * "yourself." (where it hops now and then), and as the page scrolls it drops
 * from headline to headline: "made of your people.", "bring your club.",
 * "see you there.", "one campus at a time.", and last into "vibe." as its sun.
 * At each one it lands with the sign-in dot's bounce and rests a moment as
 * that headline's full stop before falling on. Scrolling up runs it back.
 *
 * Every full stop on the page is a stop (".fys-stop", in page order, then the
 * close's ".fys-orb"). It is tied to the scroll, so it is always where the
 * reader is looking. Without JavaScript or with reduced motion every full
 * stop simply sits in its place. Transform only; one small element; no work
 * while it rests.
 */
const FIRST_HOP = 1600, HOP_EVERY = 5200;
/** It lands when the next full stop reaches this share of the screen's height, */
const LAND_AT = 0.42;
/** and rests there for this share of a screen of scrolling before it falls on. */
const REST = 0.34;

type Pt = { x: number; y: number; r: number };

export function CoralDrop() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = marker.current?.closest<HTMLElement>(".fys-root");
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops = [...host.querySelectorAll<HTMLElement>(".fys-stop"), ...host.querySelectorAll<HTMLElement>(".fys-orb")];
    if (stops.length < 2) return;
    const dot = document.createElement("span");
    dot.className = "fys-drop";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);
    host.dataset.drop = "";

    // a full stop's ink, in the page root's own px: a headline's from the font's own measures (its <i> box is wider
    // than the dot), the close's sun from its own box
    const ink = (el: HTMLElement): Pt => {
      const h = host.getBoundingClientRect(), b = el.getBoundingClientRect(), x0 = b.left - h.left, y0 = b.top - h.top;
      if (el.classList.contains("fys-orb")) return { x: x0 + b.width / 2, y: y0 + b.height / 2, r: b.width / 2 };
      const cs = getComputedStyle(el), ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return { x: x0 + b.width / 2, y: y0 + b.height * 0.7, r: b.width * 0.35 };
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText("."), a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
      const base = y0 + (b.height - (a + d)) / 2 + a;   // the content area sits centred in the box's own height
      return { x: x0 + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, y: base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2, r: Math.max(2, (m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 2) };
    };
    let P: Pt[] = [], L: number[] = [], rest = 0;
    // each stop's point, and the scroll at which the dot lands there (the first at the top, the last no later than
    // the page's end, so it can always get there)
    const measure = () => {
      P = stops.map(ink);
      const hostY = host.getBoundingClientRect().top + window.scrollY, vh = window.innerHeight;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh - 2);
      L = P.map((p, i) => (i === 0 ? 0 : Math.min(maxScroll, Math.max(0, p.y + hostY - vh * LAND_AT))));
      for (let i = 1; i < L.length; i++) L[i] = Math.max(L[i], L[i - 1] + 1);
      rest = vh * REST;
    };
    measure();

    // where the scroll puts the dot: resting at stop i, or falling from i to i + 1 (u from 0 to 1)
    const where = () => {
      const s = window.scrollY;
      let i = 0;
      while (i < L.length - 1 && s >= L[i + 1]) i++;
      if (i === L.length - 1) return { i, u: 0 };
      const span = L[i + 1] - L[i], hold = Math.min(rest, span * 0.5);
      return { i, u: Math.min(1, Math.max(0, (s - L[i] - hold) / Math.max(1, span - hold))) };
    };
    const spot = (i: number, u: number) => {
      const A = P[i], B = P[Math.min(P.length - 1, i + 1)], e = u * u * (3 - 2 * u);
      return { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * Math.pow(u, 1.7), r: A.r + (B.r - A.r) * u };
    };

    let here = 0, x = P[0].x, y = P[0].y, raf = 0, last = 0, gone = false, hopTimer = 0;
    const mark = (k: number) => { here = k; stops.forEach((el, j) => { if (j === k) el.dataset.here = ""; else delete el.dataset.here; }); };
    const place = (r: number) => { dot.style.transform = `translate3d(${(x - r).toFixed(1)}px, ${(y - r).toFixed(1)}px, 0)`; dot.style.width = dot.style.height = `${(r * 2).toFixed(1)}px`; };
    const bounce = (el: HTMLElement) => { el.classList.remove("is-bouncing"); void el.offsetWidth; el.classList.add("is-bouncing"); };
    mark(0);

    const tick = (now: number) => {
      raf = 0;
      if (gone) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const { i, u } = where(), to = spot(i, u);
      // it follows the scroll with a little lag, so the fall flows rather than jumps
      const k = Math.min(1, dt * 12);
      x += (to.x - x) * k; y += (to.y - y) * k;
      // close enough: it settles into the stop (so a steady scroll still lands it in each headline)
      if (u === 0 && Math.hypot(P[i].x - x, P[i].y - y) < Math.max(4, P[i].r * 1.5)) {
        x = P[i].x; y = P[i].y;
        // landed: the dot becomes that stop's full stop again, with a bounce (not when it simply rests at home)
        dot.style.opacity = "0";
        if (here !== i) { mark(i); bounce(stops[i]); }
        return;
      }
      if (here !== -1) { mark(-1); dot.style.opacity = "1"; }
      place(to.r);
      raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!raf && !gone) { last = 0; raf = requestAnimationFrame(tick); } };

    const onScroll = () => {
      const { i, u } = where();
      if (here !== -1 && i === here && u === 0) return;   // resting where it is
      if (here !== -1) { x = P[here].x; y = P[here].y; place(P[here].r); }
      go();
    };
    const onResize = () => { measure(); if (here !== -1) { x = P[here].x; y = P[here].y; } go(); };
    // at home, a hop now and then, while the headline is in view
    const hop = () => { if (here === 0 && !document.hidden && stops[0].getBoundingClientRect().bottom > 0) bounce(stops[0]); hopTimer = window.setTimeout(hop, HOP_EVERY); };
    hopTimer = window.setTimeout(hop, FIRST_HOP);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // the page settles (fonts, pictures) after the first frame: measure again then
    document.fonts?.ready.then(() => { if (!gone) onResize(); });
    window.addEventListener("load", onResize);
    // and whenever the page's height changes (pictures loading lower down move every stop)
    const sized = new ResizeObserver(() => onResize());
    sized.observe(host);
    onScroll();
    return () => {
      gone = true;
      window.clearTimeout(hopTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onResize);
      sized.disconnect();
      stops.forEach((el) => { delete el.dataset.here; el.classList.remove("is-bouncing"); });
      dot.remove();
      delete host.dataset.drop;
    };
  }, []);
  return <span ref={marker} hidden />;
}
