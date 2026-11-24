"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { ART_EXTRA } from "./art-data";
import { FALL, FOLLOW, leaves } from "./coral-drop";

/**
 * The collapse (travel prototype B; Franky, Nov 23: "scrolling should feel like travelling through your solar system").
 * One gesture: as the full stop falls from "before you sign up." into the sun of "vibe.", the close's own little system
 * gathers onto that sun, and settles into its ink as the full stop lands.
 *
 * The moving orbits are the close's hand-drawn rings themselves, as lines: each ring's own centreline (the same wobble,
 * the same tilt), taken from the hand library as the board draws it and checked against the ink it filled (the board's
 * orbit-lines.mjs, ART_EXTRA.close.*.orbits), at that ring's own measured width, with its four planets. They're cream
 * strokes that never thicken as they scale (a non-scaling stroke), and the planets never grow (round ends of
 * zero-length lines). The filled ink (close-back, close-front) is never moved or scaled: it's hidden while the lines
 * move, and shown again as they settle.
 *
 * - Before the close is near the screen, nothing is drawn.
 * - From when it is, until the drop takes off from "sign up.", the system waits faintly (WAITING of PEAK), as wide as
 *   the screen allows (GUTTER inside its edges, CLEAR of the last answer and the buttons, at most MOST times its size).
 * - As the drop falls, the lines come up to PEAK and gather: scale 1 + (S - 1)(1 - p), where p is the drop's own fall
 *   (coral-drop.tsx: its schedule from "fys-measure", its slow-then-fast curve FALL and its lag FOLLOW), so the rings
 *   and the dot speed up together. They wait just short of home (WAIT) until the drop lands, and are home on its
 *   landing frame.
 * - The landing settles the line into ink: the ink fades in as the lines fade out, over about 200 ms (system.css), and
 *   then the close is exactly today's, with no inline style left.
 * - Taking off again, the rings hold at home while the ink thins into its line (the line up in 60 ms, the ink gone in
 *   100 ms: system.css), and only once the ink's own fade has finished do they ease out after the drop, with its lag.
 *   So a ring never shows twice: the ink is gone before the line leaves its path, however slow the frames. They pick
 *   that lag up over PICKUP (from still to the drop's rate, easing in), so they don't lurch out after the hold.
 *
 * Free scrolling, no snapping. While p moves, one rAF a frame writes one transform and one opacity; once it's still,
 * nothing runs. Without JavaScript or with reduced motion the lines aren't even on the page.
 */
/** The lines' brightest; how bright they wait before the drop takes off (a share of PEAK); and how far into the fall
 *  (p) they're fully up. */
const PEAK = 0.85, WAITING = 0.35, UP = 0.1;
/** At their widest they stay this far (px) inside the screen's edges, clear of the last answer and the buttons, and
 *  never grow past MOST times their size. */
const GUTTER = 16, CLEAR = 32, MOST = 4;
/** Until the drop has landed, they wait just short of home. */
const WAIT = 0.99;
/** They're drawn from this share of a screen before the close comes into view, so the page never scrolls onto a gap. */
const AHEAD = 0.25;
/** The settle (system.css: 200 ms) and a little more, after which the close is today's again. */
const SETTLE_MS = 260;
/** Taking off: the rings hold at home until the ink has thinned into the line (system.css: 100 ms), and never longer
 *  than this (ms). */
const LIFT_MAX = 300;
/** Then they pick up the drop's lag gently: their follow rate eases in from 0 to FOLLOW over this long (ms), so they
 *  don't lurch out from home after the hold. */
const PICKUP = 100;

const LAYOUTS = [["desktop", "fys-orbits-d"], ["phone", "fys-orbits-p"]] as const;
type Layout = (typeof LAYOUTS)[number][0];
type State = "" | "on" | "lift" | "home";
const em = (v: number) => `${+v.toFixed(5)}em`;

/** One layout's lines, as SVG (board px, scaled to em), and its points around the sun with what doesn't scale (half a
 *  ring's line, a planet's radius), for fitting it to the screen. */
function lines(v: Layout, cls: string, parent: SVGGElement) {
  const NS = "http://www.w3.org/2000/svg", { F, orbits } = ART_EXTRA.close[v], pts: [number, number, number][] = [];
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", cls);
  g.setAttribute("transform", `scale(${+(1 / F).toFixed(7)})`);
  const line = (d: string, width: number, cls?: string) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.style.strokeWidth = em(width / F);
    if (cls) p.setAttribute("class", cls);
    g.appendChild(p);
  };
  orbits.d.forEach((d, i) => {
    line(d, orbits.w[i]);
    const n = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    let x = n[0], y = n[1];
    pts.push([x, y, orbits.w[i] / 2]);
    for (let k = 2; k + 1 < n.length; k += 2) { x += n[k]; y += n[k + 1]; pts.push([x, y, orbits.w[i] / 2]); }
  });
  for (const [x, y, r] of orbits.planets) { line(`M${x} ${y}h0`, 2 * r, "fys-planet"); pts.push([x, y, r]); }
  parent.appendChild(g);
  return { F, pts };
}

export function CollapseRings({ style }: { style: CSSProperties }) {
  const svg = useRef<SVGSVGElement>(null);
  const zoom = useRef<SVGGElement>(null);
  useEffect(() => {
    const el = svg.current, g = zoom.current, big = el?.closest<HTMLElement>(".fys-big"), close = big?.closest<HTMLElement>(".fys-close");
    const root = close?.closest<HTMLElement>(".fys-root"), orb = big?.querySelector<HTMLElement>(".fys-orb");
    if (!el || !g || !big || !close || !root || !orb || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const answers = root.querySelector<HTMLElement>(".fys-faq-list"), buttons = close.querySelector<HTMLElement>(".fys-row");
    const ink = close.querySelector<HTMLElement>(".fys-close-back");
    // the lines go on the page only now, with JavaScript and motion (both layouts; system.css shows one)
    const shape = Object.fromEntries(LAYOUTS.map(([v, cls]) => [v, lines(v, cls, g)])) as Record<Layout, ReturnType<typeof lines>>;
    const wide = window.matchMedia("(min-width: 900px)");

    // s0: the drop leaves "sign up."; s1: it lands in the sun; S: the system at its widest, and [top, bottom] its page
    // extent then; p: how far the drop has fallen, as shown (0 to 1; 1 is home)
    // freed: when the take-off's hold ended (0 until it has), for the pick-up
    let s0 = 0, s1 = 0, S = 1, top = 0, bottom = 0, p = 0, raf = 0, last = 0, settleT = 0, lifted = 0, lifts = 0, freed = 0;
    let ready = false, gone = false, thinned = true, state: State = "", drawn = "";
    const ramp = (q: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (q - a) / (b - a))); return t * t * (3 - 2 * t); };
    const here = () => orb.hasAttribute("data-here");
    const target = () => {
      const s = window.scrollY;
      return s1 - s0 < 1 ? (s >= s1 ? 1 : 0) : Math.pow(Math.min(1, Math.max(0, (s - s0) / (s1 - s0))), FALL);
    };
    // just taken off: still home, until the ink has thinned into the line
    const held = () => state === "lift" && !thinned && performance.now() - lifted < LIFT_MAX;
    // home the moment the drop is (and for that hold); until then, never quite
    const goal = () => (here() || held() ? 1 : Math.min(WAIT, target()));
    const near = () => { const s = window.scrollY, vh = window.innerHeight; return top < s + vh * (1 + AHEAD) && bottom > s - vh * AHEAD; };

    // the widest the system can be: every point of it, scaled from the sun, plus what doesn't scale, inside the screen's
    // edges and clear of the last answer and the buttons
    const fit = () => {
      const { F, pts } = shape[wide.matches ? "desktop" : "phone"], k = parseFloat(getComputedStyle(big).fontSize) / F;
      const b = big.getBoundingClientRect(), W = document.documentElement.clientWidth;
      // the sun's centre (offsets ignore its landing bounce)
      const cx = b.left + orb.offsetLeft + orb.offsetWidth / 2, cy = b.top + orb.offsetTop + orb.offsetHeight / 2;
      const up = answers ? answers.getBoundingClientRect().bottom + CLEAR : -Infinity, down = buttons ? buttons.getBoundingClientRect().top - CLEAR : Infinity;
      let most = MOST, lo = 0, hi = 0;
      for (const [x, y, pad] of pts) {
        const dx = x * k, dy = y * k, q = pad * k;
        if (dx > 0) most = Math.min(most, (W - GUTTER - q - cx) / dx);
        if (dx < 0) most = Math.min(most, (cx - GUTTER - q) / -dx);
        if (dy < 0) most = Math.min(most, (cy - q - up) / -dy);
        if (dy > 0) most = Math.min(most, (down - q - cy) / dy);
      }
      S = Math.max(1, most);
      for (const [, y, pad] of pts) { lo = Math.min(lo, (y * S - pad) * k); hi = Math.max(hi, (y * S + pad) * k); }
      top = cy + window.scrollY + lo; bottom = cy + window.scrollY + hi;
    };

    const show = (next: State) => {
      if (next === state) return;
      if (state === "home") window.clearTimeout(settleT);
      // taking off from a settled close: the lines first show, faded out, over the ink, then fade in as it fades out
      if (next === "lift" && state === "") { close.dataset.collapse = "home"; void getComputedStyle(el).opacity; }
      state = next;
      if (next) close.dataset.collapse = next;
      else { delete close.dataset.collapse; g.style.transform = g.style.opacity = ""; drawn = ""; }
      if (next === "lift") {
        // the ink's own fade (getAnimations brings the style up to date first); the rings move once it has finished.
        // Read by its property, so a browser without getAnimations or CSSTransition just skips the hold.
        const fade = ink?.getAnimations?.().find((a) => (a as Partial<CSSTransition>).transitionProperty === "opacity"), mine = ++lifts;
        lifted = performance.now();
        freed = 0;
        thinned = !fade;
        fade?.finished.then(() => { if (mine === lifts) { thinned = true; kick(); } }, () => {});
      }
      if (next === "home") settleT = window.setTimeout(() => { if (state === "home" && here()) show(""); }, SETTLE_MS);
    };
    const paint = () => {
      if (!state) return;
      const k = 1 + (S - 1) * (1 - p), o = PEAK * (WAITING + (1 - WAITING) * ramp(p, 0, UP)), key = `${k.toFixed(4)} ${o.toFixed(3)}`;
      if (key === drawn) return;
      drawn = key;
      g.style.transform = `scale(${k.toFixed(4)})`;
      g.style.opacity = o.toFixed(3);
    };
    // what's shown, and the lines drawn for p; true while p still has to move, or the rings hold for the ink
    const step = () => {
      if (here()) {
        p = 1;
        if (state === "on" || state === "lift") show("home");
        paint();
        return false;
      }
      if (!near()) { show(""); p = goal(); return false; }
      if (state === "home" || (state === "" && p >= 1)) show("lift");
      else if (state === "") show("on");
      paint();
      return p !== goal() || held();
    };

    const tick = (now: number) => {
      raf = 0;
      if (gone) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000), to = goal();
      last = now;
      // the drop's own lag, so they move as one; just after a take-off's hold, picked up from still (easing in)
      let rate = FOLLOW;
      if (state === "lift" && !held()) {
        if (!freed) freed = now;
        const u = Math.min(1, (now - freed) / PICKUP);
        rate = FOLLOW * u * u;
      }
      p = to >= 1 ? 1 : p + (to - p) * Math.min(1, dt * rate);
      if (Math.abs(to - p) < 0.0005) p = to;
      if (step()) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (ready && !gone && step() && !raf) { last = 0; raf = requestAnimationFrame(tick); } };

    // the drop's schedule, each time it measures (its first measure, a resize, the page settling)
    const onMeasure = (ev: Event) => {
      const { L, rest } = (ev as CustomEvent<{ L: readonly number[]; rest: number }>).detail, n = L.length;
      if (n < 2 || gone) return;
      s0 = leaves(L, rest, n - 2); s1 = L[n - 1];
      fit();
      drawn = "";
      if (!ready) { ready = true; p = goal(); }   // the first time, straight to where the page is
      kick();
    };
    // the drop landing in the sun, or leaving it: home on its landing frame
    const landed = new MutationObserver(kick);
    landed.observe(orb, { attributes: true, attributeFilter: ["data-here"] });
    root.addEventListener("fys-measure", onMeasure);
    window.addEventListener("scroll", kick, { passive: true });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(settleT);
      landed.disconnect();
      root.removeEventListener("fys-measure", onMeasure);
      window.removeEventListener("scroll", kick);
      delete close.dataset.collapse;
      g.style.transform = g.style.opacity = "";
      g.replaceChildren();
    };
  }, []);
  return (
    <svg ref={svg} className="fys-orbits" style={style} viewBox="-1 -1 2 2" aria-hidden="true">
      <g ref={zoom} />
    </svg>
  );
}
