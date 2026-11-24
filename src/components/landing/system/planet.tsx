"use client";

import { useEffect, useRef } from "react";

import { ART_EXTRA } from "./art-data";
import { SYSTEM_WIDE_QUERY } from "./hero-dots";

/**
 * "made of your people.": a planet made of tiny people, lit from the top
 * left, with a ring of people round it and one coral person on the ring
 * (you), with room round you so you never sit on top of anyone. The recipe
 * is the "find your system" post's (vibe-marketing/campaigns/2026-11-
 * instagram/find-your-system/make-art.mjs), drawn here on a canvas so it can
 * live: under a mouse the people near
 * the pointer light up (a tap does it on a phone). Nobody lights up at random
 * (Franky, Nov 23: the random flicker was annoying). Paused off screen; device pixel ratio capped
 * at 2. In the post's own px: 1080 x 1350, placed in the box by
 * ART_EXTRA.planet so the drawn notes land on it.
 */

const CREAM = "#F6F1EA", CORAL = "#FF5C35", NIGHT = "#0C0B0B";
const CX = 540, CY = 610, R = 322, CELL = 15, TILT = (-16 * Math.PI) / 180, RX = R * 1.78, RY = R * 0.31;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Ring people this close to you (radians round the ring) step aside. */
const CLEAR = 0.19;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ringPt = (a: number): [number, number] => { const x = Math.cos(a) * RX, y = Math.sin(a) * RY; return [CX + x * Math.cos(TILT) - y * Math.sin(TILT), CY + x * Math.sin(TILT) + y * Math.cos(TILT)]; };

/** One tiny person: a head and shoulders, standing at (x, y), s times the post's size. */
function person(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.moveTo(x + 2.5 * s, y - 3.4 * s);
  c.arc(x, y - 3.4 * s, 2.5 * s, 0, Math.PI * 2);
  c.moveTo(x - 4.4 * s, y + 4.6 * s);
  c.quadraticCurveTo(x - 4.4 * s, y - 0.4 * s, x, y - 0.4 * s);
  c.quadraticCurveTo(x + 4.4 * s, y - 0.4 * s, x + 4.4 * s, y + 4.6 * s);
  c.closePath();
}

type Body = { x: number; y: number; s: number; o: number };

/** Everyone, once: the back of the ring, the planet, the front of the ring (in drawing order). */
function people(youA: number) {
  const r = rng(7), back: Body[] = [], planet: Body[] = [], front: Body[] = [];
  const L = (() => { const v = [-0.55, -0.62, 0.56], m = Math.hypot(...v); return v.map((x) => x / m); })();
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2, [x, y] = ringPt(a), isFront = Math.sin(a) > 0;
    const gap = Math.abs(Math.atan2(Math.sin(a - youA), Math.cos(a - youA)));
    if (isFront && gap < CLEAR) continue;
    (isFront ? front : back).push({ x, y, s: 0.78, o: isFront ? 0.9 : 0.45 });
  }
  for (let gy = CY - R; gy <= CY + R; gy += CELL) for (let gx = CX - R; gx <= CX + R; gx += CELL) {
    const ox = (Math.floor((gy - CY + R) / CELL) % 2) * CELL * 0.5, x = gx + ox, y = gy;
    const nx = (x - CX) / R, ny = (y - CY) / R, d2 = nx * nx + ny * ny;
    if (d2 > 0.985) continue;
    const nz = Math.sqrt(1 - d2), lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const b = 0.2 + 0.8 * Math.pow(lam, 1.1), th = BAYER[(Math.round(gy / CELL) & 3) * 4 + (Math.round(gx / CELL) & 3)];
    if (b > th) planet.push({ x, y, s: 0.92 + (r() - 0.5) * 0.12, o: Math.min(1, 0.35 + b * 0.7) });
  }
  return { back, planet, front };
}

function fill(c: CanvasRenderingContext2D, list: Body[], color: string) {
  c.fillStyle = color;
  const byOp = new Map<number, Body[]>();
  for (const p of list) { const k = Math.round(p.o * 20); (byOp.get(k) ?? byOp.set(k, []).get(k)!).push(p); }
  for (const [k, g] of byOp) { c.globalAlpha = k / 20; c.beginPath(); for (const p of g) person(c, p.x, p.y, p.s); c.fill(); }
  c.globalAlpha = 1;
}
function ring(c: CanvasRenderingContext2D, isFront: boolean) {
  c.beginPath();
  for (let i = 0; i <= 80; i++) { const [x, y] = ringPt((isFront ? 0 : Math.PI) + (i / 80) * Math.PI); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  c.strokeStyle = CREAM; c.globalAlpha = isFront ? 0.32 : 0.16; c.lineWidth = 1.4; c.stroke(); c.globalAlpha = 1;
}
function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

/** Someone lighting up: who, when, for how long, and how fast they flutter (beats a second, like a wing). */
type Spark = { i: number; t0: number; dur: number; coral: boolean; hz: number; ph: number };
const beat = (ms: number, hz: number, ph: number) => 0.5 + 0.5 * Math.tanh(3.2 * Math.sin((ms / 1000) * hz * Math.PI * 2 + ph));

export function Planet() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const youA = ART_EXTRA.planet.youA, [yx, yy] = ringPt(youA), crowd = people(youA);
    const lit = [...crowd.planet, ...crowd.front];
    const base = document.createElement("canvas"), bctx = base.getContext("2d");
    let m = [1, 0, 0], raf = 0, onScreen = false, gone = false;
    const sparks: Spark[] = [];
    const lens = { x: 0, y: 0, a: 0, on: false };

    const layout = () => {
      if (!bctx) return;
      const box = c.getBoundingClientRect();
      if (box.width < 2) return;
      const place = window.matchMedia(SYSTEM_WIDE_QUERY).matches ? ART_EXTRA.planet.desktop : ART_EXTRA.planet.phone;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), k = ((place[2] * box.width) / 1080) * dpr;
      m = [k, place[0] * box.width * dpr, place[1] * box.height * dpr];
      c.width = base.width = Math.round(box.width * dpr);
      c.height = base.height = Math.round(box.height * dpr);
      bctx.setTransform(k, 0, 0, k, m[1], m[2]);
      bctx.clearRect(-m[1] / k, -m[2] / k, base.width / k, base.height / k);
      ring(bctx, false);
      fill(bctx, crowd.back, CREAM);
      bctx.fillStyle = NIGHT; bctx.beginPath(); bctx.arc(CX, CY, R + 6, 0, Math.PI * 2); bctx.fill();
      bctx.strokeStyle = CREAM; bctx.globalAlpha = 0.08; bctx.lineWidth = 1.5; bctx.stroke(); bctx.globalAlpha = 1;
      fill(bctx, crowd.planet, CREAM);
      ring(bctx, true);
      fill(bctx, crowd.front, CREAM);
      // you: the one coral person, with a soft light and room round you
      glow(bctx, yx, yy, 46, "255,92,53", 0.5);
      bctx.fillStyle = CORAL; bctx.beginPath(); person(bctx, yx, yy, 2.5); bctx.fill();
      draw(performance.now());
    };

    // on almost at once, fluttering, then dying away (the hero's flutter, smaller)
    const env = (u: number) => (u < 0.08 ? u / 0.08 : Math.pow(1 - (u - 0.08) / 0.92, 1.3));
    const draw = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(m[0], 0, 0, m[0], m[1], m[2]);
      lens.a += ((lens.on ? 1 : 0) - lens.a) * 0.12;
      for (let j = sparks.length - 1; j >= 0; j--) {
        const s = sparks[j], u = (now - s.t0) / s.dur;
        if (u >= 1) { sparks.splice(j, 1); continue; }
        if (u < 0) continue;
        const p = lit[s.i], e = env(u) * (0.1 + 0.9 * beat(now - s.t0, s.hz, s.ph));
        glow(ctx, p.x, p.y - 1, 11, s.coral ? "255,92,53" : "246,241,234", 0.55 * e);
        ctx.globalAlpha = e; ctx.fillStyle = s.coral ? CORAL : CREAM; ctx.beginPath(); person(ctx, p.x, p.y, p.s * 1.08); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (lens.a > 0.01) {
        ctx.fillStyle = CREAM;
        for (const p of lit) {
          const d = Math.hypot(p.x - lens.x, p.y - lens.y);
          if (d > 90) continue;
          const e = lens.a * (1 - d / 90) ** 2;
          ctx.globalAlpha = Math.min(1, e * 1.2); ctx.beginPath(); person(ctx, p.x, p.y, p.s); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    };

    const loop = (now: number) => {
      raf = 0;
      if (gone) return;
      draw(now);
      if (onScreen && !document.hidden && (sparks.length || lens.on || lens.a > 0.01)) raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(loop); };

    const toPost = (e: PointerEvent): [number, number] => {
      const b = c.getBoundingClientRect(), dpr = c.width / b.width;
      return [((e.clientX - b.left) * dpr - m[1]) / m[0], ((e.clientY - b.top) * dpr - m[2]) / m[0]];
    };
    const host = c.parentElement?.parentElement ?? c;
    const move = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; [lens.x, lens.y] = toPost(e); lens.on = true; wake(); };
    const leave = () => { lens.on = false; wake(); };
    // a tap: the people round it light up, one after another (with reduced motion, one plain fade each, no flutter)
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const [x, y] = toPost(e), now = performance.now();
      lit.map((p, i) => [Math.hypot(p.x - x, p.y - y), i]).sort((a, b) => a[0] - b[0]).slice(0, 8)
        .forEach(([, i], n) => sparks.push(still
          ? { i, t0: now, dur: 600, coral: false, hz: 0, ph: Math.PI / 2 }
          : { i, t0: now + n * 60, dur: 800, coral: false, hz: 14 + Math.random() * 6, ph: Math.random() * Math.PI * 2 }));
      wake();
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointerdown", down);
    const sized = new ResizeObserver(layout);
    const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); });
    sized.observe(c);
    seen.observe(c);
    document.addEventListener("visibilitychange", wake);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      sized.disconnect(); seen.disconnect();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointerdown", down);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return <canvas ref={ref} className="fys-planet" aria-hidden="true" />;
}
