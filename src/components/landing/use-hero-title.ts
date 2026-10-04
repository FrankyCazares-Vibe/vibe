"use client";

import { useEffect, type RefObject } from "react";

import { playSketch, type Clock } from "./title-sketch";

export type Ending = { text: string; rgb: string; hold: number };

// The roll (landing.css): the word on show rises out (0.3 s), then the next rises in (0.6 s).
const ROLL_MS = 900;
/** The old word is gone by then: it goes back below, and the hairline takes the new word's colour. */
const OUT_MS = 400;
/** Back on screen, or in the tab again: the word on show stays this long first. */
const RESUME_MS = 1600;
/** Rounds of the four endings before it settles on "your campus." for good (WCAG 2.2.2). */
const ROUNDS = 2;
/** The hairline draws itself in as the last letters land. */
const RAIL_AT = 1000, RAIL_MS = 560;
/** A spark runs the hairline once in a word's hold, ms after it lands, and never sooner than SPARK_GAP after the last. */
const SPARK_AFTER = [600, 2000], SPARK_GAP = 4200, SPARK_MS = 1100, SPARK_TAIL = 48;

/**
 * The headline's life after the CSS entrance (hero-title.tsx): the sketch
 * over the entrance, the rotating ending, the hairline and its spark. Plain
 * timers and CSS transitions; the only things it animates are transforms and
 * opacity. Everything stops while the headline is off screen or the tab is
 * hidden; after ROUNDS rounds it settles on "your campus." and stays; with
 * reduced motion nothing starts (or it all stops, if the setting changes):
 * the still headline, "your campus.".
 */
export function useHeroTitle(ref: RefObject<HTMLHeadingElement | null>, endings: readonly Ending[], clock: Clock) {
  useEffect(() => {
    const h1 = ref.current, motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const slot = h1?.querySelector<HTMLElement>(".vln-slot"), sky = h1?.querySelector<HTMLElement>(".vln-sketch");
    const rail = slot?.querySelector<HTMLElement>(".vln-rail"), line = rail?.querySelector<HTMLElement>("i"), spark = rail?.querySelector<HTMLElement>("b");
    if (!h1 || !slot || !sky || !rail || !line || !spark || motion.matches) return;
    const words = Array.from(slot.querySelectorAll<HTMLElement>(":scope > em"));
    const letters = h1.querySelectorAll(".vln-c");
    // How far the CSS entrance has got, or null when it isn't running: over, or a browser
    // without the `scripting` media feature, which shows the letters still (landing.css).
    const entrance = () => {
      const a = letters[letters.length - 1]?.getAnimations()[0];
      return a && a.currentTime !== null ? Number(a.currentTime) : null;
    };
    const end = clock.t0 + (letters.length - 1) * clock.dt + clock.fade;
    const begun = entrance() ?? end;

    let at = 0, rolls = 0, running = !document.hidden, seen = true, dead = false, lastSpark = -Infinity, width = h1.offsetWidth;
    let rollTimer = 0, sparkTimer = 0, sparkRun: Animation | null = null, dim: Animation | null = null;
    const outs = new Set<number>(), sketch: Animation[] = [];
    const now = () => performance.now();

    // The hairline runs a little past each end of the slot; it shrinks to the word on show.
    const reach = () => words[at].offsetWidth + rail.offsetWidth - slot.offsetWidth;
    const fit = () => {
      if (rail.offsetWidth) slot.style.setProperty("--rw", (reach() / rail.offsetWidth).toFixed(4));
    };
    const tint = () => slot.style.setProperty("--c", endings[at].rgb);
    // The hairline dims while the words change over (the new one's descenders pass through it).
    const hush = () => {
      dim = line.animate([{ opacity: 1 }, { opacity: 0.3, offset: 0.2 }, { opacity: 0.3, offset: 0.7 }, { opacity: 1 }], { duration: ROLL_MS, easing: "ease" });
    };
    const fire = () => {
      const to = reach() - SPARK_TAIL + 12;
      sparkRun = spark.animate(
        [{ transform: `translateX(${-SPARK_TAIL}px)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { transform: `translateX(${to}px)`, opacity: 0 }],
        { duration: SPARK_MS, easing: "cubic-bezier(.45,0,.55,1)" },
      );
    };
    // The next roll after this word's hold, and a spark in the hold if one fits before it and it's time.
    // Once the last round is back on "your campus.", nothing more: no roll, no spark.
    const plan = (toLand: number, hold: number) => {
      if (rolls >= words.length * ROUNDS) return;
      rollTimer = window.setTimeout(roll, toLand + hold);
      for (const after of SPARK_AFTER) {
        if (after + SPARK_MS + 150 > hold) break;
        if (now() + toLand + after - lastSpark < SPARK_GAP) continue;
        lastSpark = now() + toLand + after;
        sparkTimer = window.setTimeout(fire, toLand + after);
        break;
      }
    };
    function roll() {
      const from = words[at];
      at = (at + 1) % words.length;
      rolls += 1;
      from.removeAttribute("data-on");
      from.setAttribute("data-out", "");
      words[at].removeAttribute("data-out");
      words[at].setAttribute("data-on", "");
      fit();
      hush();
      // Once the old word is out of sight it waits below again (no transition: landing.css), and
      // the hairline turns the new word's colour, at once: a colour transition can't run off the main thread.
      const t = window.setTimeout(() => { from.removeAttribute("data-out"); tint(); outs.delete(t); }, OUT_MS);
      outs.add(t);
      plan(ROLL_MS, endings[at].hold);
    }
    const pause = () => {
      window.clearTimeout(rollTimer);
      window.clearTimeout(sparkTimer);
      sparkRun?.cancel();
    };
    const sync = () => {
      const on = seen && !document.hidden && !dead;
      if (on === running) return;
      running = on;
      if (on) plan(0, rolls ? RESUME_MS : endings[0].hold);
      else pause();
    };

    words[0].setAttribute("data-on", "");
    h1.setAttribute("data-live", "");
    tint();
    fit();
    // The first fit is instant, not a transition from full width.
    line.getAnimations().forEach((a) => a.finish());
    const draw = rail.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { delay: Math.max(0, RAIL_AT - begun), duration: RAIL_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "backwards" });
    // Opened in a background tab: nothing is scheduled until it's shown (sync).
    if (running) {
      rollTimer = window.setTimeout(roll, Math.max(RESUME_MS, end - begun + endings[0].hold));
      const first = Math.max(SPARK_AFTER[0], RAIL_AT + RAIL_MS + 400 - begun);
      lastSpark = now() + first;
      sparkTimer = window.setTimeout(fire, first);
    }

    const clear = () => { sketch.forEach((a) => a.cancel()); sketch.length = 0; sky.replaceChildren(); };
    // The sketch needs the real letters to measure; it draws only the lines of it still to come.
    document.fonts.ready.then(() => {
      const t = entrance();
      if (dead || t === null) return;
      sketch.push(...playSketch(h1, sky, clock, t));
      Promise.all(sketch.map((a) => a.finished)).then(clear, () => {});
    });

    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; sync(); });
    io.observe(h1);
    // A new width moves every letter: the sketch goes; the hairline fits the word again.
    const ro = new ResizeObserver(() => {
      if (!dead) fit();
      if (h1.offsetWidth !== width) { width = h1.offsetWidth; clear(); }
    });
    ro.observe(h1);
    ro.observe(slot);
    const stop = () => {
      dead = true;
      pause();
      outs.forEach((t) => window.clearTimeout(t));
      dim?.cancel();
      draw.cancel();
      clear();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", onMotion);
      h1.removeAttribute("data-live");
      for (const w of words) { w.removeAttribute("data-on"); w.removeAttribute("data-out"); }
      slot.style.removeProperty("--c");
      slot.style.removeProperty("--rw");
    };
    const onMotion = () => { if (motion.matches) stop(); };
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", onMotion);
    return stop;
  }, [ref, endings, clock]);
}
