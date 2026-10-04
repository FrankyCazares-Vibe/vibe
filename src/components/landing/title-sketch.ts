/**
 * The headline's constellation (S72, from prototype c): points of light land
 * on the tips of the letters, hairlines join them like a star chart while
 * the letters fade up, and the sketch dissolves. It is drawn on the clock of
 * the CSS entrance (landing.css, .vln-c), so it can only start where that
 * has got to: a line of the headline whose letters have begun is left out
 * whole, never shown half done. Transforms and opacity only, into a span
 * React never renders into; use-hero-title removes it all once it has played.
 */

export type Clock = { t0: number; dt: number; fade: number };
type Tip = { dx: number; dy: number };
type Ink = { top: Tip; bot: Tip };
type Glyph = Ink & { i: number; em: boolean; l: number; r: number; base: number };
type Row = { base: number; cs: Glyph[] };
type Point = { x: number; y: number; up: boolean; em: boolean; i: number };

const LAND_MS = 280, HOLD_MS = 240, DISSOLVE_MS = 440, EARLY_MS = 120;
const EASE = "cubic-bezier(.25,.7,.3,1)";

/**
 * Where each glyph's ink reaches highest and lowest (the middle of that row
 * of ink), from its pen position on the baseline. Canvas can't set the SOFT
 * and opsz axes; the tips move by a pixel at most, under a 4px point.
 */
function inkReader(font: string, size: number): (ch: string) => Ink {
  const s = Math.ceil(size * 1.5), ox = Math.round(size * 0.25), oy = Math.round(size * 1.05);
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const memo = new Map<string, Ink>();
  return (ch) => {
    const known = memo.get(ch);
    if (known) return known;
    let top: Tip | null = null, bot: Tip | null = null;
    if (cx) {
      cx.clearRect(0, 0, s, s);
      cx.font = font;
      cx.fillText(ch, ox, oy);
      const d = cx.getImageData(0, 0, s, s).data, on = (x: number, y: number) => d[(y * s + x) * 4 + 3] > 140;
      const run = (y: number): Tip | null => {
        let a = 0;
        while (a < s && !on(a, y)) a++;
        if (a === s) return null;
        let b = a;
        while (b < s && on(b, y)) b++;
        return { dx: (a + b - 1) / 2 - ox, dy: y - oy };
      };
      for (let y = 0; y < s && !top; y++) top = run(y);
      for (let y = s - 1; y >= 0 && !bot; y--) bot = run(y);
    }
    const ink = { top: top ?? { dx: 0, dy: -size / 2 }, bot: bot ?? { dx: 0, dy: 0 } };
    memo.set(ch, ink);
    return ink;
  };
}

/** Every letter by line, where it sits with its word's rise taken out (the rise is mid-air now). */
function measure(h1: HTMLElement): { size: number; rows: Row[] } {
  const box = h1.getBoundingClientRect(), style = getComputedStyle(h1), size = parseFloat(style.fontSize);
  const ink = inkReader(`${style.fontWeight} ${size}px ${style.fontFamily}`, size);
  const rows: Row[] = [];
  for (const w of h1.querySelectorAll<HTMLElement>(".vln-w")) {
    const lift = new DOMMatrixReadOnly(getComputedStyle(w).transform).m42;
    const marker = w.querySelector(".vln-bl");
    if (!marker) continue;
    const base = marker.getBoundingClientRect().bottom - box.top - lift;
    let row = rows.find((r) => Math.abs(r.base - base) < size * 0.3);
    if (!row) rows.push((row = { base, cs: [] }));
    for (const el of w.querySelectorAll<HTMLElement>(".vln-c")) {
      const r = el.getBoundingClientRect();
      row.cs.push({ ...ink(el.textContent ?? ""), i: Number(el.style.getPropertyValue("--i")), em: !!el.closest("em"), l: r.left - box.left, r: r.right - box.left, base });
    }
  }
  return { size, rows };
}

/** A few anchors per line, alternating tip up and foot down; an ascender pulls its group up, a descender down. */
function anchors(row: Row, size: number): Point[] {
  const cs = row.cs, n = Math.max(3, Math.round((cs[cs.length - 1].r - cs[0].l) / 75) + 1), pts: Point[] = [];
  let up = false;
  for (let k = 0; k < n; k++) {
    const g = cs.slice(Math.floor((k * cs.length) / n), Math.floor(((k + 1) * cs.length) / n));
    if (!g.length) continue;
    const asc = g.some((c) => -c.top.dy > size * 0.62), desc = g.some((c) => c.bot.dy > size * 0.12);
    up = asc && !desc ? true : desc && !asc ? false : !up;
    const c = g.reduce((a, b) => ((up ? b.top.dy < a.top.dy : b.bot.dy > a.bot.dy) ? b : a));
    const p = up ? c.top : c.bot;
    pts.push({ x: c.l + p.dx, y: c.base + p.dy, up, em: c.em, i: c.i });
  }
  return pts;
}

/** Draws what is still to come of the sketch, `elapsed` ms into the entrance. Returns its animations. */
export function playSketch(h1: HTMLElement, sky: HTMLElement, clock: Clock, elapsed: number): Animation[] {
  const { size, rows } = measure(h1);
  const pen = (i: number) => clock.t0 + i * clock.dt - 20;
  const out: Animation[] = [];
  const play = (n: HTMLElement, frames: Keyframe[], at: number, ms: number, easing = EASE, fill: FillMode = "both") =>
    out.push(n.animate(frames, { delay: Math.max(0, at - elapsed), duration: ms, easing, fill }));
  const add = (cls: string, x: number, y: number, width?: number) => {
    const n = document.createElement("span");
    n.className = cls;
    n.style.cssText = `left:${x}px;top:${y}px${width ? `;width:${width}px` : ""}`;
    sky.append(n);
    return n;
  };
  // One animation per point (two on the same properties keep Chrome off the compositor):
  // it lands, holds, and dissolves at `gone`. One the clock has passed lands now, not half lit.
  const point = (p: Point, at: number, gone: number) => {
    const n = add(`vln-pt${p.em ? " is-em" : ""}`, p.x, p.y);
    const from = Math.max(at, elapsed), held = Math.max(from + LAND_MS, gone), ms = held + DISSOLVE_MS - from;
    play(n, [
      { opacity: 0, transform: "scale(.3)", easing: EASE },
      { opacity: 1, transform: "scale(1)", offset: LAND_MS / ms },
      { opacity: 1, transform: "scale(1)", offset: (held - from) / ms, easing: "ease-in" },
      { opacity: 0, transform: "scale(.5)" },
    ], from, ms, "linear");
  };
  const line = (a: Point, b: Point, at: number, ms: number) => {
    const turn = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    const n = add(`vln-ln${a.em && b.em ? " is-em" : ""}`, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y));
    play(n, [{ transform: `${turn} scaleX(0)` }, { transform: `${turn} scaleX(1)` }], at, ms, "linear");
    play(n, [{ opacity: 1 }, { opacity: 0 }], at + ms + HOLD_MS, DISSOLVE_MS, "ease-in", "forwards");
  };

  const lines = rows.map((row) => anchors(row, size));
  rows.forEach((row, r) => {
    const pts = lines[r], first = row.cs[0].i, last = row.cs[row.cs.length - 1].i;
    // Whole lines only: a line whose letters have begun is left out, and its tie down with it,
    // so a late start draws the lines still to come, never a stray stroke through a word.
    if (pen(first) < elapsed) return;
    pts.forEach((p, k) => point(p, pen(first) - EARLY_MS + k * 40, pen(last) + HOLD_MS + 40));
    pts.slice(1).forEach((p, k) => line(pts[k], p, pen(pts[k].i), Math.max(40, pen(p.i) - pen(pts[k].i))));
    // One tie down to the next line: from this line's deepest foot to the nearest tip below.
    const below = lines[r + 1];
    if (!below?.length) return;
    const src = pts.filter((p) => !p.up).sort((a, b) => b.y - a.y)[0] ?? pts[pts.length - 1];
    const tips = below.some((p) => p.up) ? below.filter((p) => p.up) : below;
    const dst = [...tips].sort((a, b) => Math.abs(a.x - src.x) - Math.abs(b.x - src.x))[0];
    line(src, dst, Math.max(pen(src.i), pen(rows[r + 1].cs[0].i) - 40), 200);
  });
  return out;
}
