/**
 * Shape + sanitizer for the `posts.edit_metadata` column used by the
 * clip composer's edit room. Stored as JSONB; ClipViewerMobile reads
 * it on playback and applies each effect lossless (no re-encode).
 */

export const FILTER_PRESETS = ["warm", "cool", "bw", "vivid"] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];

export const ALLOWED_SPEEDS = [0.5, 1, 2] as const;
export type ClipSpeed = (typeof ALLOWED_SPEEDS)[number];

export type TextOverlay = {
  id: string;
  text: string;
  x: number; // 0-100 (% of width)
  y: number; // 0-100 (% of height)
  color: string; // hex like #FFFFFF
};

export type ClipEditMetadata = {
  speed?: ClipSpeed;
  filter?: FilterPreset | null;
  trim?: { start_ms: number; end_ms: number } | null;
  text_overlays?: TextOverlay[];
};

const MAX_OVERLAYS = 20;
const MAX_OVERLAY_TEXT_LEN = 140;

/** CSS `filter` value for each preset — applied to the <video> element. */
export const FILTER_CSS: Record<FilterPreset, string> = {
  warm: "saturate(1.15) hue-rotate(-8deg) brightness(1.04)",
  cool: "saturate(1.1) hue-rotate(8deg) brightness(0.98)",
  bw: "grayscale(1) contrast(1.08)",
  vivid: "saturate(1.55) contrast(1.1)",
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validates + clamps an untrusted edit_metadata payload from the client.
 *  Returns null when there's nothing usable so the DB column stays NULL. */
export function sanitizeEditMetadata(input: unknown): ClipEditMetadata | null {
  if (!isObject(input)) return null;
  const out: ClipEditMetadata = {};

  if (typeof input.speed === "number") {
    const allowed = (ALLOWED_SPEEDS as readonly number[]).includes(input.speed);
    if (allowed) out.speed = input.speed as ClipSpeed;
  }

  if (typeof input.filter === "string") {
    if ((FILTER_PRESETS as readonly string[]).includes(input.filter)) {
      out.filter = input.filter as FilterPreset;
    }
  }

  if (isObject(input.trim)) {
    const s = Number((input.trim as Record<string, unknown>).start_ms);
    const e = Number((input.trim as Record<string, unknown>).end_ms);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s && s >= 0) {
      out.trim = { start_ms: Math.round(s), end_ms: Math.round(e) };
    }
  }

  if (Array.isArray(input.text_overlays)) {
    const overlays: TextOverlay[] = [];
    for (const raw of input.text_overlays) {
      if (!isObject(raw)) continue;
      const text = typeof raw.text === "string" ? raw.text.slice(0, MAX_OVERLAY_TEXT_LEN) : "";
      if (!text.trim()) continue;
      const id =
        typeof raw.id === "string" && raw.id.length > 0
          ? raw.id.slice(0, 64)
          : Math.random().toString(36).slice(2, 10);
      const x = clamp(Number(raw.x), 0, 100);
      const y = clamp(Number(raw.y), 0, 100);
      const colorRaw = typeof raw.color === "string" ? raw.color : "#FFFFFF";
      const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : "#FFFFFF";
      overlays.push({ id, text, x, y, color });
      if (overlays.length >= MAX_OVERLAYS) break;
    }
    if (overlays.length > 0) out.text_overlays = overlays;
  }

  // If nothing landed in `out`, return null so the column stays NULL.
  if (Object.keys(out).length === 0) return null;
  return out;
}
