/**
 * Otto's look (Nov 10, 2026, the Otto build's Wave 1): which colourway Planet
 * wears and whether he moves on his own. Franky's calls on the board: ten
 * colourways named after the app's ten club backdrops, Ember by default, and
 * "Living" by default for Otto (the moon laps on the hero and the computer's
 * corner); "Still" stops every idle loop he has.
 *
 * Where it lives: the device keeps it in `localStorage.vibe_otto_look`
 * (use-otto-look.ts, the `vibe_theme` way), and the account keeps a copy in
 * `users.otto_settings.look` (settings.ts). It is a preference, never data
 * about anyone else.
 *
 * Pure: no React, no Next, no `@/` imports, so `node --test` loads it as it is.
 */

/** The ten colourways, in the club backdrops' picker order
 *  (src/lib/orgs/backdrops.ts; look.test.ts keeps the two in step). */
export const OTTO_COLOURS = [
  "dusk",
  "midnight",
  "violet",
  "rose",
  "cardinal",
  "ember",
  "lantern",
  "forest",
  "canal",
  "onyx",
] as const;

export type OttoColour = (typeof OTTO_COLOURS)[number];

/** "still": Otto never moves on his own. "living": the hero and the computer's
 *  corner Otto run their idle loop (the 16 s lap of the moon). Thinking and
 *  working move at every size either way; reduced motion stops everything. */
export const OTTO_MOTIONS = ["still", "living"] as const;
export type OttoMotion = (typeof OTTO_MOTIONS)[number];

export type OttoLook = { colour: OttoColour; motion: OttoMotion };

export const DEFAULT_LOOK: Readonly<OttoLook> = Object.freeze({ colour: "ember", motion: "living" });

/** Device key. Survives sign-out, like `vibe_theme`. */
export const LOOK_STORAGE_KEY = "vibe_otto_look";

/** Fired on `window` by `setOttoLook`, so every Otto on the page repaints. */
export const LOOK_EVENT = "vibe:otto-look";

export function isOttoColour(value: unknown): value is OttoColour {
  return typeof value === "string" && (OTTO_COLOURS as readonly string[]).includes(value);
}

export function isOttoMotion(value: unknown): value is OttoMotion {
  return typeof value === "string" && (OTTO_MOTIONS as readonly string[]).includes(value);
}

/**
 * A stored or sent look, validated field by field: an unknown colour reads as
 * Ember, an unknown motion as Living, anything that isn't an object as the
 * default. Accepts the JSON string the device stores, too. Always a new object.
 */
export function parseLook(raw: unknown): OttoLook {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_LOOK };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_LOOK };
  const r = value as Record<string, unknown>;
  return {
    colour: isOttoColour(r.colour) ? r.colour : DEFAULT_LOOK.colour,
    motion: isOttoMotion(r.motion) ? r.motion : DEFAULT_LOOK.motion,
  };
}

/** The classes a look puts on Otto. `planet` goes on the `.m-otto.m-planet`
 *  span (kit/planet.css draws every `sk-<colour>`). */
export function lookClasses(look: OttoLook): { planet: string } {
  const colour = isOttoColour(look?.colour) ? look.colour : DEFAULT_LOOK.colour;
  return { planet: `sk-${colour}` };
}
