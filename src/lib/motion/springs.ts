/**
 * The app's motion vocabulary (motion pass, Oct 18 2026). Franky's rules,
 * from his video transcripts: springs, never fixed timings; animate
 * transform and opacity only; almost no blur and never on a big surface;
 * reduced motion is respected everywhere (MotionRoot sets Motion to follow
 * the device setting, and the CSS twins sit behind prefers-reduced-motion).
 *
 * Three springs cover the app. Use these names; don't invent new numbers
 * in a component.
 */

/** Taps, toggles, a pill sliding under a tab: quick, settles with no wobble.
 *  Its CSS twin, for `.vibe-press`, is globals.css `--vibe-spring-snappy`
 *  (made by spring-curve.ts; change both together). */
export const SPRING_SNAPPY = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;

/** Things arriving: a card rising in, a viewer opening, content after a skeleton. */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

/** A small celebratory pop (the like heart): one visible overshoot. */
export const SPRING_POP = { type: "spring", stiffness: 640, damping: 16, mass: 0.6 } as const;

/** How far an arriving card rises, in px. Small on purpose. */
export const RISE_PX = 8;
