"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * The ring of light at the close (Nov 23, motion idea 6; the dot's spec in the brand guide: "can send one thin cream
 * ring out as it lands, gone within a second"). When the travelling full stop first lands in the sun of "vibe." from
 * above, one thin cream ring in the inner ring's own shape and tilt (0.72 x 0.216 em at -10 degrees, the board's
 * export.html) runs out from the sun and fades, and a faint coral light swells behind the sun and goes. Once per page
 * view, never on the way back up, never with reduced motion (CoralDrop doesn't run then, so nothing lands).
 * Transform and opacity only, on the Web Animations API. Placed with the sun's own variables (ORB_STYLE).
 */
const SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function CloseRing({ style }: { style: CSSProperties }) {
  const ring = useRef<HTMLSpanElement>(null);
  const flare = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const r = ring.current, f = flare.current, root = r?.closest<HTMLElement>(".fys-root");
    if (!r || !f || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let done = false;
    const onLand = (e: Event) => {
      const d = (e as CustomEvent<{ stop: Element; fromAbove: boolean }>).detail;
      if (done || !d.fromAbove || !d.stop.classList.contains("fys-orb")) return;
      done = true;
      r.animate([{ transform: "scale(0.7)", opacity: 0.55 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 900, easing: SOFT });
      f.animate([{ transform: "scale(0.85)", opacity: 0 }, { transform: "scale(1)", opacity: 0.4, offset: 0.3 }, { transform: "scale(1.15)", opacity: 0 }], { duration: 900, easing: "ease-out" });
    };
    root.addEventListener("fys-land", onLand);
    return () => root.removeEventListener("fys-land", onLand);
  }, []);
  return (
    <>
      <span ref={flare} className="fys-flare" style={style} aria-hidden="true" />
      <span ref={ring} className="fys-ring" style={style} aria-hidden="true" />
    </>
  );
}
