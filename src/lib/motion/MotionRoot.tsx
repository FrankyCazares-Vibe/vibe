"use client";

import { MotionConfig } from "motion/react";

/**
 * Every Motion animation in the app follows the device's reduce-motion
 * setting: with it on, transforms snap to their end and only opacity
 * fades. Mounted once in the root layout.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
