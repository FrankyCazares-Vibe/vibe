import type { CSSProperties } from "react";

import { ART, ART_EXTRA } from "./art-data";

export type ArtName = keyof typeof ART;
type Layout = "desktop" | "phone";

const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
const em = (v: number) => `${+v.toFixed(4)}em`;

/**
 * Where one drawn SVG sits over its box, per layout, as CSS variables
 * (system.css reads --x --y --w --h on a desktop, --px --py --pw --ph on a
 * phone). The SVG's viewBox runs past the box where the handwriting does, so
 * it is placed by its own viewBox, in % of the box, or in em of the
 * wordmark's font size for the close.
 */
function place(name: ArtName, unit: "box" | "em"): CSSProperties {
  const out: Record<string, string> = {};
  for (const [v, pre] of [["desktop", "--"], ["phone", "--p"]] as [Layout, string][]) {
    const a = ART[name][v], [x, y, w, h] = a.view;
    if (unit === "em") {
      const F = ART_EXTRA.close[v].F;
      Object.assign(out, { [`${pre}x`]: em(x / F), [`${pre}y`]: em(y / F), [`${pre}w`]: em(w / F), [`${pre}h`]: em(h / F) });
    } else {
      Object.assign(out, { [`${pre}x`]: pct(x / a.w), [`${pre}y`]: pct(y / a.h), [`${pre}w`]: pct(w / a.w), [`${pre}h`]: pct(h / a.h) });
    }
  }
  return out as CSSProperties;
}

/**
 * One piece of hand-drawn art (handwriting as outlines, orbits, arrows),
 * made by the landing board's export.mjs: a desktop and a phone drawing,
 * picked by the same breakpoint as the layout. Decorative: the words it
 * draws are said by the section's own text or the picture's label.
 */
export function Art({ name, unit = "box", className = "", eager = false }: { name: ArtName; unit?: "box" | "em"; className?: string; eager?: boolean }) {
  const d = ART[name].desktop;
  return (
    <picture className={`fys-art ${className}`.trim()} style={place(name, unit)}>
      <source media="(max-width: 899px)" srcSet={`/landing/system/${name}-phone.svg`} />
      <img src={`/landing/system/${name}-desktop.svg`} width={d.view[2]} height={d.view[3]} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </picture>
  );
}
