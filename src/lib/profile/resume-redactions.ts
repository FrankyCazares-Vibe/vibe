/** A single redaction bar drawn over a resume / portfolio page.
 *  Coordinates are percentages (0–100) of the page wrap the bar lives
 *  on, so the bar reflows correctly when the viewer is resized. */
export type RedactionBar = {
  docIndex: number;
  pageNumber: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Cap so a runaway client can't flood the column. 200 is well above
 *  anything a real user draws on a 1-2 page resume. */
const MAX_BARS = 200;

function clampPct(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function asInt(n: unknown, min: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= min ? i : null;
}

/**
 * Coerce any value into a safe array of RedactionBar. Used both on
 * row reads (defensive — older rows might not have the column
 * populated) and on POSTs from profile.html (untrusted payload).
 *
 * Drops bars that are missing required fields or have absurd
 * coordinates. Caps total length at MAX_BARS.
 */
export function sanitizeResumeRedactions(v: unknown): RedactionBar[] {
  if (!Array.isArray(v)) return [];
  const out: RedactionBar[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const docIndex = asInt(o.docIndex, 0);
    const pageNumber = asInt(o.pageNumber, 1);
    const x = clampPct(o.x);
    const y = clampPct(o.y);
    const w = clampPct(o.w);
    const h = clampPct(o.h);
    if (
      docIndex === null ||
      pageNumber === null ||
      x === null ||
      y === null ||
      w === null ||
      h === null
    ) {
      continue;
    }
    // Sub-1% bars are misclicks (matches the client-side gesture
    // filter); skip them on the way in.
    if (w < 1 || h < 1) continue;
    out.push({ docIndex, pageNumber, x, y, w, h });
    if (out.length >= MAX_BARS) break;
  }
  return out;
}
