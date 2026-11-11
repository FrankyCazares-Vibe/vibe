"use client";

import "../kit/planet.css";

import { DEFAULT_LOOK, isOttoColour, type OttoColour } from "@/lib/otto/look";
import { useOttoLook } from "@/lib/otto/use-otto-look";

/**
 * Otto, drawn as Planet (Nov 10, 2026, the Otto build's Wave 1): an ember
 * sphere with two eyes, an open tilted ring and a coral moon that orbits
 * behind and in front of him. Every Otto in the app draws through this one
 * component; the static pages copy its markup (PLANET_PARTS order) and its
 * CSS (kit/planet.css).
 *
 * - `size` in px sets the square span; the CSS reads it as a container, so
 *   24 and 28px get their own whole-pixel drawing.
 * - `state`: rest (no class), think, work, done, fail, wait.
 * - `live` asks for the idle loop (the moon's 16 s lap, a bob, a blink). It
 *   only shows when the person's look is "living", and never below 40px:
 *   the tab-bar and left-menu Otto (24/28px) is always still. Thinking and
 *   working move at every size; reduced motion stops all of it.
 * - `colour` overrides the person's own colourway (use-otto-look).
 * - `onLight` keeps the Light drawing (dark ring) on a light surface in Night.
 *
 * Decorative: aria-hidden. The control around him carries the name.
 */

export type OttoState = "rest" | "think" | "work" | "done" | "fail" | "wait";

/** The parts in document order (m-tex and m-face sit inside m-body, the two
 *  eyes inside m-face). The static twins in public/html keep this order. */
export const PLANET_PARTS = [
  "m-aura",
  "m-x1",
  "m-body",
  "m-tex",
  "m-face",
  "m-eye l",
  "m-eye r",
  "m-x2",
  "m-x3",
  "m-mark",
] as const;

/** Below this the CSS draws the still, whole-pixel Otto and m-live is never set. */
const LIVE_MIN_SIZE = 40;

export type OttoPlanetProps = {
  size: number;
  state?: OttoState;
  live?: boolean;
  colour?: OttoColour;
  onLight?: boolean;
  className?: string;
  id?: string;
};

export function OttoPlanet({ size, state = "rest", live = false, colour, onLight, className, id }: OttoPlanetProps) {
  const look = useOttoLook();
  const skin = isOttoColour(colour) ? colour : isOttoColour(look.colour) ? look.colour : DEFAULT_LOOK.colour;
  const isLive = live && look.motion === "living" && size >= LIVE_MIN_SIZE;
  const classes = ["m-otto", "m-planet", `sk-${skin}`];
  if (isLive) classes.push("m-live");
  if (state !== "rest") classes.push(state);
  if (onLight) classes.push("on-light");
  if (className) classes.push(className);
  return (
    <span id={id} className={classes.join(" ")} aria-hidden="true" style={{ width: size, height: size }}>
      <i className="m-aura" />
      <i className="m-x1" />
      <i className="m-body">
        <i className="m-tex" />
        <i className="m-face">
          <i className="m-eye l" />
          <i className="m-eye r" />
        </i>
      </i>
      <i className="m-x2" />
      <i className="m-x3" />
      <i className="m-mark" />
    </span>
  );
}
