"use client";

import { useEffect, useRef, useState } from "react";

import { DEMO_FILM_FILES, DEMO_MEDIA_BASE } from "@/lib/landing/demo-media";

// The film opens on this very landing page for 1.6 s (inside the landing, a
// mirror in a mirror): the day starts just after it, and loops back there.
const FILM_START = 1.6;
const FILM_END = 29.92;
type Net = Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } };
type Engine = { toggle: () => void; jump: (i: number) => void };
const quiet = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How the "A day on Vibe" film behaves (S72). Real behaviour only:
 * - No film bytes in the page: the file is attached when the screen comes
 *   within 60% of a screen height of view, never sooner.
 * - It plays, muted and inline, only while at least half the screen is in
 *   view and the tab is visible; it pauses otherwise and picks up again.
 * - Reduced motion, Save-Data, or a play() the browser refuses (iPhone Low
 *   Power Mode): nothing starts by itself. The poster stays, Play works, and
 *   Save-Data downloads nothing until it's pressed. With reduced motion the
 *   film plays once per Play and stops on its end card.
 * - A slow line (3G or worse, or under 2 Mb/s) gets the small encode and
 *   fetches only the metadata up front.
 * - A Pause the viewer chose is final: scrolling back doesn't restart it.
 * - `moments[i].t` is where that part of the day is on screen, settled: a
 *   jump lands there, and its row lights from there.
 * - No film for this build (DEMO_MEDIA_BASE null), or a file that won't
 *   play at all: `film` turns false and the poster stands as a still. A
 *   connection dropped mid-film only pauses it: Play tries again.
 */
export function useDayFilm(moments: readonly { t: number }[], posterAt: number) {
  const [film, setFilm] = useState(DEMO_MEDIA_BASE !== null);
  const [playing, setPlaying] = useState(false);
  // The film has put a frame up: the poster goes.
  const [shown, setShown] = useState(false);
  // The moment on screen: the poster's before the film starts.
  const [current, setCurrent] = useState(posterAt);
  const fig = useRef<HTMLElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    const v = video.current, box = screen.current, base = DEMO_MEDIA_BASE;
    if (!film || !v || !box || !base) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const net = (navigator as Net).connection;
    const saveData = Boolean(net?.saveData);
    const slow = ["slow-2g", "2g", "3g"].includes(net?.effectiveType ?? "") || (net?.downlink || 10) < 2;
    let still = motion.matches, want = !still && !saveData, inView = false;
    let live = false, userSeek = false, pending: number | null = null, raf = 0;

    // The 390 encode for a 1x screen, Save-Data or a slow line; the 780 one otherwise.
    const attach = () => {
      if (v.getAttribute("src")) return;
      const px = v.getBoundingClientRect().width * (window.devicePixelRatio || 1);
      v.src = base + (saveData || slow || px <= 440 ? DEMO_FILM_FILES.small : DEMO_FILM_FILES.large);
      // Buffer ahead only for a film about to play by itself on a good line.
      v.preload = want && !slow ? "auto" : "metadata";
    };
    const play = () => {
      attach();
      // After a dropped connection, load the file again and carry on from there.
      if (v.error) { pending = v.currentTime; v.load(); }
      // Belt and braces: some browsers check the property, not the attribute, before refusing autoplay.
      v.muted = true;
      v.play().catch((err: DOMException) => {
        // Refused (Low Power Mode, an autoplay rule): stay on the poster with Play.
        // An AbortError is a pause that came first; a missing file fires "error".
        if (err.name === "NotAllowedError") want = false;
      });
    };
    const seek = (t: number) => {
      if (v.readyState >= 1) v.currentTime = t;
      else pending = t;
    };
    // The moment on screen, how far into it (the row's underline) and the whole film (the strip's line).
    const paint = () => {
      if (!live) return;
      const t = v.currentTime, end = v.duration || FILM_END;
      let i = 0;
      moments.forEach((m, k) => { if (t >= m.t - 0.05) i = k; });
      const from = moments[i].t, next = moments[i + 1]?.t ?? end;
      const clamp = (x: number) => Math.min(1, Math.max(0, x));
      list.current?.style.setProperty("--cp", clamp((t - from) / (next - from)).toFixed(3));
      fig.current?.style.setProperty("--fp", clamp((t - FILM_START) / (end - FILM_START)).toFixed(4));
      setCurrent(i);
    };
    const tick = () => {
      paint();
      raf = v.paused ? 0 : requestAnimationFrame(tick);
    };

    const on: Record<string, () => void> = {
      loadedmetadata: () => {
        v.currentTime = pending ?? Math.max(v.currentTime, FILM_START);
        pending = null;
      },
      playing: () => {
        live = true;
        setShown(true);
        setPlaying(true);
        if (!raf) raf = requestAnimationFrame(tick);
      },
      pause: () => { setPlaying(false); paint(); },
      seeked: () => {
        if (userSeek) { userSeek = false; live = true; setShown(true); }
        paint();
      },
      // Round again from the morning. With reduced motion once is enough: it stays on the end card, Play showing.
      ended: () => {
        if (still) { want = false; return; }
        v.currentTime = FILM_START;
        if (want && inView && !document.hidden) play();
      },
      error: () => {
        // Mid-film, a dropped connection: pause, and Play tries again.
        if (live && v.error?.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) { want = false; setPlaying(false); return; }
        // A file that won't play: the still. Focus on a part of the day would fall to the page with its button.
        if (heading.current?.parentElement?.contains(document.activeElement)) heading.current.focus({ preventScroll: true });
        setFilm(false);
        setShown(false);
        setCurrent(posterAt);
      },
    };
    for (const [type, fn] of Object.entries(on)) v.addEventListener(type, fn);

    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      attach();
      near.disconnect();
    }, { rootMargin: "60% 0px" });
    if (want) near.observe(box);
    const seen = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting && e.intersectionRatio >= 0.5;
      if (inView && want && !document.hidden) play();
      else if (!inView && !v.paused) v.pause();
    }, { threshold: [0, 0.5] });
    seen.observe(box);
    const onVisibility = () => {
      if (document.hidden) v.pause();
      else if (inView && want) play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onMotion = () => {
      still = motion.matches;
      if (still) { want = false; v.pause(); }
    };
    motion.addEventListener("change", onMotion);

    engine.current = {
      toggle: () => {
        want = v.paused;
        if (!want) { v.pause(); return; }
        if (v.ended) v.currentTime = FILM_START;
        play();
      },
      // A part of the day: the film goes to that screen. It plays from there once it is in view; with
      // reduced motion it shows that frame and waits for Play.
      jump: (i) => {
        attach();
        userSeek = true;
        seek(moments[i].t);
        setCurrent(i);
        if (still) return;
        want = true;
        if (inView && !document.hidden) play();
      },
    };
    return () => {
      engine.current = null;
      cancelAnimationFrame(raf);
      near.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      for (const [type, fn] of Object.entries(on)) v.removeEventListener(type, fn);
    };
  }, [film, moments, posterAt]);

  // Brings the film into view. Measured from its place in the layout
  // (offsetTop), not its box: the rise's transform would land a scroll up to
  // 56px off. "top": just under the top of the screen. Otherwise only when
  // less than half of it shows, and only as far as it takes to show it whole.
  const bring = (top: boolean) => {
    const el = fig.current;
    if (!el) return;
    let y = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    const gap = 24, vh = window.innerHeight, h = el.offsetHeight, now = window.scrollY;
    if (!top && Math.min(y + h, now + vh) - Math.max(y, now) >= h * 0.5) return;
    const to = top || y < now || h + 2 * gap > vh ? y - gap : y + h + gap - vh;
    window.scrollTo({ top: to, behavior: quiet() ? "auto" : "smooth" });
  };
  const toggle = () => engine.current?.toggle();
  // A part of the day from the list. A tap or a click also brings the film into view; a key press
  // doesn't, so the focused row stays on screen (its aria-current says what changed).
  const jump = (i: number, pointer: boolean) => {
    engine.current?.jump(i);
    if (pointer) bring(false);
  };
  // A panel's "watch it" link: the film goes there and comes up under the top of the screen, and
  // takes focus, so the next Tab is Play/Pause.
  const watch = (i: number) => {
    engine.current?.jump(i);
    bring(true);
    fig.current?.focus({ preventScroll: true });
  };
  return { film, playing, shown, current, fig, screen, video, list, heading, toggle, jump, watch };
}
