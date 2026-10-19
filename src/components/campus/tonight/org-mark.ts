/**
 * A club's mark on the Tonight and "Your clubs" panels (Oct 19 2026): its
 * colour, its initials and the gradient tile behind them.
 *
 * WHY A TWIN. campus-home.tsx draws the same marks on post cards, but its
 * helpers aren't exported, and new Tonight files must never import runtime
 * values from campus-home (that would be an import cycle once campus-home
 * mounts them). So these are exact copies, and org-mark.test.ts reads
 * campus-home's source to keep them in step: the same club gets the same
 * colour in the panel and on its post cards on the same page.
 *
 * PURE: no imports. Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.3.
 */

/** The same eight colours, in the same order, as campus-home.tsx's ORG_PALETTE. */
export const ORG_PALETTE: readonly string[] = [
  "#FF5C35", // brand orange
  "#7B5FE0", // sand purple
  "#1C5C2E", // forest
  "#5A9CFF", // sky
  "#D4A30E", // amber
  "#9B7BFF", // lavender
  "#E84D4D", // red
  "#2A8A8A", // teal
];

/** Deterministic per id (the 31-multiplier hash), so a club keeps its colour with no stored column. */
export function colorForOrg(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ORG_PALETTE[hash % ORG_PALETTE.length];
}

/** "Climbing Club" → "CC": the first letter of the first two words. */
export function initialsForOrg(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

/** "#FF5C35", 0.5 → "rgba(255, 92, 53, 0.5)". */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The post card's tile behind a club's initials (campus-home.tsx, the org avatar). */
export function orgMarkBackground(id: string): string {
  const c = colorForOrg(id);
  return `linear-gradient(135deg, ${hexToRgba(c, 0.95)} 0%, ${hexToRgba(c, 0.6)} 100%)`;
}
