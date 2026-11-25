/**
 * The heading dots' curve (heading-dots.tsx): where a headline line's halftone sits for where the line is on screen.
 * Plain arithmetic, apart from the component so it can be tested (heading-line.test.ts).
 */

/** Where each line rests (in em, from where today's dotted foot starts): solid from 7 steps; the dotted headlines at
 *  0. Dust is 11 steps above, where every letter is the finest dots. One step is two rows of the halftone. */
export const HOLD = 0.546, DUST = -0.858, STEP = 0.078;
/** Arriving, as shares of a line's trip across the screen (its padded top entering at the bottom = 0, its padded
 *  bottom leaving at the top = 1): on an 844 px phone it condenses between its top at 97% and 89% of the screen's
 *  height, done before the drop falls back into view. */
const IN0 = 0.03, IN1 = 0.1025;
/** Leaving: on that phone it breaks from its top at 8% of the screen (67 px, where the drop takes off: LAND_AT 0.42
 *  less REST 0.34) over 80 px of scroll (1.3 lines), the judged prototype's zone ((1 - 0.8575) x the screen less
 *  0.8575 lines, over 0.0885 of a trip). On a tall screen that share would start the break far down (190 px at 1920,
 *  440 px at 3840: a hero half dust at first paint, a jump to "bring your club" landing on dots), so it starts no
 *  lower than LEAVE_MAX px and runs over at most LEAVE_SPAN lines. */
const OUT0 = 0.8575, OUT1 = 0.946, LEAVE_MAX = 100, LEAVE_SPAN = 1.3;

/** The line (em) for a line whose padded top is t px from the screen's top, on a screen vh tall. The hero is on screen
 *  from the first frame, so it only dissolves, and never before the reader scrolls (top0, its top at scroll 0). It
 *  condenses on 1 - (1 - u) ** fall, slowing as the letters set, and dissolves on u ** fall, speeding up like the
 *  drop's own fall (coral-drop.tsx FALL). */
export function lineAt(t: number, vh: number, h: number, hold: number, hero: boolean, top0: number, fall: number): number {
  const p = (vh - t) / (vh + h);
  if (!hero && p < IN1) {
    if (p <= IN0) return DUST;
    const u = (p - IN0) / (IN1 - IN0);
    return DUST + (hold - DUST) * (1 - (1 - u) ** fall);
  }
  let from = Math.min((1 - OUT0) * vh - OUT0 * h, LEAVE_MAX);
  if (hero) from = Math.min(from, top0 - 1);
  const span = Math.min((OUT1 - OUT0) * (vh + h), LEAVE_SPAN * h);
  if (t >= from) return hold;
  if (t <= from - span) return DUST;
  return hold + (DUST - hold) * ((from - t) / span) ** fall;
}
