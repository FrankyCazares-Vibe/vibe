"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A photo with no hard edge (round 6, Nov 23: "get rid of these hard
 * edges"): whole in the middle, breaking into dots of itself toward a soft
 * oval rim, the hero's dissolve in a smaller form. Drawn once per size on a
 * canvas from the <picture> beside it (so the browser picks AVIF or WebP and
 * the width); device pixel ratio capped at 2. Until it is drawn, and without
 * JavaScript, the plain photo shows.
 */
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function draw(c: HTMLCanvasElement, img: HTMLImageElement) {
  const box = c.getBoundingClientRect();
  if (box.width < 2) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = box.width, H = box.height;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const ctx = c.getContext("2d"), mask = document.createElement("canvas"), m = mask.getContext("2d");
  const small = document.createElement("canvas"), sx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx || !m || !sx) return false;
  mask.width = c.width; mask.height = c.height;
  // brightness on a coarse grid, for the dots' sizes
  const GW = 90, GH = Math.round((GW * H) / W);
  small.width = GW; small.height = GH;
  sx.drawImage(img, 0, 0, GW, GH);
  const px = sx.getImageData(0, 0, GW, GH).data;
  const lum = (x: number, y: number) => { const i = (Math.min(GH - 1, Math.max(0, Math.floor((y / H) * GH))) * GW + Math.min(GW - 1, Math.max(0, Math.floor((x / W) * GW)))) * 4; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
  const g = Math.max(3.4, W / 110);
  m.setTransform(dpr, 0, 0, dpr, 0, 0);
  m.fillStyle = "#fff";
  const groups = new Map<number, number[]>();
  for (let y = g / 2; y < H; y += g) for (let x = g / 2 + ((Math.round(y / g) % 2) * g) / 2; x < W; x += g) {
    // a soft oval, like the hero: whole in the middle, broken into dots toward the rim, gone at the corners
    const d = Math.hypot((x - W / 2) / (W * 0.5), (y - H * 0.5) / (H * 0.5)), t = smooth(0.56, 0.98, d);
    const v = smooth(20, 235, lum(x, y)) * (1 - smooth(0.94, 1.12, d)) * smooth(0, g * 2, Math.min(x, W - x, y, H - y));
    const k = Math.pow(1 - t, 1.4), r = g * 0.75 * k + g * 0.5 * Math.pow(v, 1.1) * (1 - k);
    if (r < 0.3) continue;
    const a = Math.round((1 - t * 0.35) * 20);
    (groups.get(a) ?? groups.set(a, []).get(a)!).push(x, y, r);
  }
  for (const [a, list] of groups) {
    m.globalAlpha = a / 20; m.beginPath();
    for (let i = 0; i < list.length; i += 3) { m.moveTo(list[i] + list[i + 2], list[i + 1]); m.arc(list[i], list[i + 1], list[i + 2], 0, TAU); }
    m.fill();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, W, H);
  ctx.globalCompositeOperation = "destination-in";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return true;
}

export function DotPhoto({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = ref.current, c = cv.current, img = host?.querySelector("img");
    if (!host || !c || !img) return;
    let gone = false, raf = 0;
    const go = () => { raf = 0; if (!gone && img.complete && img.naturalWidth && draw(c, img)) host.dataset.dotted = ""; };
    const ask = () => { if (!raf) raf = requestAnimationFrame(go); };
    if (img.complete && img.naturalWidth) ask(); else img.addEventListener("load", ask, { once: true });
    const sized = new ResizeObserver(ask);
    sized.observe(c);
    return () => { gone = true; cancelAnimationFrame(raf); sized.disconnect(); };
  }, []);
  return (
    <div ref={ref} className="fys-dotphoto">
      {children}
      <canvas ref={cv} aria-hidden="true" />
    </div>
  );
}
