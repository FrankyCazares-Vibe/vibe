"use client";

import "../kit/sky.css";
import "../kit/motion.css";

import { useEffect, useRef, useState, type RefObject } from "react";

import { reducedMotion, useDeskDone } from "@/lib/motion/feedback";
import { DEFAULT_LOOK, isOttoColour, type OttoColour } from "@/lib/otto/look";
import { useOttoLook } from "@/lib/otto/use-otto-look";

import { OttoPlanet } from "../planet/OttoPlanet";

/**
 * The desk's sky header (Nov 10, 2026, the Otto build's Wave 2A; board D1 and
 * D3). A warm sky in the person's colourway (their Otto look), still grain,
 * stars and orbit rings, Otto in it, his one lowercase line, soft hills at
 * the bottom where the sky meets the paper.
 *
 * - `tall`: the phone's header (Otto 96px, his line on the left).
 * - `short`: the folded phone bar (Otto 28px, "otto." and a short note).
 * - `band`: the computer's rounded strip (Otto 96px on the right).
 *
 * Otto is the only thing that moves (his look decides whether he idles), and
 * only while the sky is on screen: an IntersectionObserver drops `live` when
 * it scrolls away, so a folded-away sky costs nothing. The 28px Otto never
 * moves. Reduced motion stops all of it (planet.css). Decorative except for
 * his line, which is plain text.
 *
 * Motion 1 (Nov 12): after a success on the desk (feedback.ts) Otto goes
 * "done" for ~1.2 s, then back to rest; when his line changes it crossfades
 * (the old line fades under the new one; instant under reduced motion).
 */

export type OttoSkyProps = {
  variant: "tall" | "short" | "band";
  /** Otto's lowercase line (tall and band). */
  say: string;
  /** The folded bar's short note, e.g. "2 ready for you" (short only). */
  note?: string;
  /** Overrides the person's own colourway (previews). */
  colour?: OttoColour;
  className?: string;
  id?: string;
};

/** Whether `el` is on screen; true until the observer says otherwise (and where there is none). */
function useOnScreen(ref: RefObject<HTMLElement | null>, enabled: boolean, rootMargin?: string): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setOnScreen(last.isIntersecting);
      },
      rootMargin ? { rootMargin } : undefined,
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled, rootMargin]);
  return onScreen;
}

/** The line now, and the one fading out under it for a moment after a change. */
function useCrossfade(say: string): { now: string; was: string | null; n: number } {
  const [state, setState] = useState<{ now: string; was: string | null; n: number }>({ now: say, was: null, n: 0 });
  if (state.now !== say) setState({ now: say, was: reducedMotion() ? null : state.now, n: state.n + 1 });
  const { was, n } = state;
  useEffect(() => {
    if (was === null) return;
    const t = window.setTimeout(() => setState((s) => (s.n === n ? { ...s, was: null } : s)), 320);
    return () => window.clearTimeout(t);
  }, [was, n]);
  return state;
}

export function OttoSky({ variant, say, note, colour, className, id }: OttoSkyProps) {
  const look = useOttoLook();
  const skin = isOttoColour(colour) ? colour : isOttoColour(look.colour) ? look.colour : DEFAULT_LOOK.colour;
  const ref = useRef<HTMLElement>(null);
  // The phone's tall sky counts as gone once it is under the folded bar
  // (60px plus a little top inset), so Otto stops when the bar covers him.
  const onScreen = useOnScreen(ref, variant !== "short", variant === "tall" ? "-72px 0px 0px 0px" : undefined);
  const done = useDeskDone();
  const line = useCrossfade(say);

  const classes = ["tx-host", "dk-sky", `sky-${skin}`];
  if (variant !== "tall") classes.push(variant);
  if (className) classes.push(className);

  if (variant === "short") {
    return (
      <header ref={ref} id={id} className={classes.join(" ")}>
        <i className="tx tx-sky" aria-hidden="true" />
        <i className="tx tx-grain" aria-hidden="true" />
        <i className="tx tx-stars" aria-hidden="true" />
        <OttoPlanet size={28} colour={skin} state={done ? "done" : "rest"} />
        <span className="dk-sky-name">
          otto<i>.</i>
        </span>
        {note ? <span className="dk-sky-note">{note}</span> : null}
        <i className="gr gr-hills" aria-hidden="true" />
      </header>
    );
  }

  return (
    <header ref={ref} id={id} className={classes.join(" ")}>
      <i className="tx tx-sky" aria-hidden="true" />
      <i className="tx tx-grain" aria-hidden="true" />
      <i className="tx tx-stipple" aria-hidden="true" />
      <i className="tx tx-stars" aria-hidden="true" />
      <div className="tx-host dk-sky-orbit" aria-hidden="true">
        <i className="tx tx-orbit" />
        <OttoPlanet size={96} colour={skin} live={onScreen} state={done ? "done" : "rest"} />
      </div>
      <p className="dk-sky-say dk-say-stack">
        {line.was !== null ? (
          <span className="dk-say-out" aria-hidden="true">
            {line.was}
          </span>
        ) : null}
        <span key={line.n} className={line.n > 0 ? "dk-say-in" : undefined}>
          {line.now}
        </span>
      </p>
      <i className="gr gr-hills" aria-hidden="true" />
    </header>
  );
}
