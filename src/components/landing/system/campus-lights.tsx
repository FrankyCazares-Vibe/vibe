"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { ART_EXTRA } from "./art-data";

/**
 * "one campus at a time." lights one at a time (Nov 23, motion idea 3; Franky: "build the campus lighting next"). The
 * two lit campuses on the drawn line (the board's lift-campuses.mjs took them out of open-*.svg) are drawn here: until
 * the travelling full stop lands in "at a time.", they sit on the line as faint cream rings; when it lands, Indianapolis
 * lights first, coral, with the sign-in dot's little bounce, then Bloomington a beat later, coral too (Franky, Nov 23:
 * "ship it in coral"). Once lit they stay lit.
 *
 * A page opened past it (a reload, a back navigation) has them lit already, with no bounce.
 *
 * Never left dark: a landing further down the page lights them too (a fast scroll that skips "at a time."), and so does
 * the line being well in view for a moment. Without JavaScript, with reduced motion, or before the drop starts, they're
 * simply lit (the faint state only applies under CoralDrop's data-drop). Transform and opacity, Web Animations.
 */
const C = ART_EXTRA.campuses;
const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
const place = (i: number) => {
  const [x, y, , g] = C.desktop[i], [px, py, , pg] = C.phone[i];
  return { "--cx": pct(x), "--cy": pct(y), "--cg": pct(g), "--pcx": pct(px), "--pcy": pct(py), "--pcg": pct(pg) } as CSSProperties;
};
const EASE = "cubic-bezier(0.3, 0.7, 0.3, 1)";
const SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How long the line must be well in view before it lights on its own (if the drop never landed). */
const SEEN_MS = 2500;

export function CampusLights() {
  const home = useRef<HTMLSpanElement>(null);
  const next = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const a = home.current, b = next.current, line = a?.closest<HTMLElement>(".fys-line"), root = a?.closest<HTMLElement>(".fys-root");
    if (!a || !b || !line || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops = [...root.querySelectorAll(".fys-stop")], at = stops.indexOf(root.querySelector("#fys-open-title .fys-stop") as Element);
    let lit = false, timer = 0;
    const light = () => {
      if (lit) return;
      lit = true;
      window.clearTimeout(timer);
      line.dataset.lit = "";
      [a, b].forEach((el, i) => {
        const delay = i * 260, dot = el.firstElementChild as HTMLElement | null;
        el.animate([{ opacity: 0, transform: "scale(0.8)" }, { opacity: 1, transform: "none" }], { duration: 700, delay, easing: SOFT, fill: "backwards" });
        dot?.animate([{ transform: "scale(0.4)" }, { transform: "scale(1.2)", offset: 0.4 }, { transform: "scale(0.92)", offset: 0.65 }, { transform: "scale(1.04)", offset: 0.82 }, { transform: "none" }], { duration: 650, delay, easing: EASE, fill: "backwards" });
      });
    };
    const onLand = (e: Event) => { const d = (e as CustomEvent<{ index: number }>).detail; if (at >= 0 && d.index >= at) light(); };
    root.addEventListener("fys-land", onLand);
    // the page opened past "at a time." (coral-drop.tsx fys-place: a reload, a back navigation): lit already, no bounce
    const onPlace = (e: Event) => {
      const d = (e as CustomEvent<{ index: number }>).detail;
      if (lit || at < 0 || d.index < at) return;
      lit = true;
      window.clearTimeout(timer);
      line.dataset.lit = "";
    };
    root.addEventListener("fys-place", onPlace);
    // the safety net: the line well in view for a moment lights it, landing or not
    const seen = new IntersectionObserver(([e]) => {
      window.clearTimeout(timer);
      if (!lit && e.intersectionRatio >= 0.6) timer = window.setTimeout(light, SEEN_MS);
    }, { threshold: [0, 0.6] });
    seen.observe(line);
    return () => { root.removeEventListener("fys-land", onLand); root.removeEventListener("fys-place", onPlace); seen.disconnect(); window.clearTimeout(timer); };
  }, []);
  return (
    <>
      <span ref={home} className="fys-campus" style={place(0)} aria-hidden="true"><span className="fys-campus-dot" /></span>
      <span ref={next} className="fys-campus" style={place(1)} aria-hidden="true"><span className="fys-campus-dot" /></span>
    </>
  );
}
