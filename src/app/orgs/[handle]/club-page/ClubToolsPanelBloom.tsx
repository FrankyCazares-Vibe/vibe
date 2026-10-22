"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, type JSX } from "react";

import { SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import type { PanelBloom } from "./club-tools-panel";
import { PLANET_SURFACE } from "./ClubToolsLauncherPlanet";

/**
 * The planet turning into the tools panel (Oct 22, 2026; Franky: "the planet
 * orb expands and turns into that"). Its gradient circle, the planet's own
 * colours, sits on the open planet's centre at the planet's size and scales
 * out until it covers the panel's place (`panelBloom`, club-tools-panel.ts),
 * fading as it goes, while the panel springs in from the right under it. On
 * ← it plays backwards: it comes up over the panel as the panel slides away,
 * shrinks back to the planet's size on the planet's spot, and hands over to
 * the planet (`onReturned`), which fades back in as the circle fades out.
 *
 * Clipped to the panel's place, so the colour never spills over the page.
 * Transform and opacity only, from springs.ts. With reduce motion on there
 * is no bloom at all (a panel-sized flash of colour is what that setting
 * asks to be spared): the panel only fades, and the way back is at once.
 */
export type BloomPhase = "out" | "back" | null;

export function ClubToolsBloom({
  phase,
  geo,
  onReturned,
}: {
  /** "out": the panel is out. "back": on its way back into the planet. */
  phase: BloomPhase;
  geo: PanelBloom;
  onReturned: () => void;
}): JSX.Element {
  const reduce = useReducedMotion() === true;

  useEffect(() => {
    if (reduce && phase === "back") onReturned();
  }, [reduce, phase, onReturned]);

  return (
    // It fades with the arc when the arc goes (the card column's pattern:
    // the inner AnimatePresence doesn't carry the arc's exit).
    <motion.div
      aria-hidden
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: SPRING_SNAPPY }}
      style={{
        position: "absolute",
        top: 0,
        left: geo.clip.left,
        width: geo.clip.width,
        height: geo.clip.height,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {phase && !reduce ? <BloomCircle key="bloom" out={phase === "out"} geo={geo} onReturned={onReturned} /> : null}
      </AnimatePresence>
    </motion.div>
  );
}

function BloomCircle({ out, geo, onReturned }: { out: boolean; geo: PanelBloom; onReturned: () => void }): JSX.Element {
  return (
    <motion.span
      initial={{ scale: geo.from, opacity: 1 }}
      // Out: it grows at once and fades a beat later, so the colour reaches
      // the panel's edges before it lets go. Back: the reverse, it comes up
      // first and shrinks a beat later.
      animate={out ? { scale: 1, opacity: 0 } : { scale: geo.from, opacity: 1 }}
      transition={
        out
          ? { scale: SPRING_SOFT, opacity: { ...SPRING_SOFT, delay: 0.1 } }
          : { opacity: SPRING_SOFT, scale: { ...SPRING_SOFT, delay: 0.06 } }
      }
      // Gone, once it has handed back to the planet.
      exit={{ opacity: 0, transition: SPRING_SNAPPY }}
      onAnimationComplete={(done) => {
        // Only the way back's end (opacity 1): an interrupted "out" says 0.
        if (!out && (done as { opacity?: unknown }).opacity === 1) onReturned();
      }}
      style={{
        position: "absolute",
        left: geo.left,
        top: geo.top,
        width: geo.size,
        height: geo.size,
        borderRadius: "50%",
        background: PLANET_SURFACE,
        transformOrigin: "50% 50%",
      }}
    />
  );
}
