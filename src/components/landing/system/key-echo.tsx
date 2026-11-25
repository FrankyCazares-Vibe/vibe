"use client";

import { useEffect, useRef } from "react";

/**
 * The sign-up key's landing ring (Nov 24, 2026, buttons C with A's landing: campaigns/2026-11-landing-revamp/buttons/
 * DECISION.md in vibe-marketing). When the travelling full stop lands from above in the hero key's full stop
 * (CoralDrop's fys-land), one thin ink ring runs out of it and is gone in 0.9 s. It is drawn at its landed size (1 px,
 * 0.62 em, system.css .fys-cta-echo), grows from 0.45 and only shows once it is clear of the dot, so the dot never looks
 * outlined. Like the close's ring of light (close-ring.tsx): never on the way back up, never when the dot is simply
 * placed (a reload), never with reduced motion (CoralDrop doesn't run then, so nothing lands). Transform and opacity
 * only, on the Web Animations API. It sits right after the full stop it answers to.
 */
const SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function KeyEcho() {
  const ring = useRef<HTMLElement>(null);
  useEffect(() => {
    const r = ring.current, stop = r?.previousElementSibling, root = r?.closest<HTMLElement>(".fys-root");
    if (!r || !stop || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onLand = (e: Event) => {
      const d = (e as CustomEvent<{ stop: Element; fromAbove: boolean }>).detail;
      if (d.stop !== stop || !d.fromAbove) return;
      r.getAnimations().forEach((a) => a.cancel());
      // per-keyframe easing, so it fades in fast and out slowly, as the board's CSS did
      r.animate([
        { opacity: 0, transform: "scale(0.45)", easing: SOFT },
        { opacity: 0.55, offset: 0.12, easing: SOFT },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: 900 });
    };
    root.addEventListener("fys-land", onLand);
    return () => root.removeEventListener("fys-land", onLand);
  }, []);
  return <b ref={ring} className="fys-cta-echo" />;
}
