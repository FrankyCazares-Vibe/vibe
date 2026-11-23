"use client";

import { useEffect, useRef } from "react";

/**
 * The coral full stop's drop (rounds 6 and 7, Nov 23, Franky: "make the
 * orange orb just fall into the next screen's period", bouncing like the
 * sign-in screen's dot and the videos' end card).
 *
 * 1. At rest it bounces now and then in "yourself." with the sign-in dot's
 *    bounce (globals.css vibe-kinetic-dot: lands squashed, hops a third back
 *    up, then a little hop, then rests).
 * 2. As the page scrolls toward "made of your people.", it falls, faster as
 *    it goes, and lands as that headline's full stop, with the same bounce.
 * 3. Scrolling back up lifts it home again.
 *
 * It is tied to the scroll, so it is always where the reader is looking. The
 * page knows nothing of this without JavaScript or with reduced motion: both
 * full stops simply sit in place. Transform only; one small element; no work
 * while it rests.
 */
const FIRST_HOP = 1600, HOP_EVERY = 5200;
/** It lands when the next headline's full stop reaches this share of the screen's height. */
const LAND_AT = 0.42;

type Pt = { x: number; y: number; r: number };

export function CoralDrop() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = marker.current?.closest<HTMLElement>(".fys-root");
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = host.querySelector<HTMLElement>(".fys-drop-start"), end = host.querySelector<HTMLElement>(".fys-drop-end");
    if (!start || !end) return;
    const dot = document.createElement("span");
    dot.className = "fys-drop";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);
    host.dataset.drop = "home";

    // a full stop's ink, in the page root's own px, from the font's own measures (the <i> box is wider than the dot)
    const ink = (el: HTMLElement): Pt => {
      const h = host.getBoundingClientRect(), b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const x0 = b.left - h.left, y0 = b.top - h.top, ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return { x: x0 + b.width / 2, y: y0 + b.height * 0.7, r: b.width * 0.35 };
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText("."), a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
      const base = y0 + (b.height - (a + d)) / 2 + a;   // the content area sits centred in the box's own height
      return { x: x0 + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, y: base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2, r: Math.max(2, (m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 2) };
    };
    let S: Pt = ink(start), E: Pt = ink(end), hostY = host.getBoundingClientRect().top + window.scrollY;
    const measure = () => { S = ink(start); E = ink(end); hostY = host.getBoundingClientRect().top + window.scrollY; };

    let phase: "home" | "away" | "landed" = "home", x = S.x, y = S.y, raf = 0, last = 0, gone = false, hopTimer = 0;
    // how far along the fall the scroll is: 0 at the top of the page, 1 when the next full stop sits at LAND_AT
    const progress = () => {
      const landAt = E.y + hostY - window.innerHeight * LAND_AT;
      return landAt <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / landAt));
    };
    const spot = (u: number) => {
      const e = u * u * (3 - 2 * u);
      return { x: S.x + (E.x - S.x) * e, y: S.y + (E.y - S.y) * Math.pow(u, 1.7), r: S.r + (E.r - S.r) * u };
    };
    const place = (r: number) => { dot.style.transform = `translate3d(${(x - r).toFixed(1)}px, ${(y - r).toFixed(1)}px, 0)`; dot.style.width = dot.style.height = `${(r * 2).toFixed(1)}px`; };
    const bounce = (el: HTMLElement) => { el.classList.remove("is-bouncing"); void el.offsetWidth; el.classList.add("is-bouncing"); };
    const setPhase = (p: typeof phase) => { phase = p; host.dataset.drop = p; dot.style.opacity = p === "away" ? "1" : "0"; };

    const tick = (now: number) => {
      raf = 0;
      if (gone) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const u = progress(), to = spot(u);
      // it follows the scroll with a little lag, so the fall flows rather than jumps
      const k = Math.min(1, dt * 12);
      x += (to.x - x) * k; y += (to.y - y) * k;
      if (u >= 1 && Math.abs(E.x - x) < 1 && Math.abs(E.y - y) < 1) { setPhase("landed"); bounce(end); return; }
      if (u <= 0 && Math.abs(S.x - x) < 1 && Math.abs(S.y - y) < 1) { setPhase("home"); return; }
      place(to.r);
      raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!raf && !gone) { last = 0; raf = requestAnimationFrame(tick); } };

    const onScroll = () => {
      const u = progress();
      if (phase === "home" && u > 0) { measure(); x = S.x; y = S.y; place(S.r); setPhase("away"); go(); return; }
      if (phase === "landed" && u < 1) { measure(); x = E.x; y = E.y; place(E.r); setPhase("away"); go(); return; }
      if (phase === "away") go();
    };
    const onResize = () => { measure(); if (phase === "away") go(); };
    // at rest, a hop now and then, while the headline is in view
    const hop = () => { if (phase === "home" && !document.hidden && start.getBoundingClientRect().bottom > 0) bounce(start); hopTimer = window.setTimeout(hop, HOP_EVERY); };
    hopTimer = window.setTimeout(hop, FIRST_HOP);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => { if (!gone) onResize(); });
    onScroll();
    return () => {
      gone = true;
      window.clearTimeout(hopTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      dot.remove();
      delete host.dataset.drop;
    };
  }, []);
  return <span ref={marker} hidden />;
}
