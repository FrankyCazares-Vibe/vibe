"use client";

import { useEffect, useRef } from "react";

import { ART_EXTRA } from "./art-data";

/**
 * The hero's picture ("find your system" landing, Nov 23, 2026): Franky's
 * dunes photo, seen through a grid of dots. Near him the dots overlap into
 * the whole photo; further out they shrink into dots of the same photo, then
 * cool to cream. His outline (an on-device subject mask, 250 x 167, 1 bit)
 * keeps him whole. The sums are the board's (vibe-marketing/campaigns/
 * 2026-11-landing-revamp/board), in the same design px as the drawn notes
 * (ART_EXTRA.hero, written by the board's export), so they line up.
 *
 * It flows (round 6, Franky's reference: a pixel figure whose edges shimmer):
 * the dots where the photo breaks up breathe, swelling and shrinking in slow
 * waves that drift across them, and a few coral dots glow in and out. Nothing
 * flickers at random, and nothing follows the mouse (round 11: the hover
 * spotlight is gone). Where the photo breaks up the dots are dithered:
 * scattered off the grid and uneven in size, so the edge reads as grain.
 * With reduced motion it is still. Redrawn at most 30 times a second, only
 * while at least 30% of it is on screen, and only in the band where dots move:
 * the still part (the photo through the still dots, and the still cream dots)
 * is drawn once per size (Nov 23: on a phone slowed 4x the hero kept the main
 * thread 97% busy). Device pixel ratio capped at 2, and at 1.5 on a phone. Every edge fades out,
 * so the dots never stop at a line. The photo comes from the hidden
 * <picture>, so the browser picks AVIF or WebP and the width for the screen.
 */

type Layout = (typeof ART_EXTRA.hero)["desktop" | "phone"];
/** The desktop layout starts here (system.css and art.tsx use the same number). */
export const SYSTEM_WIDE_QUERY = "(min-width: 900px)";

const PHOTO_W = 2000, PHOTO_H = 1334, CELL = 8, GW = 250, GH = 167;
const CREAM = "#F6F1EA", CORAL = "#FF5C35";
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The photo's brightness (0-255) and his outline, both on the 250 x 167 grid of 8 px cells. */
type Grid = { lum: Float32Array; me: Uint8Array };

function readGrid(photo: HTMLImageElement, outline: HTMLImageElement): Grid | null {
  const c = document.createElement("canvas");
  c.width = GW; c.height = GH;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.imageSmoothingQuality = "high";
  x.drawImage(photo, 0, 0, GW, GH);
  const p = x.getImageData(0, 0, GW, GH).data, lum = new Float32Array(GW * GH);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2];
  x.clearRect(0, 0, GW, GH);
  x.drawImage(outline, 0, 0, GW, GH);
  const o = x.getImageData(0, 0, GW, GH).data, me = new Uint8Array(GW * GH);
  for (let i = 0; i < me.length; i++) me[i] = o[i * 4] > 127 ? 1 : 0;
  return { lum, me };
}

/** Dots grouped by their alpha (two decimals), so each group is one fill. Each dot: x, y, r, how much it flows. */
class Batch {
  groups = new Map<number, number[]>();
  add(a: number, x: number, y: number, r: number, w = 0) {
    const k = Math.round(a * 100);
    if (k <= 0) return;
    let g = this.groups.get(k);
    if (!g) this.groups.set(k, (g = []));
    g.push(x, y, r, w);
  }
  /** Fill every dot; `flow` (when given) says how much each one swells or shrinks right now. */
  fill(ctx: CanvasRenderingContext2D, color: string, flow?: (x: number, y: number) => number) {
    ctx.fillStyle = color;
    for (const [k, g] of this.groups) {
      ctx.globalAlpha = Math.min(1, k / 100);
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 4) {
        const r = flow ? g[i + 2] * Math.max(0, 1 + 0.5 * g[i + 3] * flow(g[i], g[i + 1])) : g[i + 2];
        if (r < 0.25) continue;
        ctx.moveTo(g[i] + r, g[i + 1]);
        ctx.arc(g[i], g[i + 1], r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** One drawn size: the photo in place, the dots that hold still and the ones that flow, and a few coral glows. */
type Scene = {
  L: Layout; k: number; w2: number; h2: number;
  /** the photo in place, and the still part already composed: the photo through the still dots, then the still cream dots */
  photo: HTMLCanvasElement; base: HTMLCanvasElement;
  holes: Batch; cream: Batch; glows: number[];
  /** the band where dots move (device px: x, y, w, h), with room for their swell */
  band: [number, number, number, number];
};

function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

function build(box: DOMRect, img: HTMLImageElement, grid: Grid): Scene | null {
  const L: Layout = window.matchMedia(SYSTEM_WIDE_QUERY).matches ? ART_EXTRA.hero.desktop : ART_EXTRA.hero.phone;
  const wide = window.matchMedia(SYSTEM_WIDE_QUERY).matches;
  const dpr = Math.min(window.devicePixelRatio || 1, wide ? 2 : 1.5), k = (box.width / L.w) * dpr;
  const w2 = Math.round(box.width * dpr), h2 = Math.round(box.height * dpr);
  const photo = canvas(w2, h2), still = canvas(w2, h2);
  const pc = photo.getContext("2d"), sc = still.getContext("2d");
  if (!pc || !sc) return null;

  // The photo's px -> design px: his middle (715, 830) sits at a fixed spot in the box.
  const { w: W, h: H, s } = L, ax = W * L.ax, ay = H * L.ay;
  // The dots keep their size on screen when the box is drawn bigger than its design (more dots, not bigger ones).
  const g = L.g / Math.max(1, box.width / L.w);
  const X = (v: number) => ax + (v - 715) * s, Y = (v: number) => ay + (v - 830) * s;
  const OX = (x: number) => 715 + (x - ax) / s, OY = (y: number) => 830 + (y - ay) / s;
  const lum = (ox: number, oy: number) => {
    const fx = ox / CELL - 0.5, fy = oy / CELL - 0.5;
    if (fx < 0 || fy < 0 || fx > GW - 1 || fy > GH - 1) return null;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (x: number, y: number) => grid.lum[Math.min(GH - 1, y) * GW + Math.min(GW - 1, x)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  const inside = (ox: number, oy: number) => {
    const x = Math.round(ox / CELL - 0.5), y = Math.round(oy / CELL - 0.5);
    return x >= 0 && y >= 0 && x < GW && y < GH && grid.me[y * GW + x] === 1;
  };
  // Solid photo (t = 0) to fully broken into dots (t = 1); c is how far a dot has cooled to cream.
  const ecx = X(720), ecy = Y(890), ed = (x: number, y: number) => Math.hypot((x - ecx) / L.rx, (y - ecy) / L.ry);

  const stillHoles = new Batch(), stillCreamB = new Batch(), holes = new Batch(), cream = new Batch(), glows: number[] = [];
  let n = 0, seed = 97;
  // a fixed random (the same grain every time), for the dither
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let q = Math.imul(seed ^ (seed >>> 15), 1 | seed); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  for (let y = g / 2; y < H; y += g) {
    for (let x = g / 2 + ((Math.round(y / g) % 2) * g) / 2; x < W; x += g) {
      const ox = OX(x), oy = OY(y), l = lum(ox, oy);
      if (l == null) continue;
      const me = inside(ox, oy);
      let v = me ? 0.42 + 0.58 * smooth(15, 190, l) : smooth(70, 236, l) * 0.62;   // him: brighter, denser dots
      if (!me && oy < 420 && l > 226) v *= 0.16 + 0.2 * smooth(120, 420, oy);       // the white sky becomes night
      v *= smooth(0, 160, oy);                                                        // no hard line at the photo's top
      v *= smooth(0, 220, ox) * smooth(0, 220, PHOTO_W - ox) * smooth(0, 200, PHOTO_H - oy);   // nor at its sides and foot
      v *= Math.pow(smooth(0, W * 0.28, x), 1.2) * smooth(0, W * 0.08, W - x) * smooth(0, H * 0.12, H - y) * smooth(0, H * 0.1, y);
      const d = ed(x, y), t = Math.max(me ? 0 : smooth(0.42, 1.3, d), smooth(PHOTO_H - 300, PHOTO_H - 30, oy)), c = smooth(1.05, 2.1, d);
      const kk = Math.pow(1 - t, 1.4);
      // round 7, grain (Franky's refs: the dithered hands): where the photo breaks up, each dot drifts off the grid and
      // its size wanders, so the edge reads as dithered grain; the solid photo keeps its even grid
      const jit = smooth(0.15, 0.55, t), j1 = rnd() - 0.5, j2 = rnd() - 0.5, j3 = rnd();
      const r = (g * 0.75 * kk + g * 0.48 * Math.pow(v, 1.25) * (1 - kk)) * (1 + jit * (j3 - 0.5) * 0.3);
      if (r < 0.32) continue;
      const dx = jit * j1 * g * 0.3, dy = jit * j2 * g * 0.3;   // round 8: "way too grainy", so only a slight unevenness
      const op = 1 - t * (0.6 - 0.45 * v);
      // how much this dot flows: none in the solid photo, most where it breaks up, a little out in the cream
      const w = smooth(0.08, 0.38, t) * (1 - 0.55 * c);
      if (c < 0.98) (w > 0.02 ? holes : stillHoles).add((1 - c) * op, x + dx, y + dy, r, w);
      if (c > 0.02) (w > 0.02 ? cream : stillCreamB).add(c * (0.35 + 0.4 * v), x + dx, y + dy, r, w);
      // a few coral dots, out where the photo breaks up, glowing in and out like the odd coloured pixel
      if (t > 0.45 && t < 0.95 && c < 0.7 && v > 0.25 && !me && oy > 460 && n++ % 61 === 0) glows.push(x, y, r, (n * 2.399) % TAU);
    }
  }

  pc.setTransform(k, 0, 0, k, 0, 0);
  pc.imageSmoothingQuality = "high";
  pc.drawImage(img, X(0), Y(0), PHOTO_W * s, PHOTO_H * s);
  // the still part, once: the photo through the still dots, then the still cream dots over it
  sc.setTransform(k, 0, 0, k, 0, 0);
  stillHoles.fill(sc, "#fff");
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.drawImage(photo, 0, 0);
  sc.globalCompositeOperation = "source-over";
  sc.setTransform(k, 0, 0, k, 0, 0);
  stillCreamB.fill(sc, CREAM);
  // the band where dots move: every flowing dot and coral glow, at its biggest swell (x 1.5), in device px
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (list: number[], step: number) => {
    for (let i = 0; i < list.length; i += step) {
      const m = list[i + 2] * 1.5 + 1;
      x0 = Math.min(x0, list[i] - m); x1 = Math.max(x1, list[i] + m); y0 = Math.min(y0, list[i + 1] - m); y1 = Math.max(y1, list[i + 1] + m);
    }
  };
  for (const g2 of holes.groups.values()) grow(g2, 4);
  for (const g2 of cream.groups.values()) grow(g2, 4);
  grow(glows, 4);
  const bx = Math.max(0, Math.floor(x0 * k) - 2), by = Math.max(0, Math.floor(y0 * k) - 2);
  const band: [number, number, number, number] = x1 < x0 ? [0, 0, 0, 0] : [bx, by, Math.min(w2, Math.ceil(x1 * k) + 2) - bx, Math.min(h2, Math.ceil(y1 * k) + 2) - by];
  return { L, k, w2, h2, photo, base: still, holes, cream, glows, band };
}

const SRC = "/landing/system";
/** How wide the photo is drawn: 1.2 x the art box on a desktop, 1.54 x on a phone (system.css sizes the boxes). */
const SIZES = "(min-width: 900px) calc(min(100vw, 1600px) * 0.833), calc(min(100vw, 560px) * 1.54)";
/** At most 30 frames a second: the waves are slow, and a phone draws thousands of dots a frame. */
const FRAME_MS = 32;

export function HeroDots({ onDrawn }: { onDrawn?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const drawn = useRef(onDrawn);
  useEffect(() => { drawn.current = onDrawn; }, [onDrawn]);

  useEffect(() => {
    const c = ref.current, img = photo.current;
    const ctx = c?.getContext("2d");
    if (!c || !img || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false, grid: Grid | null = null, scene: Scene | null = null, raf = 0, told = false, onScreen = true, last = -Infinity;
    const t0 = performance.now();
    const mask = document.createElement("canvas"), mctx = mask.getContext("2d");

    // the flow: two slow waves crossing, -1 to 1, drifting over the dots (design px, seconds)
    const wave = (time: number) => (x: number, y: number) => 0.62 * Math.sin(x * 0.043 + y * 0.017 - time * 1.5) + 0.38 * Math.sin(x * -0.019 + y * 0.052 + time * 1.05);


    // one moment, in the band where dots move: the still part as composed, the photo through the flowing dots over it,
    // the flowing cream dots, the coral glows. Outside the band the canvas keeps the still part, drawn once (full).
    const paint = (S: Scene, time: number, moving: boolean, full = false) => {
      if (!mctx) return;
      const [bx, by, bw, bh] = S.band;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (full) { ctx.clearRect(0, 0, S.w2, S.h2); ctx.drawImage(S.base, 0, 0); }
      if (bw < 1 || bh < 1) return;
      const flow = moving ? wave(time) : undefined;
      // the photo through the flowing dots, on a canvas the band's size (so no compositing reaches past it)
      if (mask.width !== bw || mask.height !== bh) { mask.width = bw; mask.height = bh; }
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, bw, bh);
      mctx.setTransform(S.k, 0, 0, S.k, -bx, -by);
      S.holes.fill(mctx, "#fff", flow);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = "source-in";
      mctx.drawImage(S.photo, bx, by, bw, bh, 0, 0, bw, bh);
      mctx.globalCompositeOperation = "source-over";
      ctx.clearRect(bx, by, bw, bh);
      ctx.drawImage(S.base, bx, by, bw, bh, bx, by, bw, bh);
      ctx.drawImage(mask, bx, by);
      ctx.setTransform(S.k, 0, 0, S.k, 0, 0);
      S.cream.fill(ctx, CREAM, flow);
      ctx.fillStyle = CORAL;
      for (let i = 0; i < S.glows.length; i += 4) {
        const a = moving ? 0.12 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(time * 0.8 + S.glows[i + 3]), 3) : 0.45;
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(S.glows[i], S.glows[i + 1], S.glows[i + 2] * 0.95, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      const S = scene;
      if (gone || !S) return;
      const live = onScreen && !document.hidden && !still;
      if (now - last >= FRAME_MS || !live) {
        last = now;
        paint(S, (now - t0) / 1000, !still);
      }
      if (live) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && scene && onScreen && !document.hidden) raf = requestAnimationFrame(frame); };

    const layout = () => {
      if (gone || !grid) return;
      const box = c.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      const S = build(box, img, grid);
      if (!S) return;
      scene = S;
      c.width = S.w2; c.height = S.h2;
      paint(S, (performance.now() - t0) / 1000, !still, true);
      wake();
      if (!told) { told = true; drawn.current?.(); }
    };
    let sizeRaf = 0;
    const sized = new ResizeObserver(() => { cancelAnimationFrame(sizeRaf); sizeRaf = requestAnimationFrame(layout); });
    // drawn only while at least 30% of it shows (the waves run on the clock, so it picks up where it would be)
    const seen = new IntersectionObserver(([e]) => { onScreen = e.intersectionRatio >= 0.3; wake(); }, { threshold: [0, 0.3] });


    const outline = new Image();
    outline.src = `${SRC}/dunes-outline.png`;
    Promise.all([img.decode(), outline.decode()])
      .then(() => { if (gone) return; grid = readGrid(img, outline); layout(); sized.observe(c); seen.observe(c); })
      // A photo that never loads leaves the notes on the night sky; the page still reads.
      .catch(() => { if (!gone) drawn.current?.(); });
    document.addEventListener("visibilitychange", wake);
    return () => {
      gone = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(sizeRaf);
      sized.disconnect(); seen.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className="fys-dots" aria-hidden="true" />
      <picture className="fys-dunes-src">
        <source type="image/avif" srcSet={`${SRC}/dunes-1080.avif 1080w, ${SRC}/dunes-1800.avif 1800w`} sizes={SIZES} />
        <img ref={photo} src={`${SRC}/dunes-1800.webp`} srcSet={`${SRC}/dunes-1080.webp 1080w, ${SRC}/dunes-1800.webp 1800w`} sizes={SIZES} width={2000} height={1334} alt="" fetchPriority="high" decoding="async" />
      </picture>
    </>
  );
}
