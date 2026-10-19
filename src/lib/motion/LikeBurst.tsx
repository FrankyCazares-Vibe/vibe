"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { SPRING_POP, SPRING_SOFT } from "./springs";

const DOTS = 6;

/**
 * Wraps a heart icon. On a like the heart pops on a spring and six small
 * dots fly out and fade. With reduce motion on: no dots, no pop. Transform
 * and opacity only; the dots inherit `color`.
 *
 * Pass `burst`, a counter the caller bumps when the person likes (before
 * the request), so only their tap celebrates: a failed unlike that flips
 * `liked` back on never does. Without `burst`, any change of `liked` to on
 * after mount pops.
 */
export function LikeBurst({
  liked,
  burst,
  children,
  color = "var(--coral)",
}: {
  liked: boolean;
  burst?: number;
  children: React.ReactNode;
  color?: string;
}) {
  const reduce = useReducedMotion();
  // `burst` as it was at mount: only a bump after that plays.
  const [firstBurst] = useState(burst ?? 0);
  // The fallback: counts `liked` turning on, adjusted during render.
  const [prevLiked, setPrevLiked] = useState(liked);
  const [edges, setEdges] = useState(0);
  if (liked !== prevLiked) {
    setPrevLiked(liked);
    if (liked && burst === undefined) setEdges((n) => n + 1);
  }
  const count = burst === undefined ? edges : burst > firstBurst ? burst : 0;
  const play = reduce ? 0 : count;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <motion.span
        key={play}
        style={{ display: "inline-flex" }}
        initial={play ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={SPRING_POP}
      >
        {children}
      </motion.span>
      <AnimatePresence>
        {play ? (
          <span
            key={play}
            aria-hidden
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {Array.from({ length: DOTS }, (_, i) => {
              const a = (i / DOTS) * Math.PI * 2 - Math.PI / 2;
              return (
                <motion.span
                  key={i}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    marginTop: -2,
                    borderRadius: 999,
                    background: color,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(a) * 14, y: Math.sin(a) * 14, opacity: 0, scale: 0.4 }}
                  // The named arrival spring; the fade is its own, not movement.
                  transition={{ ...SPRING_SOFT, opacity: { duration: 0.45 } }}
                />
              );
            })}
          </span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
