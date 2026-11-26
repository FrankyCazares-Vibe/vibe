"use client";

import { useEffect, useRef } from "react";

/**
 * The coral full stop's fall (rounds 6 to 8, Nov 23, Franky: "fall into the
 * next screen's period", "make sure the period keeps dropping"), bouncing
 * like the sign-in screen's dot and the videos' end card.
 *
 * There is one coral full stop on the page, and it travels. It starts in
 * "yourself." (where it hops now and then, once the hero has arrived, until you scroll), and as the page scrolls it drops
 * first into the full stop of the hero's "sign up free." key (Nov 24, buttons C: system-landing.tsx SignUpKey), then
 * from headline to headline: "made of your people.", "bring your club.",
 * "see you there.", "one campus at a time.", "before you sign up." and last
 * into "vibe." as its sun. At each one it lands with the sign-in dot's bounce
 * and rests a moment as that headline's full stop before falling on.
 * Scrolling up runs it back.
 *
 * It falls like a real drop (Nov 23, after ship, "build 1 and 2"): it
 * stretches a little with its speed, lands harder after a fast scroll and
 * softer after a slow one, and coming back up it settles in instead of
 * bouncing. It hands over to the full stop on the same frame, so two coral
 * dots never show at once. It takes off from where the full stop
 * really is, mid-bounce included, so it never jumps. The bounce is the
 * sign-in dot's (system.css fys-land and fys-land-em), played with the Web
 * Animations API so a take-off can cancel it. Each landing fires `fys-land`
 * on the page root ({ index, stop, fromAbove }); the planet waits for it. Each measure fires `fys-measure` ({ L, rest }:
 * the scroll at which it lands in each stop, and how long it rests); the collapse moves with it.
 *
 * Every full stop on the page is a stop (".fys-stop", in page order, then the
 * close's ".fys-orb"). It is tied to the scroll, so it is always where the
 * reader is looking. Without JavaScript or with reduced motion every full
 * stop simply sits in its place. Transform and opacity only; one small
 * element of one size; no work while it rests.
 *
 * It starts where the page is (Nov 24, Franky: "fix the reload so the dot starts in the sun"). A reload, a back
 * navigation or a link to a section can open the page partway down, and the browser may move it there a moment after
 * this starts (Safari: about 30 ms). On those, until the reader first touches, scrolls with a wheel or presses a key (and
 * for no longer than SETTLE_MS after the page has loaded, SETTLE_MAX_MS after this starts), every move is the page's
 * own: the dot is placed where that puts it, at once, with no fall, no bounce and no `fys-land`. Instead it fires
 * `fys-place` ({ index, resting }: the stop it rests in or last left) so what it lights is lit at once too, and sets
 * data-placing on the root for two frames so nothing fades in (system.css). A fresh visit with no #section has nothing
 * to restore, so there it never waits: the reader's first swipe, even one begun while the page was still loading, falls.
 */
/** After the page has loaded (or this starts, if later), a scroll counts as the reader's after this long, even with no
 *  touch, wheel or key seen (a scrollbar dragged with a mouse some browsers don't report); and never later than
 *  SETTLE_MAX_MS after this starts (a page whose load is slow or never comes). */
const SETTLE_MS = 1000, SETTLE_MAX_MS = 3000;
/** Whether the drop has started before in this document: a later start is a client navigation back to the page, which
 *  the router may scroll a moment after (the browser's own navigation entry still says how the document first loaded). */
let startedBefore = false;
/** The hero's one order (Nov 23, motion idea 7): the logo's dot lands, the photo fades into dots, the sun comes up, the
 *  notes appear (system.css), and only then does the full stop in "yourself." hop: this long after the picture is in
 *  (the hero's data-wait clears, or its 3 s fallback), never before FIRST_HOP_MIN, then every HOP_EVERY, and never again
 *  once the reader has scrolled (they have found the thread). */
const FIRST_HOP_AFTER = 900, FIRST_HOP_MIN = 1800, HOP_EVERY = 7000, PICTURE_FALLBACK = 3000, SCROLLED = 40;
/** It lands when the next full stop reaches this share of the screen's height, */
const LAND_AT = 0.42;
/** and rests there for this share of a screen of scrolling before it falls on. */
const REST = 0.34;
/** The last one, into the close's sun, lands at least this share of a screen before the page's very end (a scroll that
 *  stops a little short, a phone's toolbar coming back), so it never hangs over the sun. */
const END = 0.08;
/** It follows the scroll with a little lag (each frame it closes dt x FOLLOW of the gap, about 80 ms behind), so the fall
 *  flows rather than jumps. The collapse (collapse-rings.tsx) follows with the same lag, so it lands with the drop. */
export const FOLLOW = 12;
/** Where the drop falls on from stop i, given where it lands in each (L) and how long it rests (REST of a screen, as
 *  px): it rests for that, or half the way to the next stop if that's shorter. The collapse starts here too. */
export const leaves = (L: readonly number[], rest: number, i: number) => L[i] + Math.min(rest, (L[i + 1] - L[i]) * 0.5);
/** It falls like a drop: u of the way through its fall's scroll, it has come u ** FALL of the way down (slow, then fast). */
export const FALL = 1.7;
/** The stretch: at this falling speed (px a second) and up, the most, narrower by X and longer by Y. Kept slight. */
const STRETCH_AT = 1800, STRETCH_X = 0.12, STRETCH_Y = 0.22;
/** It has only left a full stop once it is this far into its fall, and no stop bounces twice within this long. */
const LEFT_AT = 0.04, REBOUNCE_MS = 400;
/** How hard it lands: from this (a slow scroll) up to 1 (the sign-in dot's own bounce) at this peak speed. */
const SOFTEST = 0.55, HARDEST_AT = 1200;

const EASE = "cubic-bezier(0.3, 0.7, 0.3, 1)";
const SNAPPY = "cubic-bezier(0.22, 1, 0.36, 1)";
/** The sign-in dot's landing (system.css fys-land for the sun, fys-land-em for a headline's), scaled by how hard it lands. */
function landing(orb: boolean, k: number): Keyframe[] {
  const sq = (x: number, y: number) => `scale(${(1 + (x - 1) * k).toFixed(3)}, ${(1 + (y - 1) * k).toFixed(3)})`;
  const up = (v: number) => `translateY(${(-v * k).toFixed(3)}${orb ? "%" : "em"})`;
  const [h1, h2] = orb ? [95, 32] : [0.35, 0.12];
  return [
    { offset: 0, transform: sq(1.15, 0.72) },
    { offset: 0.28, transform: `${up(h1)} ${sq(0.96, 1.05)}` },
    { offset: 0.52, transform: `translateY(0) ${sq(1.08, 0.84)}` },
    { offset: 0.68, transform: up(h2) },
    { offset: 0.84, transform: `translateY(0) ${sq(1.03, 0.95)}` },
    { offset: 1, transform: "none" },
  ];
}

type Pt = { x: number; y: number; r: number };

export function CoralDrop() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = marker.current?.closest<HTMLElement>(".fys-root");
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops = [...host.querySelectorAll<HTMLElement>(".fys-stop"), ...host.querySelectorAll<HTMLElement>(".fys-orb")];
    if (stops.length < 2) return;
    const dot = document.createElement("span");
    dot.className = "fys-drop";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);

    // a full stop's ink, in the page root's own px: a headline's from the font's own measures (its <i> box is wider
    // than the dot), the close's sun from its own box
    // a box without its own transform (the landing bounce), so a measure taken mid-bounce is still right
    const rect = (el: HTMLElement) => {
      const p = el.offsetParent as HTMLElement | null;
      if (!p) return el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: pb.left + p.clientLeft + el.offsetLeft, top: pb.top + p.clientTop + el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
    };
    const ink = (el: HTMLElement): Pt => {
      const h = host.getBoundingClientRect(), b = rect(el), x0 = b.left - h.left, y0 = b.top - h.top;
      if (el.classList.contains("fys-orb")) return { x: x0 + b.width / 2, y: y0 + b.height / 2, r: b.width / 2 };
      const cs = getComputedStyle(el), ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return { x: x0 + b.width / 2, y: y0 + b.height * 0.7, r: b.width * 0.35 };
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText("."), a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
      const base = y0 + (b.height - (a + d)) / 2 + a;   // the content area sits centred in the box's own height
      return { x: x0 + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, y: base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2, r: Math.max(2, (m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 2) };
    };
    let P: Pt[] = [], L: number[] = [], rest = 0, R = 1;
    // what moves with the drop (collapse-rings.tsx) hears where it lands, every time that's measured
    const announce = () => host.dispatchEvent(new CustomEvent("fys-measure", { detail: { L, rest } }));
    // each stop's point, and the scroll at which the dot lands there (the first at the top, the last no later than
    // the page's end, so it can always get there); the dot is one size, the biggest stop's, scaled to each. The very
    // first measure is announced only once the dot is placed, so the collapse starts from where the dot really is.
    const measure = (tell = true) => {
      P = stops.map(ink);
      const hostY = host.getBoundingClientRect().top + window.scrollY, vh = window.innerHeight;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh - vh * END);
      L = P.map((p, i) => (i === 0 ? 0 : Math.min(maxScroll, Math.max(0, p.y + hostY - vh * LAND_AT))));
      for (let i = 1; i < L.length; i++) L[i] = Math.max(L[i], L[i - 1] + 1);
      rest = vh * REST;
      if (tell) announce();
      R = Math.max(...P.map((p) => p.r));
      dot.style.width = dot.style.height = `${(R * 2).toFixed(1)}px`;
      // the glow scales with the dot: make it 16px at a headline's size, as it was (the first headline's full stop past
      // home, not stop 1, which is the sign-up key's small one since Nov 24)
      const hi = stops.findIndex((el, j) => j > 0 && !!el.closest(".fys-hl"));
      const head = hi > 0 ? P[hi].r : R;
      dot.style.boxShadow = `0 0 ${((16 * R) / head).toFixed(1)}px rgba(255, 92, 53, 0.45)`;
    };
    measure(false);

    // where the scroll puts the dot: resting at stop i, or falling from i to i + 1 (u from 0 to 1)
    const where = () => {
      const s = window.scrollY;
      let i = 0;
      while (i < L.length - 1 && s >= L[i + 1] - (i + 2 === L.length ? 1 : 0)) i++;   // the sun counts as reached a pixel early (a scroll stopping a hair short)
      if (i === L.length - 1) return { i, u: 0 };
      const from = leaves(L, rest, i);
      return { i, u: Math.min(1, Math.max(0, (s - from) / Math.max(1, L[i + 1] - from))) };
    };
    const spot = (i: number, u: number) => {
      const A = P[i], B = P[Math.min(P.length - 1, i + 1)], e = u * u * (3 - 2 * u);
      return { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * Math.pow(u, FALL), r: A.r + (B.r - A.r) * u };
    };

    let here = -1, x = P[0].x, y = P[0].y, r = P[0].r, raf = 0, last = 0, gone = false, hopTimer = 0, hopsOff = false;
    // its speed straight down (px a second; up is negative), the fastest it went since it last left a stop, and how
    // stretched it is now (0 to 1, eased so it never jitters)
    let vy = 0, peak = 0, stretch = 0;
    const lastBounce = new Map<number, number>();
    const mark = (k: number) => { here = k; stops.forEach((el, j) => { if (j === k) el.dataset.here = ""; else delete el.dataset.here; }); };
    const place = () => {
      const k = r / R, sx = k * (1 - STRETCH_X * stretch), sy = k * (1 + STRETCH_Y * stretch);
      dot.style.transform = `translate3d(${(x - R).toFixed(1)}px, ${(y - R).toFixed(1)}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    };
    // a full stop's motion: the landing bounce (Web Animations, so it can be cancelled), or the hero's hop (a class)
    const still = (el: HTMLElement) => { el.getAnimations().forEach((a) => a.cancel()); el.classList.remove("is-bouncing"); };
    const hopNow = (el: HTMLElement) => { el.classList.remove("is-bouncing"); void el.offsetWidth; el.classList.add("is-bouncing"); };
    const show = () => { dot.style.opacity = "1"; };
    // landing: the dot hands over to the full stop on the same frame (never two coral dots at once)
    const land = (i: number) => {
      const el = stops[i], fromAbove = vy >= 0, now = performance.now();
      stretch = 0; place();
      dot.style.opacity = "0";
      mark(i);
      if (i === 0 && !hopsOff) { window.clearTimeout(hopTimer); hopTimer = window.setTimeout(hop, HOP_EVERY); }   // home: the next hop waits
      if (now - (lastBounce.get(i) ?? -Infinity) >= REBOUNCE_MS) {
        lastBounce.set(i, now);
        still(el);
        if (fromAbove) el.animate(landing(el.classList.contains("fys-orb"), SOFTEST + (1 - SOFTEST) * Math.min(1, peak / HARDEST_AT)), { duration: 950, easing: EASE });
        else el.animate([{ transform: "scale(0.92)" }, { transform: "none" }], { duration: 320, easing: SNAPPY });   // up from below: it settles in
        host.dispatchEvent(new CustomEvent("fys-land", { detail: { index: i, stop: el, fromAbove } }));
      }
      peak = 0; stretch = 0; vy = 0;
    };
    // leaving a full stop: start from where it really is on screen, mid-bounce included, and stop its bounce. A key
    // you're reaching for shows its sun there instead (system.css), risen: leave from the sun, so the dot never jumps
    const takeOff = () => {
      const el = stops[here], sun = el.parentElement?.querySelector<HTMLElement>(":scope > .fys-cta-sun > b");
      if (sun && parseFloat(getComputedStyle(sun).opacity) > 0.5) {
        const s = sun.getBoundingClientRect(), h = host.getBoundingClientRect();
        x = s.left + s.width / 2 - h.left;
        y = s.top + s.height / 2 - h.top;
        r = s.width / 2;
      } else {
        const seen = el.getBoundingClientRect(), at = rect(el);
        x = P[here].x + (seen.left + seen.width / 2 - (at.left + at.width / 2));
        y = P[here].y + (seen.top + seen.height / 2 - (at.top + at.height / 2));
        r = P[here].r;
      }
      still(el);
      mark(-1);
      show();
      place();
    };

    const tick = (now: number) => {
      raf = 0;
      if (gone) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const { i, u } = where(), to = spot(i, u);
      // it follows the scroll with a little lag, so the fall flows rather than jumps
      const k = Math.min(1, dt * FOLLOW), py = y;
      x += (to.x - x) * k; y += (to.y - y) * k; r += (to.r - r) * k;
      if (dt > 0) {
        vy = (y - py) / dt;
        peak = Math.max(peak, Math.abs(vy));
        stretch += (Math.min(1, Math.abs(vy) / STRETCH_AT) - stretch) * Math.min(1, dt * 20);
      }
      // close enough: it settles into the stop (so a steady scroll still lands it in each headline)
      if (u <= LEFT_AT && Math.hypot(P[i].x - x, P[i].y - y) < Math.max(4, P[i].r * 1.5)) {
        x = P[i].x; y = P[i].y; r = P[i].r;
        if (here !== i) land(i);
        return;
      }
      if (here !== -1) takeOff();
      place();
      raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!raf && !gone) { last = 0; raf = requestAnimationFrame(tick); } };

    // Is the page still moving by itself? Yes until the reader's first wheel, touch, press or key, and never longer than
    // SETTLE_MS after the page has loaded.
    // A fresh visit with no #section can't be restored partway down, so there nothing waits.
    const navType = (performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
    let readerMoved = !startedBefore && navType === "navigate" && !location.hash, settleBy = 0, placing = 0;
    startedBefore = true;
    const settleMax = performance.now() + SETTLE_MAX_MS;
    const byReader = () => { readerMoved = true; };
    // (touchmove too: a swipe begun before this started never sends its touchstart here)
    const INPUTS = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const;
    INPUTS.forEach((t) => window.addEventListener(t, byReader, { capture: true, passive: true }));
    const loaded = () => { settleBy = performance.now() + SETTLE_MS; };
    if (document.readyState === "complete") loaded();
    else window.addEventListener("load", loaded, { once: true });
    const settling = () => !readerMoved && performance.now() < Math.min(settleMax, settleBy || Infinity);
    // put the dot where the page is, at once: resting in a stop (the stop shows, no bounce) or partway down a fall (the
    // dot shows there); then tell what it lights, and hold every fade for two frames (system.css data-placing)
    const placeAt = () => {
      const { i, u } = where(), to = spot(i, u), resting = u <= LEFT_AT;
      cancelAnimationFrame(raf); raf = 0;
      x = to.x; y = to.y; r = to.r; vy = 0; peak = 0; stretch = 0;
      if (resting) {
        if (here !== i) { if (here >= 0) still(stops[here]); dot.style.opacity = "0"; mark(i); }
      } else {
        if (here >= 0) still(stops[here]);
        mark(-1); show();
      }
      place();
      host.dataset.placing = "";
      const mine = ++placing;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (mine === placing && !gone) delete host.dataset.placing; }));
      host.dispatchEvent(new CustomEvent("fys-place", { detail: { index: i, resting } }));
    };

    const onScroll = () => {
      if (!hopsOff && window.scrollY > SCROLLED) { hopsOff = true; window.clearTimeout(hopTimer); }   // scrolled: no more hops
      if (settling()) { placeAt(); return; }
      const { i, u } = where();
      if (here !== -1 && i === here && u <= LEFT_AT) return;   // still resting where it is (a hair of scroll is no take-off)
      go();
    };
    const onResize = () => {
      measure();
      if (settling()) { placeAt(); return; }
      if (here !== -1) { x = P[here].x; y = P[here].y; r = P[here].r; }
      go();
    };
    // at home, a hop now and then, while the headline is in view, until the reader scrolls
    const hop = () => {
      if (hopsOff) return;
      if (here === 0 && !document.hidden && stops[0].getBoundingClientRect().bottom > 0) hopNow(stops[0]);
      hopTimer = window.setTimeout(hop, HOP_EVERY);
    };
    // the first hop waits for the hero's picture (and so for the logo's dot, the sun and the notes): never two coral
    // bounces at once
    const t0 = performance.now(), hero = host.querySelector<HTMLElement>(".fys-hero");
    let hopsOn = false, waitFallback = 0;
    const startHops = () => {
      if (hopsOn || hopsOff) return;
      hopsOn = true;
      window.clearTimeout(waitFallback);
      hopTimer = window.setTimeout(hop, Math.max(FIRST_HOP_AFTER, FIRST_HOP_MIN - (performance.now() - t0)));
    };
    const pictureIn = new MutationObserver(() => { if (!hero?.hasAttribute("data-wait")) { pictureIn.disconnect(); startHops(); } });
    if (!hero || !hero.hasAttribute("data-wait")) startHops();
    else { pictureIn.observe(hero, { attributes: true, attributeFilter: ["data-wait"] }); waitFallback = window.setTimeout(startHops, PICTURE_FALLBACK); }
    // first, so the collapse and the campuses hear where the dot is before they react to the same scroll (in the
    // capture phase, which also sees any inner element scrolling: only the page's own scroll counts)
    const onPageScroll = (e: Event) => { if (e.target === document || e.target === window) onScroll(); };
    window.addEventListener("scroll", onPageScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    // the page settles (fonts, pictures) after the first frame: measure again then
    document.fonts?.ready.then(() => { if (!gone) onResize(); });
    window.addEventListener("load", onResize);
    // and whenever the page's height changes (pictures loading lower down move every stop)
    const sized = new ResizeObserver(() => onResize());
    sized.observe(host);
    // start where the page is (the top, or partway down already), then tell the collapse where the dot lands
    if (window.scrollY > SCROLLED) hopsOff = true;
    placeAt();
    // only now does the page hand its full stops to the dot (system.css [data-drop]): set in the same step as the first
    // placement, so no style pass ever sees the dot running with no stop of its own, which reads as "in the air" and
    // would set a sign-up key's risen sun back down under a resting pointer (Nov 26). Nothing above measures it.
    host.dataset.drop = "";
    announce();
    return () => {
      gone = true;
      window.clearTimeout(hopTimer); window.clearTimeout(waitFallback); pictureIn.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onPageScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onResize);
      window.removeEventListener("load", loaded);
      INPUTS.forEach((t) => window.removeEventListener(t, byReader, { capture: true }));
      delete host.dataset.placing;
      sized.disconnect();
      stops.forEach((el) => { delete el.dataset.here; still(el); });
      dot.remove();
      delete host.dataset.drop;
    };
  }, []);
  return <span ref={marker} hidden />;
}
