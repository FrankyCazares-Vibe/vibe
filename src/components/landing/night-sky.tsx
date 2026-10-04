"use client";

import { useEffect, useRef } from "react";

/** One light in the sky. `m` / `d` are its phone and wide positions, as fractions of the hero box. */
export type SkyLight = { id: string; rgb: string; size: number; m: [number, number]; d: [number, number] };

/** Below this hero width the lights sit at their phone positions. landing.css uses the same number. */
export const SKY_WIDE_PX = 760;

const WARP_MS = 700;
/** A frame this soon after the last drawn one is skipped: only screens above about 110 Hz ask that often. */
const MIN_GAP_MS = 9;
const DUST_TINTS = ["246,241,234", "255,176,146", "172,196,255"] as const;

/** Small seeded generator, so the sky is the same sky on every visit. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(1 - u, 3));

/**
 * The landing hero's sky, drawn on one canvas: drifting dust, the lights
 * (each its own colour, with an orbit and a moon), the thin lines between
 * them, sparks that travel the lines and a shooting star now and then.
 * `warping` streaks the dust outward on the way to sign-up. With reduced
 * motion it draws one still frame and stops. Every other frame on 120 Hz screens.
 * The two slow clouds of colour behind it are CSS (.vln-clouds in
 * landing.css): full-screen gradients redrawn every frame were most of the
 * frame when a phone draws canvas on the CPU.
 * Decorative only: the lights' buttons and labels are real DOM in home-landing.
 */
export function NightSky({ lights, links, activeId, warping }: { lights: SkyLight[]; links: [number, number][]; activeId: string | null; warping: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ activeId, warping, warpAt: 0 });

  useEffect(() => {
    if (warping && !live.current.warping) live.current.warpAt = performance.now();
    live.current.activeId = activeId;
    live.current.warping = warping;
  }, [activeId, warping]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = seeded(7);
    const dust = Array.from({ length: 560 }, () => ({ x: rand(), y: rand(), z: 0.15 + rand() * 0.85, r: 0.35 + rand() * 0.9, ph: rand() * 6.28, sp: 0.4 + rand() * 1.3, tint: rand() < 0.12 ? 1 : rand() < 0.12 ? 2 : 0 }));
    const sparks: { link: number; at: number; flip: boolean }[] = [];
    const t0 = performance.now();
    let w = 0, h = 0, dpr = 1, raf = 0, onScreen = true, nextSpark = 2200, lastDraw = -Infinity;
    let px = 0, py = 0, tx = 0, ty = 0;
    let shot: { at: number; x: number; y: number; dir: number } | null = null, nextShot = 3800;

    const at = (l: SkyLight, t: number): [number, number] => {
      const [fx, fy] = w < SKY_WIDE_PX ? l.m : l.d;
      return [fx * w + px * 6, fy * h + py * 4 + (still ? 0 : Math.sin(t / 2600 + fx * 9) * 2)];
    };

    const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(0.35, `rgba(${rgb},${a * 0.3})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
    };

    const draw = (now: number) => {
      const t = now - t0;
      const warp = live.current.warping && !still ? Math.min(1, (now - live.current.warpAt) / WARP_MS) : 0;
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      const count = Math.min(dust.length, Math.round((w * h) / 2300));
      const cx = w / 2, cy = h * 0.42, lift = window.scrollY;
      for (let i = 0; i < count; i++) {
        const p = dust[i];
        const x = (((p.x * w + (still ? 0 : t * 0.0035 * p.z)) % w) + w) % w + px * p.z * 22;
        const y = p.y * h + py * p.z * 16 - lift * p.z * 0.12;
        ctx.globalAlpha = (0.16 + 0.5 * p.z) * (still ? 0.8 : 0.62 + 0.38 * Math.sin((t / 1000) * p.sp + p.ph));
        if (warp > 0) {
          const k1 = 1 + warp * warp * 8 * p.z, k0 = 1 + Math.pow(Math.max(0, warp - 0.14), 2) * 8 * p.z;
          ctx.strokeStyle = `rgb(${DUST_TINTS[p.tint]})`;
          ctx.lineWidth = p.r;
          ctx.beginPath();
          ctx.moveTo(cx + (x - cx) * k0, cy + (y - cy) * k0);
          ctx.lineTo(cx + (x - cx) * k1, cy + (y - cy) * k1);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgb(${DUST_TINTS[p.tint]})`;
          ctx.beginPath();
          ctx.arc(x, y, p.r * (0.5 + p.z * 0.6), 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "lighter";

      // A shooting star now and then, across the top of the sky.
      if (!still && !shot && t > nextShot) shot = { at: t, x: w * (0.15 + rand() * 0.7), y: h * (0.04 + rand() * 0.26), dir: rand() < 0.5 ? 1 : -1 };
      if (shot) {
        const u = (t - shot.at) / 850;
        if (u >= 1) { shot = null; nextShot = t + 4200 + rand() * 5200; }
        else {
          const hx = shot.x + shot.dir * 230 * u, hy = shot.y + 96 * u, tail = 96 * Math.sin(u * Math.PI);
          const streak = ctx.createLinearGradient(hx - shot.dir * tail, hy - tail * 0.42, hx, hy);
          streak.addColorStop(0, "rgba(255,250,244,0)");
          streak.addColorStop(1, `rgba(255,250,244,${0.85 * Math.sin(u * Math.PI) * (1 - warp)})`);
          ctx.strokeStyle = streak;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(hx - shot.dir * tail, hy - tail * 0.42);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }
      }

      const lit = lights.map((_, i) => (still ? 1 : ease((t - 350 - i * 170) / 700)) * (1 - warp));
      const spot = lights.map((l) => at(l, t));
      const hotId = live.current.activeId;

      links.forEach(([a, b]) => {
        const g = Math.min(lit[a], lit[b]);
        if (g <= 0) return;
        const hot = lights[a].id === hotId || lights[b].id === hotId;
        const [ax, ay] = spot[a], [bx, by] = spot[b];
        const line = ctx.createLinearGradient(ax, ay, bx, by);
        line.addColorStop(0, `rgba(${lights[a].rgb},${(hot ? 0.55 : 0.17) * g})`);
        line.addColorStop(1, `rgba(${lights[b].rgb},${(hot ? 0.55 : 0.17) * g})`);
        ctx.strokeStyle = line;
        ctx.lineWidth = hot ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (bx - ax) * g, ay + (by - ay) * g);
        ctx.stroke();
      });

      if (!still && t > nextSpark && links.length > 0) {
        sparks.push({ link: Math.floor(rand() * links.length), at: t, flip: rand() < 0.5 });
        nextSpark = t + 450 + rand() * 900;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i], u = (t - s.at) / 1700;
        if (u >= 1) { sparks.splice(i, 1); continue; }
        const [a, b] = s.flip ? [links[s.link][1], links[s.link][0]] : links[s.link];
        // The head and a short tail behind it.
        for (let k = 0; k < 4; k++) {
          const v = Math.max(0, u - k * 0.035), e = v * v * (3 - 2 * v);
          glow(spot[a][0] + (spot[b][0] - spot[a][0]) * e, spot[a][1] + (spot[b][1] - spot[a][1]) * e, 10 - k * 2, u < 0.5 ? lights[a].rgb : lights[b].rgb, Math.sin(u * Math.PI) * (0.95 - k * 0.22) * (1 - warp));
        }
      }

      lights.forEach((l, i) => {
        if (lit[i] <= 0) return;
        const [x, y] = spot[i];
        const r = l.size * (w < SKY_WIDE_PX ? 1 : 1.45) * lit[i] * (still ? 1 : 1 + 0.16 * Math.sin(t / 1400 + i * 1.7)) * (l.id === hotId ? 1.45 : 1);
        glow(x, y, r * 7, l.rgb, 0.22 * lit[i]);
        glow(x, y, r * 2, l.rgb, 0.9 * lit[i]);
        ctx.fillStyle = `rgba(255,250,244,${0.95 * lit[i]})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + l.size * 0.13, 0, 6.2832);
        ctx.fill();

        // Each light is a small system: a tilted orbit and one moon going round it.
        const hot = l.id === hotId, tilt = -0.5 + i * 0.37, rx = r * 3 + 8, ry = rx * 0.36;
        ctx.strokeStyle = `rgba(${l.rgb},${(hot ? 0.55 : 0.24) * lit[i]})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, tilt, 0, 6.2832);
        ctx.stroke();
        const turn = (still ? 0 : t / (1500 + i * 260)) + i * 2.1, ox = Math.cos(turn) * rx, oy = Math.sin(turn) * ry;
        glow(x + ox * Math.cos(tilt) - oy * Math.sin(tilt), y + ox * Math.sin(tilt) + oy * Math.cos(tilt), 4.5, l.rgb, lit[i]);
        if (hot && !still) {
          const ring = (t % 1400) / 1400;
          ctx.strokeStyle = `rgba(${l.rgb},${0.45 * (1 - ring)})`;
          ctx.beginPath();
          ctx.arc(x, y, r * 2 + ring * 46, 0, 6.2832);
          ctx.stroke();
        }
      });
    };

    // A 120 Hz screen asks for a frame every 8.3 ms: draw every other one
    // (60 a second; 144 Hz draws 72). 60 to 100 Hz screens, and the demo
    // recorder's 60 fps clock, draw every frame: a cap at 16.7 ms would halve
    // a 75 or 90 Hz screen, whose frames come 13.3 or 11.1 ms apart.
    const loop = (now: number) => {
      if (now - lastDraw >= MIN_GAP_MS) {
        lastDraw = now;
        draw(now);
      }
      raf = onScreen && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => { if (!still && !raf && onScreen && !document.hidden) raf = requestAnimationFrame(loop); };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.width;
      h = box.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (still) draw(performance.now());
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = 0.5 - e.clientX / window.innerWidth;
      ty = 0.5 - e.clientY / window.innerHeight;
    };
    const seen = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; wake(); });
    const sized = new ResizeObserver(resize);

    resize();
    sized.observe(canvas);
    seen.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      seen.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [lights, links]);

  return <canvas ref={ref} className="vln-sky" aria-hidden="true" />;
}
