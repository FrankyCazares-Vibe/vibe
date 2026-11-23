"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's picture (Nov 23, 2026, "find your system", hero 3 on the board
 * Franky picked): his dunes photo, seen through a grid of dots. Near him the
 * dots overlap into the whole photo; further out they shrink into a halftone
 * of the same photo, then cool to cream. His outline (an on-device subject
 * mask, 250 x 167, 1 bit) keeps him whole. The sums are the board's
 * (vibe-marketing/campaigns/2026-11-landing-revamp/board/d.html#fade), in
 * the same design px, so the drawn notes in hero-*.svg land where they did.
 *
 * Drawn once per size on a canvas (about 22,000 dots on a desktop, 10,000 on
 * a phone), never animated: the page fades it in. Device pixel ratio capped
 * at 2. The photo comes from the hidden <picture> beside it, so the browser
 * picks AVIF or WebP and the width for the screen.
 */

/** The two layouts' design boxes (px) and where the photo sits in them. */
const LAYOUT = {
  wide: { w: 880, h: 800, s: 0.5, ax: 0.42, ay: 0.58, g: 5.6, rx: 280, ry: 330 },
  phone: { w: 390, h: 380, s: 0.27, ax: 0.4, ay: 0.56, g: 3.9, rx: 140, ry: 165 },
} as const;
/** The desktop layout starts here (system.css uses the same number). */
export const SYSTEM_WIDE_QUERY = "(min-width: 900px)";

const PHOTO_W = 2000, PHOTO_H = 1334, CELL = 8, GW = 250, GH = 167;
const CREAM = "#F6F1EA";
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

/** Circles grouped by their alpha (two decimals, as the board wrote them), so each group is one fill. */
class Batch {
  groups = new Map<number, number[]>();
  add(a: number, x: number, y: number, r: number) {
    const k = Math.round(a * 100);
    if (k <= 0) return;
    let g = this.groups.get(k);
    if (!g) this.groups.set(k, (g = []));
    g.push(x, y, r);
  }
  fill(ctx: CanvasRenderingContext2D, color: string) {
    ctx.fillStyle = color;
    for (const [k, g] of this.groups) {
      ctx.globalAlpha = Math.min(1, k / 100);
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 3) { ctx.moveTo(g[i] + g[i + 2], g[i + 1]); ctx.arc(g[i], g[i + 1], g[i + 2], 0, TAU); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function draw(canvas: HTMLCanvasElement, photo: HTMLImageElement, grid: Grid): boolean {
  const box = canvas.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return false;
  const L = window.matchMedia(SYSTEM_WIDE_QUERY).matches ? LAYOUT.wide : LAYOUT.phone;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = (box.width / L.w) * dpr;
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext("2d");
  const mask = document.createElement("canvas");
  mask.width = canvas.width; mask.height = canvas.height;
  const m = mask.getContext("2d");
  if (!ctx || !m) return false;

  // The photo's px -> design px: his middle (715, 830) sits at a fixed spot in the box.
  const { w: W, h: H, s, g } = L, ax = W * L.ax, ay = H * L.ay;
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

  const holes = new Batch(), cream = new Batch();
  for (let y = g / 2; y < H; y += g) {
    for (let x = g / 2 + ((Math.round(y / g) % 2) * g) / 2; x < W; x += g) {
      const ox = OX(x), oy = OY(y), l = lum(ox, oy);
      if (l == null) continue;
      const me = inside(ox, oy);
      let v = me ? 0.42 + 0.58 * smooth(15, 190, l) : smooth(70, 236, l) * 0.62;   // him: brighter, denser dots
      if (!me && oy < 420 && l > 226) v *= 0.16 + 0.2 * smooth(120, 420, oy);       // the white sky becomes night
      v *= smooth(0, 160, oy);                                                        // no hard line at the photo's top
      v *= Math.pow(smooth(0, W * 0.28, x), 1.2) * smooth(0, W * 0.08, W - x) * smooth(0, H * 0.1, H - y) * smooth(0, H * 0.1, y);
      const d = ed(x, y), t = Math.max(me ? 0 : smooth(0.42, 1.3, d), smooth(PHOTO_H - 300, PHOTO_H - 30, oy)), c = smooth(1.05, 2.1, d);
      const kk = Math.pow(1 - t, 1.4), r = g * 0.75 * kk + g * 0.48 * Math.pow(v, 1.25) * (1 - kk);
      if (r < 0.32) continue;
      const op = 1 - t * (0.6 - 0.45 * v);
      if (c < 0.98) holes.add((1 - c) * op, x, y, r);
      if (c > 0.02) cream.add(c * (0.35 + 0.4 * v), x, y, r);
    }
  }

  m.setTransform(k, 0, 0, k, 0, 0);
  holes.fill(m, "#fff");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(photo, X(0), Y(0), PHOTO_W * s, PHOTO_H * s);
  ctx.globalCompositeOperation = "destination-in";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(k, 0, 0, k, 0, 0);
  cream.fill(ctx, CREAM);
  return true;
}

const SRC = "/landing/system";
/** How wide the photo is drawn: 1.136 x the art box on a desktop, 1.385 x on a phone (system.css sizes the boxes). */
const SIZES = "(min-width: 900px) calc(min(100vw, 1600px) * 0.694), calc(min(100vw, 560px) * 1.385)";

export function HeroDots({ onDrawn }: { onDrawn?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const drawn = useRef(onDrawn);
  useEffect(() => { drawn.current = onDrawn; }, [onDrawn]);

  useEffect(() => {
    const c = canvas.current, img = photo.current;
    if (!c || !img) return;
    let gone = false, grid: Grid | null = null, raf = 0, told = false;
    const outline = new Image();
    outline.src = `${SRC}/dunes-outline.png`;
    const redraw = () => {
      raf = 0;
      if (gone || !grid || !draw(c, img, grid) || told) return;
      told = true;
      drawn.current?.();
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(redraw); };
    Promise.all([img.decode(), outline.decode()])
      .then(() => { if (gone) return; grid = readGrid(img, outline); ask(); })
      // A photo that never loads leaves the notes on the night sky; the page still reads.
      .catch(() => { if (!gone) drawn.current?.(); });
    const sized = new ResizeObserver(ask);
    sized.observe(c);
    return () => { gone = true; cancelAnimationFrame(raf); sized.disconnect(); };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="fys-dots" aria-hidden="true" />
      <picture className="fys-dunes-src">
        <source type="image/avif" srcSet={`${SRC}/dunes-1080.avif 1080w, ${SRC}/dunes-1800.avif 1800w`} sizes={SIZES} />
        <img ref={photo} src={`${SRC}/dunes-1800.webp`} srcSet={`${SRC}/dunes-1080.webp 1080w, ${SRC}/dunes-1800.webp 1800w`} sizes={SIZES} width={2000} height={1334} alt="" fetchPriority="high" decoding="async" />
      </picture>
    </>
  );
}
