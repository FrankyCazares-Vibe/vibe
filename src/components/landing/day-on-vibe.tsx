"use client";

import { useImperativeHandle, type CSSProperties, type Ref } from "react";

import { useDayFilm } from "./use-day-film";

export type MomentId = "morning" | "midday" | "afternoon" | "evening" | "later" | "night" | "bed";

/**
 * The day in the demo film. Parts of the day, never clock times: the film
 * shows its own. `t` is where that part is on screen in the film, settled
 * (in seconds: past the tap and the slide that bring it up), so a jump lands
 * on the screen itself; the colour runs from morning gold to night blue,
 * like the sky above.
 */
export const MOMENTS: readonly { id: MomentId; part: string; what: string; t: number; rgb: string }[] = [
  { id: "morning", part: "Morning", what: "Catch up on the feed", t: 2, rgb: "246,196,104" },
  { id: "midday", part: "Midday", what: "See who’s around", t: 5.1, rgb: "255,224,170" },
  { id: "afternoon", part: "Afternoon", what: "Tonight’s plans", t: 9, rgb: "255,146,124" },
  { id: "evening", part: "Evening", what: "Your clubs", t: 11.45, rgb: "255,92,53" },
  { id: "later", part: "Later", what: "The club chat", t: 16.8, rgb: "196,178,255" },
  { id: "night", part: "Night", what: "“you going?”", t: 20.1, rgb: "150,186,255" },
  { id: "bed", part: "Before bed", what: "Your page", t: 25.3, rgb: "132,150,255" },
];
// The poster is the Chess Club chat at 18.6 s: the film's one screen with no
// crimson bar and no photo, so the poster can be the whole screen.
const POSTER_AT = MOMENTS.findIndex((m) => m.id === "later");
const POSTER = "/landing/film-poster";
const POSTER_SIZES = "(min-width: 760px) 320px, 70vw";

export type DayHandle = { watch: (id: MomentId) => void };

/**
 * 04 · A day on Vibe (S72). Big type over a hairline list of the day's
 * moments, and the demo film in a phone-screen readout beside it (under the
 * list on a phone). Each moment is a button that takes the film there, and
 * the one playing lights up, in the list and in the readout's own foot, so a
 * phone that shows only the film still says which part of the day it is.
 * The film's hosting and behaviour are in use-day-film.ts; with no film for
 * this build the poster stands as a still, labelled as the part it shows.
 */
export function DayOnVibe({ ref }: { ref?: Ref<DayHandle> }) {
  const { film, playing, shown, current, fig, screen, video, list, heading, toggle, jump, watch } = useDayFilm(MOMENTS, POSTER_AT);
  useImperativeHandle(ref, () => ({ watch: (id) => watch(MOMENTS.findIndex((m) => m.id === id)) }));
  const now = MOMENTS[current];

  return (
    <section id="vln-day" className="vln-day" aria-labelledby="vln-day-title" style={{ "--rgb": now.rgb } as CSSProperties}>
      {/* tabIndex -1: focus comes here if the film fails while a part of the day has it. */}
      <h2 ref={heading} id="vln-day-title" className="vln-rise" tabIndex={-1}>A day on Vibe.</h2>

      <ol ref={list} className="vln-day-list vln-rise" aria-label={film ? "Parts of the day: each one plays in the film" : "Parts of the day"}>
        {MOMENTS.map((m, i) => {
          const row = <><b>{m.part}</b><span>{m.what}</span></>;
          return (
            <li key={m.id} style={{ "--rgb": m.rgb } as CSSProperties}>
              {film ? (
                // e.detail is 0 for Enter and Space: the page stays put, so the focused row stays on screen.
                <button type="button" aria-current={current === i ? "true" : undefined} onClick={(e) => jump(i, e.detail !== 0)}>{row}</button>
              ) : (
                <div className="vln-day-row" data-on={current === i || undefined}>{row}</div>
              )}
            </li>
          );
        })}
      </ol>

      <figure ref={fig} id="vln-film" className="vln-film vln-rise" data-lag={1} data-playing={playing || undefined} tabIndex={-1}>
        <figcaption className="vln-film-head">
          <i aria-hidden="true" />
          <span>Real app</span>
          <span aria-hidden="true">·</span>
          <span>Sample accounts</span>
        </figcaption>
        <div ref={screen} className="vln-film-screen">
          {film ? (
            <video
              ref={video}
              muted
              playsInline
              preload="none"
              width={780}
              height={1688}
              disablePictureInPicture
              disableRemotePlayback
              // Hidden from screen readers: until it has a file, Chrome names any video "Unable to play
              // media.", whatever its aria-label. The description after it and Play/Pause speak for it.
              aria-hidden="true"
            />
          ) : null}
          <picture className="vln-film-poster" data-off={shown || undefined}>
            <source type="image/avif" srcSet={`${POSTER}-390.avif 390w, ${POSTER}-780.avif 780w`} sizes={POSTER_SIZES} />
            <source type="image/webp" srcSet={`${POSTER}-390.webp 390w, ${POSTER}-780.webp 780w`} sizes={POSTER_SIZES} />
            <img
              src={`${POSTER}-780.jpg`}
              width={780}
              height={1688}
              loading="lazy"
              decoding="async"
              // With the film, the description after it speaks for it; as a still, the picture speaks.
              alt={film ? "" : "The Chess Club chat in Vibe: a poll on what to play next week, and members’ replies about Blitz Night."}
            />
          </picture>
        </div>
        {film ? (
          // Read once, in place, right after the film: no aria-describedby, so it isn't heard twice.
          <p className="vln-sr-only">
            A silent screen recording of Vibe on a phone, about half a minute long. Morning: the campus feed. Midday: a
            friend’s profile. Afternoon: the Events tab, with Blitz Night by Chess Club marked Going. Evening: the clubs
            you follow, a club’s page, then the messages inbox. Later: the Chess Club chat, with a poll on what to play
            next week. Night: a direct message, “hey are you going to blitz night tonight?” Before bed: your own profile.
            It ends on the Vibe wordmark.
          </p>
        ) : null}
        {film ? <span className="vln-film-track" aria-hidden="true"><i /></span> : null}
        <div className="vln-film-foot">
          {film ? (
            <button type="button" className="vln-film-toggle" data-state={playing ? "playing" : "paused"} aria-label={playing ? "Pause the film" : "Play the film"} onClick={toggle}>
              {playing ? "Pause" : "Play"}
            </button>
          ) : null}
          {/* The part of the day on screen. Hidden from screen readers: the list's aria-current says it. */}
          <p className="vln-film-now" aria-hidden="true"><b>{now.part}</b><span>{now.what}</span></p>
        </div>
      </figure>

      {/* As a still there is no one to play anyone: the second sentence goes with the film. */}
      <p className="vln-day-note vln-rise">The real app with sample accounts.{film ? " The three founders play themselves." : ""}</p>
    </section>
  );
}
