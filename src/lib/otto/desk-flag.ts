/**
 * The desk's off switch (Wave 2A, Nov 10, 2026; the FIRST_LIGHT pattern,
 * src/app/layout.tsx). The desk is on for everyone by default; `OTTO_DESK=off`
 * in the server environment (Vercel, Production) brings back today's Otto
 * page unchanged (OttoMobileLegacy.tsx, OttoPageLegacy.tsx) after a redeploy.
 * Any other value, or none, leaves it on. No staged rollout: a switch is an
 * off button, not a stage (Franky, Oct 5).
 *
 * PURE: no imports, so desk-flag.test.ts loads it under plain `node --test`.
 */

export const OTTO_DESK_ENV = "OTTO_DESK";

/** True unless OTTO_DESK is "off" (trimmed, any case). */
export function ottoDeskOn(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[OTTO_DESK_ENV];
  return !(typeof value === "string" && value.trim().toLowerCase() === "off");
}
