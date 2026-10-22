"use client";

import { motion } from "motion/react";

import { SPRING_SOFT } from "@/lib/motion/springs";

/**
 * The Club tools panel's sky (Oct 21, 2026, Franky: something space or
 * galaxy based, after Otto). A coral nebula blooms in from the right edge,
 * where the panel came out, and a violet one from the far corner; the stars
 * come on one after another; Otto's orbit is drawn large behind the title,
 * turning very slowly. Transform and opacity only, on springs (springs.ts).
 * With reduce motion on, Motion only fades (MotionRoot) and the CSS loops
 * (a few twinkling stars, the orbit) stay still (globals.css). Decorative:
 * hidden from screen readers, never in the way of a click.
 */

type Star = { x: number; y: number; size: number; o: number; twinkle: boolean };

/** The same sky every time: a small fixed-seed generator. */
function makeStars(count: number): Star[] {
  let seed = 64;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(next() * 1000) / 10,
    y: Math.round(next() * 1000) / 10,
    size: next() < 0.18 ? 2 : 1,
    o: Math.round((0.25 + next() * 0.65) * 100) / 100,
    twinkle: i % 6 === 0,
  }));
}

const STARS = makeStars(48);

export function GalaxyBackdrop() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.04 }}
        style={{
          position: "absolute",
          right: "-35%",
          top: "16%",
          width: "115%",
          height: "62%",
          transformOrigin: "100% 50%",
          background: "radial-gradient(closest-side, rgba(255,92,53,0.40), rgba(255,92,53,0.12) 55%, transparent)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.12 }}
        style={{
          position: "absolute",
          left: "-40%",
          bottom: "-22%",
          width: "125%",
          height: "70%",
          transformOrigin: "0% 100%",
          background: "radial-gradient(closest-side, rgba(123,95,224,0.36), rgba(123,95,224,0.10) 55%, transparent)",
        }}
      />
      {STARS.map((s, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: s.o, scale: 1 }}
          transition={{ ...SPRING_SOFT, delay: 0.08 + i * 0.012 }}
          style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
        >
          <span
            className={s.twinkle ? "vibe-star vibe-star--twinkle" : "vibe-star"}
            style={s.twinkle ? { animationDelay: `${(i % 5) * 0.7}s` } : undefined}
          />
        </motion.span>
      ))}
      {/* Otto's orbit, large: two tilted rings and a coral planet. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ ...SPRING_SOFT, delay: 0.06 }}
        style={{ position: "absolute", right: -70, top: -78, width: 270, height: 270 }}
      >
        <div className="vibe-orbit-spin vibe-orbit-spin--slow" style={{ width: "100%", height: "100%" }}>
          <svg width="270" height="270" viewBox="0 0 270 270" fill="none">
            <g transform="rotate(-18 135 135)">
              <ellipse cx="135" cy="135" rx="122" ry="48" stroke="rgba(255,255,255,0.10)" />
              <ellipse cx="135" cy="135" rx="86" ry="33" stroke="rgba(255,255,255,0.07)" />
              <circle cx="257" cy="135" r="3.5" fill="#FF5C35" />
              <circle cx="257" cy="135" r="9" fill="rgba(255,92,53,0.18)" />
            </g>
          </svg>
        </div>
      </motion.div>
    </div>
  );
}
