/**
 * A Motion spring sampled into a CSS `linear()` easing: the CSS twins of
 * the springs in springs.ts (globals.css `--vibe-spring-snappy`, run over
 * 320ms). `spring-curve.test.ts` fails, printing the right curve, when the
 * CSS drifts from the spring:
 *   node --test src/lib/motion/spring-curve.test.ts
 */

export type SpringSpec = { stiffness: number; damping: number; mass: number };

/** Where the curve is sampled, in percent of the run: dense early, where a
 *  spring moves most. */
const STOPS = [0, 3, 6, 10, 14, 19, 24, 30, 37, 45, 55, 67, 82, 100];

/** Progress (0 to 1) of a spring let go from rest, `t` seconds in, by the
 *  same closed forms Motion uses (no initial velocity). */
export function springProgress({ stiffness, damping, mass }: SpringSpec, t: number): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decay = Math.exp(-zeta * w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - decay * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - decay * (1 + w0 * t);
  const wd = w0 * Math.sqrt(zeta * zeta - 1);
  return 1 - (decay * (zeta * w0 * Math.sinh(wd * t) + wd * Math.cosh(wd * t))) / wd;
}

/** The CSS `linear()` for `spring` run over `ms`. */
export function springLinear(spring: SpringSpec, ms: number): string {
  const parts = STOPS.map((pct) => {
    if (pct === 0) return "0";
    if (pct === 100) return "1";
    const v = Math.round(springProgress(spring, (ms * pct) / 100_000) * 1000) / 1000;
    return `${v} ${pct}%`;
  });
  return `linear(${parts.join(", ")})`;
}
