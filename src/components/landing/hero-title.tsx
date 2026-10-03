"use client";

import { Fragment, useRef, type CSSProperties } from "react";

import { useHeroTitle, type Ending } from "./use-hero-title";

/**
 * The hero's headline (S72, the founders' mix of two prototypes): the
 * constellation entrance on load, then the rotating ending.
 *
 * - Entrance: each letter fades up in reading order, its word rising a
 *   little (landing.css, CSS only, so the headline never waits for the
 *   page's JavaScript: readable by about 1.1 s). use-hero-title lays points
 *   of light on the letters' tips and hairlines between them over whatever
 *   part of it is still to come when it starts (title-sketch.ts).
 * - Ending: "your campus." rolls to clubs, events, people and back, each in
 *   its kind's colour, with a faint hairline under it that follows the word
 *   and a spark that runs it now and then. After two rounds it settles on
 *   "your campus." and stays (use-hero-title ROUNDS).
 * - Every letter is in the server markup (no splitting after load), and the
 *   endings share one grid cell sized to the widest, so nothing ever moves
 *   the layout. Screen readers hear one sentence, "The social app for your
 *   campus."; everything drawn is aria-hidden.
 * - Reduced motion, or no JavaScript: the plain still headline, nothing drawn.
 */

/** Campus holds longest: it's the line. Colours: the sky's kinds (home-landing KINDS). */
const ENDINGS: readonly Ending[] = [
  { text: "your campus.", rgb: "255,92,53", hold: 3600 },
  { text: "your clubs.", rgb: "255,92,53", hold: 2200 },
  { text: "your events.", rgb: "246,196,104", hold: 2200 },
  { text: "your people.", rgb: "150,186,255", hold: 2200 },
];
const LEAD = "The social app for";
/** The entrance's clock, in ms: the first letter starts at t0, each next one dt later, and takes `fade`. */
const ENTRANCE = { t0: 240, dt: 20, fade: 420 } as const;

type Word = { text: string; at: number };
/** The words of a line, each with the index of its first letter in the whole headline. */
function wordsOf(text: string, from: number): Word[] {
  let at = from;
  return text.split(" ").map((t) => {
    const word = { text: t, at };
    at += t.length;
    return word;
  });
}
const LEAD_WORDS = wordsOf(LEAD, 0);
const END_WORDS = wordsOf(ENDINGS[0].text, LEAD.replaceAll(" ", "").length);

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Words as inline-blocks of letters. The empty <i> sits on the baseline: title-sketch measures from it. */
function Letters({ words }: { words: Word[] }) {
  return words.map((w, k) => (
    <Fragment key={w.at}>
      {k ? " " : null}
      <span className="vln-w" style={i(w.at)}>
        <i className="vln-bl" />
        {Array.from(w.text, (c, j) => <span key={j} className="vln-c" style={i(w.at + j)}>{c}</span>)}
      </span>
    </Fragment>
  ));
}

export function HeroTitle() {
  const h1 = useRef<HTMLHeadingElement>(null);
  useHeroTitle(h1, ENDINGS, ENTRANCE);
  const clock = { "--t0": `${ENTRANCE.t0}ms`, "--dt": `${ENTRANCE.dt}ms`, "--fade": `${ENTRANCE.fade}ms` } as CSSProperties;

  return (
    <h1 ref={h1} className="vln-title" style={clock}>
      <span className="vln-sr-only">{`${LEAD} ${ENDINGS[0].text}`}</span>
      <span aria-hidden="true">
        <Letters words={LEAD_WORDS} />{" "}
        <span className="vln-slot">
          {ENDINGS.map((e, k) => (
            <em key={e.text} style={{ "--c": e.rgb } as CSSProperties}>
              {k ? e.text : <Letters words={END_WORDS} />}
            </em>
          ))}
          <span className="vln-rail"><i /><b /></span>
        </span>
        {/* The entrance's points and lines go here (title-sketch.ts); React never renders into it. */}
        <span className="vln-sketch" />
      </span>
    </h1>
  );
}
