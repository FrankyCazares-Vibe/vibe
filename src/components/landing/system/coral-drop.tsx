"use client";

import { useEffect, useRef } from "react";

/**
 * The coral full stop's journey (round 6, Nov 23, Franky: "make the orange
 * period drop after a while, and when it drops it goes all down to the bottom
 * where it says vibe, and ... bounces up and down" like the sign-in screen's
 * dot and the videos' end card).
 *
 * 1. It bounces once in "yourself." with the sign-in dot's bounce
 *    (globals.css vibe-kinetic-dot: lands squashed, hops a third back up,
 *    then a little hop, then rests).
 * 2. A moment later, or as soon as the page is scrolled, it drops off the
 *    headline and falls to the bottom left of the screen.
 * 3. While the page scrolls it rides down the left margin with a slow sway.
 * 4. At the close it glides into "vibe." as its full stop and bounces there.
 *    Scrolling back up takes it back out.
 *
 * The page knows nothing of this without JavaScript or with reduced motion:
 * both full stops simply sit in place. It moves by transform only; one small
 * element; no work while it's resting (home, or landed and still).
 */
const BOUNCE_AT = 1600, DROP_AT = 3600;
/** Where it rides, as a share of the screen's height, and how far it stays in from the left edge. */
const RIDE = 0.86;

type Pt = { x: number; y: number; r: number };

export function CoralDrop() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = marker.current?.closest<HTMLElement>(".fys-root");
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = host.querySelector<HTMLElement>(".fys-drop-start"), orb = host.querySelector<HTMLElement>(".fys-orb");
    if (!start || !orb) return;
    const dot = document.createElement("span");
    dot.className = "fys-drop";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);
    host.dataset.drop = "home";

    let S: Pt = { x: 0, y: 0, r: 4 }, E: Pt = { x: 0, y: 0, r: 8 }, gutter = 12, hostY = 0;
    // positions are in the page root's own px (the travelling dot is placed inside it)
    const page = (r: DOMRect) => { const h = host.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top }; };
    // the headline's full stop: its ink, from the font's own measures (the <i> box is wider than the dot)
    const measure = () => {
      const cs = getComputedStyle(start), ctx = document.createElement("canvas").getContext("2d");
      const b = start.getBoundingClientRect(), p = page(b);
      if (ctx) {
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = ctx.measureText(".");
        // the baseline: the content area (ascent + descent) sits centred in the box's own line height
        const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent, base = p.y + (b.height - (a + d)) / 2 + a;
        S = { x: p.x + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, y: base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2, r: Math.max(2, (m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 2) };
      } else S = { x: p.x + b.width / 2, y: p.y + b.height * 0.7, r: b.width * 0.35 };
      const o = orb.getBoundingClientRect(), q = page(o);
      E = { x: q.x + o.width / 2, y: q.y + o.height / 2, r: o.width / 2 };
      const copy = host.querySelector(".fys-hero-copy")?.getBoundingClientRect();
      const textLeft = copy ? copy.left - host.getBoundingClientRect().left + parseFloat(getComputedStyle(host.querySelector(".fys-hero-copy")!).paddingLeft || "0") : 24;
      gutter = Math.max(10, textLeft / 2);
      hostY = host.getBoundingClientRect().top + window.scrollY;
    };

    let phase: "home" | "falling" | "riding" | "landed" = "home", x = 0, y = 0, vy = 0, raf = 0, last = 0, gone = false;
    const t0 = performance.now();
    const timers: number[] = [];
    const show = (on: boolean) => { dot.style.opacity = on ? "1" : "0"; };
    const place = (r: number) => { dot.style.transform = `translate3d(${(x - r).toFixed(1)}px, ${(y - r).toFixed(1)}px, 0)`; dot.style.width = dot.style.height = `${(r * 2).toFixed(1)}px`; };
    const target = () => Math.min(E.y, Math.max(S.y, window.scrollY - hostY + window.innerHeight * RIDE));

    const land = () => {
      phase = "landed"; host.dataset.drop = "landed"; show(false);
      orb.classList.remove("is-bouncing"); void orb.offsetWidth; orb.classList.add("is-bouncing");
    };
    const tick = (now: number) => {
      raf = 0;
      if (gone) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const T = target(), span = Math.max(1, E.y - S.y), p = Math.min(1, Math.max(0, (y - S.y) / span));
      // the size: the headline's full stop, growing into the close's sun as it goes
      const r = S.r + (E.r - S.r) * p;
      // across: off the headline to the margin, along it, then in to its place in "vibe."
      const toGutter = Math.min(1, (y - S.y) / (window.innerHeight * 0.35));
      const toEnd = Math.min(1, Math.max(0, 1 - (E.y - y) / (window.innerHeight * 0.45)));
      const sway = Math.sin((now - t0) / 900) * 5 * (1 - toEnd) * toGutter;
      const ease = (u: number) => u * u * (3 - 2 * u);
      const gx = S.x + (gutter - S.x) * ease(toGutter) + sway;
      const tx = gx + (E.x - gx) * ease(toEnd);
      if (phase === "falling") {
        // a real drop: gravity, then the floor (the riding height) and a couple of shrinking bounces
        vy += 2600 * dt; y += vy * dt;
        if (y >= T) { y = T; vy = -vy * 0.38; if (Math.abs(vy) < 90) { vy = 0; phase = "riding"; } }
        x += (tx - x) * Math.min(1, dt * 7);
      } else if (phase === "riding") {
        y += (T - y) * Math.min(1, dt * 6);
        x += (tx - x) * Math.min(1, dt * 6);
        if (T >= E.y - 0.5 && Math.abs(E.y - y) < 1.5 && Math.abs(E.x - x) < 1.5) { x = E.x; y = E.y; place(E.r); land(); return; }
      }
      place(r);
      if (phase === "falling" || phase === "riding") raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!raf && !gone) { last = 0; raf = requestAnimationFrame(tick); } };

    const drop = () => {
      if (phase !== "home" || gone) return;
      measure();
      x = S.x; y = S.y; vy = -260; phase = "falling";
      host.dataset.drop = "away"; place(S.r); show(true); go();
    };
    const onScroll = () => {
      if (phase === "home") { if (window.scrollY > 40) drop(); return; }
      if (phase === "landed") {
        if (target() < E.y - 2) { phase = "riding"; host.dataset.drop = "away"; x = E.x; y = E.y; place(E.r); show(true); go(); }
        return;
      }
      go();
    };
    const onResize = () => { if (phase !== "home") { measure(); if (phase === "landed") { x = E.x; y = E.y; } else go(); } };

    // 1. the bounce in place, 2. the drop
    timers.push(window.setTimeout(() => { if (phase === "home") { start.classList.add("is-bouncing"); } }, BOUNCE_AT));
    timers.push(window.setTimeout(drop, DROP_AT));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => { if (!gone && phase !== "home") onResize(); });
    return () => {
      gone = true;
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      dot.remove();
      delete host.dataset.drop;
    };
  }, []);
  return <span ref={marker} hidden />;
}
