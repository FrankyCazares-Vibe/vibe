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
 * It's alive in one way: now and then a patch of dots flickers into the real
 * photo and back, and under a mouse the dots near the pointer turn into the
 * photo too (a tap does it on a phone). The dots themselves are drawn once
 * per size; a frame only redraws while a flicker or the pointer is on. With
 * reduced motion nothing flickers by itself. Paused off screen. Device pixel
 * ratio capped at 2. The photo comes from the hidden <picture>, so the
 * browser picks AVIF or WebP and the width for the screen.
 */

type Layout = (typeof ART_EXTRA.hero)["desktop" | "phone"];
/** The desktop layout starts here (system.css and art.tsx use the same number). */
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

/** One drawn size: the dots (base), the plain photo in the same place, and where a flicker may land. */
type Scene = { L: Layout; k: number; base: HTMLCanvasElement; photo: HTMLCanvasElement; spots: number[] };

function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

function build(box: DOMRect, img: HTMLImageElement, grid: Grid): Scene | null {
  const L: Layout = window.matchMedia(SYSTEM_WIDE_QUERY).matches ? ART_EXTRA.hero.desktop : ART_EXTRA.hero.phone;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = (box.width / L.w) * dpr;
  const W2 = Math.round(box.width * dpr), H2 = Math.round(box.height * dpr);
  const base = canvas(W2, H2), mask = canvas(W2, H2), photo = canvas(W2, H2);
  const ctx = base.getContext("2d"), m = mask.getContext("2d"), pc = photo.getContext("2d");
  if (!ctx || !m || !pc) return null;

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

  const holes = new Batch(), cream = new Batch(), spots: number[] = [];
  let n = 0;
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
      // where a flicker may land: the dotted sand and dunes round him (not the white sky, not the faded edges)
      if (t > 0.3 && c < 0.85 && oy > 470 && oy < PHOTO_H - 120 && v > 0.2 && n++ % 23 === 0) spots.push(x, y);
    }
  }

  const draw = (cx: CanvasRenderingContext2D) => { cx.imageSmoothingQuality = "high"; cx.drawImage(img, X(0), Y(0), PHOTO_W * s, PHOTO_H * s); };
  pc.setTransform(k, 0, 0, k, 0, 0);
  draw(pc);
  m.setTransform(k, 0, 0, k, 0, 0);
  holes.fill(m, "#fff");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  draw(ctx);
  ctx.globalCompositeOperation = "destination-in";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(k, 0, 0, k, 0, 0);
  cream.fill(ctx, CREAM);
  return { L, k, base, photo, spots };
}

/** A patch of photo: where (design px), how big, when it started and how long it lasts (ms). */
type Flicker = { x: number; y: number; r: number; t0: number; dur: number };

const SRC = "/landing/system";
/** How wide the photo is drawn: 1.2 x the art box on a desktop, 1.54 x on a phone (system.css sizes the boxes). */
const SIZES = "(min-width: 900px) calc(min(100vw, 1600px) * 0.833), calc(min(100vw, 560px) * 1.54)";

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
    let gone = false, grid: Grid | null = null, scene: Scene | null = null, raf = 0, told = false, onScreen = true, timer = 0;
    const flickers: Flicker[] = [];
    // the pointer's lens: where it is (design px), where it eases to, and how strong it is
    const lens = { x: 0, y: 0, tx: 0, ty: 0, a: 0, on: false };
    const patch = document.createElement("canvas"), pctx = patch.getContext("2d");

    const env = (u: number) => (u < 0.3 ? smooth(0, 0.3, u) : u > 0.62 ? 1 - smooth(0.62, 1, u) : 1);

    // one round patch of the photo, soft at the edge, laid over the dots at strength a
    const reveal = (S: Scene, x: number, y: number, r: number, a: number) => {
      if (!pctx || a <= 0.002) return;
      const R = Math.ceil(r * S.k), size = R * 2, sx = Math.round(x * S.k) - R, sy = Math.round(y * S.k) - R;
      if (patch.width !== size) { patch.width = size; patch.height = size; }
      pctx.globalCompositeOperation = "copy";
      pctx.drawImage(S.photo, sx, sy, size, size, 0, 0, size, size);
      pctx.globalCompositeOperation = "destination-in";
      const fade = pctx.createRadialGradient(R, R, 0, R, R, R);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.5, "rgba(0,0,0,0.92)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      pctx.fillStyle = fade;
      pctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = a;
      ctx.drawImage(patch, sx, sy);
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      const S = scene;
      if (gone || !S) return;
      lens.x += (lens.tx - lens.x) * 0.22;
      lens.y += (lens.ty - lens.y) * 0.22;
      lens.a += ((lens.on ? 1 : 0) - lens.a) * 0.14;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(S.base, 0, 0);
      for (let i = flickers.length - 1; i >= 0; i--) {
        const f = flickers[i], u = (now - f.t0) / f.dur;
        if (u >= 1) { flickers.splice(i, 1); continue; }
        reveal(S, f.x, f.y, f.r, env(Math.max(0, u)));
      }
      reveal(S, lens.x, lens.y, S.L.w > 500 ? 95 : 48, lens.a);
      if (onScreen && (flickers.length || lens.on || lens.a > 0.01)) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && scene && onScreen && !document.hidden) raf = requestAnimationFrame(frame); };

    const flick = (x?: number, y?: number) => {
      const S = scene;
      if (!S || !S.spots.length) return;
      if (x == null || y == null) { const i = Math.floor(Math.random() * (S.spots.length / 2)) * 2; x = S.spots[i]; y = S.spots[i + 1]; }
      const big = S.L.w > 500;
      flickers.push({ x, y, r: (big ? 60 : 30) + Math.random() * (big ? 40 : 20), t0: performance.now(), dur: 1500 + Math.random() * 900 });
      wake();
    };
    // the flickers on their own: one every 1.6 to 3.6 s while the hero is on screen, never with reduced motion
    const plan = () => {
      window.clearTimeout(timer);
      if (still || gone) return;
      timer = window.setTimeout(() => { if (onScreen && !document.hidden && flickers.length < 2) flick(); plan(); }, 1600 + Math.random() * 2000);
    };

    const layout = () => {
      if (gone || !grid) return;
      const box = c.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      const S = build(box, img, grid);
      if (!S) return;
      scene = S;
      c.width = S.base.width; c.height = S.base.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(S.base, 0, 0);
      wake();
      if (!told) { told = true; drawn.current?.(); plan(); }
    };
    let sizeRaf = 0;
    const sized = new ResizeObserver(() => { cancelAnimationFrame(sizeRaf); sizeRaf = requestAnimationFrame(layout); });
    const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); });

    // The pointer, in design px of the box: a mouse carries the lens; a tap or a pen press sets off one flicker.
    const toDesign = (e: PointerEvent): [number, number] | null => {
      const S = scene; if (!S) return null;
      const b = c.getBoundingClientRect();
      return [((e.clientX - b.left) / b.width) * S.L.w, ((e.clientY - b.top) / b.height) * S.L.h];
    };
    const host = c.parentElement;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const p = toDesign(e); if (!p) return;
      if (!lens.on && lens.a < 0.02) { lens.x = p[0]; lens.y = p[1]; }
      lens.tx = p[0]; lens.ty = p[1]; lens.on = true; wake();
    };
    const leave = () => { lens.on = false; wake(); };
    const down = (e: PointerEvent) => { if (e.pointerType === "mouse") return; const p = toDesign(e); if (p) flick(p[0], p[1]); };
    host?.addEventListener("pointermove", move);
    host?.addEventListener("pointerleave", leave);
    host?.addEventListener("pointerdown", down);

    const outline = new Image();
    outline.src = `${SRC}/dunes-outline.png`;
    Promise.all([img.decode(), outline.decode()])
      .then(() => { if (gone) return; grid = readGrid(img, outline); layout(); sized.observe(c); seen.observe(c); })
      // A photo that never loads leaves the notes on the night sky; the page still reads.
      .catch(() => { if (!gone) drawn.current?.(); });
    document.addEventListener("visibilitychange", wake);
    return () => {
      gone = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(sizeRaf); window.clearTimeout(timer);
      sized.disconnect(); seen.disconnect();
      host?.removeEventListener("pointermove", move);
      host?.removeEventListener("pointerleave", leave);
      host?.removeEventListener("pointerdown", down);
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
