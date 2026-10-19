"use client";

import { motion } from "motion/react";

import { RISE_PX, SPRING_SOFT } from "./springs";

/**
 * Content arriving: fades in and rises a few px, once, on mount. For a feed
 * card as it first appears and for real content replacing a skeleton (pass
 * `rise={false}` for a plain crossfade). A list item keyed by its id mounts
 * once, so a refresh that keeps it on screen doesn't replay it.
 *
 * `delayIndex` staggers the first screenful (capped, so item 40 doesn't
 * wait); `still` mounts an item as it is, for rows past the first screen.
 * Reduce motion needs no check here: MotionRoot makes the rise snap and
 * leaves only the fade, and the first render is the same on the server and
 * the client.
 */
export function Reveal({
  children,
  rise = true,
  delayIndex = 0,
  still = false,
  className,
  style,
}: {
  children: React.ReactNode;
  rise?: boolean;
  delayIndex?: number;
  still?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={still ? false : { opacity: 0, y: rise ? RISE_PX : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: Math.min(Math.max(delayIndex, 0), 6) * 0.035 }}
    >
      {children}
    </motion.div>
  );
}
