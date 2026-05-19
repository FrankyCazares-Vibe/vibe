/**
 * Shape + sanitizer for the `posts.edit_metadata` column used by the
 * clip composer's edit room. Stored as JSONB; ClipViewerMobile reads
 * it on playback and applies each effect lossless (no re-encode).
 */

import type { CSSProperties } from "react";

export const FILTER_PRESETS = ["warm", "cool", "bw", "vivid"] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];

export const ALLOWED_SPEEDS = [0.5, 1, 2] as const;
export type ClipSpeed = (typeof ALLOWED_SPEEDS)[number];

// Style enums for text overlays. All optional on the wire — older
// overlays predate these fields and fall back to the defaults below.
export const TEXT_OVERLAY_BGS = ["none", "scrim", "fill"] as const;
export type TextOverlayBg = (typeof TEXT_OVERLAY_BGS)[number];

export const TEXT_OVERLAY_FONTS = ["sans", "serif", "mono"] as const;
export type TextOverlayFont = (typeof TEXT_OVERLAY_FONTS)[number];

export const TEXT_OVERLAY_SIZES = ["s", "m", "l"] as const;
export type TextOverlaySize = (typeof TEXT_OVERLAY_SIZES)[number];

export type TextOverlay = {
  id: string;
  text: string;
  x: number; // 0-100 (% of width)
  y: number; // 0-100 (% of height)
  color: string; // hex like #FFFFFF
  /** Background style. Default "none" (text only with drop shadow). */
  bg?: TextOverlayBg;
  /** Font family. Default "sans" (DM Sans). */
  font?: TextOverlayFont;
  /** Font size bucket. Default "m" (22px at full scale). */
  size?: TextOverlaySize;
  /** Continuous scale multiplier (pinch-to-resize). Default 1.0.
   *  Clamped 0.4–3.0 server-side. Stacks with the `size` bucket — pick
   *  S / M / L for the base feel, then pinch for fine adjustment. */
  scale?: number;
  /** Visibility window in ms relative to clip start. When both are set
   *  the overlay only renders when `currentMs` is in [startMs, endMs].
   *  Either side optional — startMs default 0, endMs default clip end. */
  startMs?: number;
  endMs?: number;
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

// ── Style helper ───────────────────────────────────────────────────────────
//
// Every surface that renders text overlays (composer, ClipViewerMobile,
// ProfileMobile clips grid, desktop campus clip card) calls this so the
// look stays in sync. `scale` lets the small thumbnails downscale —
// pass 0.5 for a 1/2-size grid cell, etc.

const FONT_FAMILY: Record<TextOverlayFont, string> = {
  sans: "DM Sans, sans-serif",
  serif: "Fraunces, Georgia, serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

const FONT_WEIGHT: Record<TextOverlayFont, number> = {
  sans: 800,
  serif: 800,
  mono: 700,
};

const FONT_SIZE_PX: Record<TextOverlaySize, number> = {
  s: 18,
  m: 22,
  l: 32,
};

/**
 * Lightness check — picks dark/light text color when the user chose a
 * `fill` background. Crude (just averaged RGB) but accurate enough that
 * white text on yellow and black text on midnight both come out right.
 */
function isLightHex(hex: string): boolean {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

export function getOverlayCss(
  o: TextOverlay,
  scale = 1,
): CSSProperties {
  const font = o.font ?? "sans";
  const size = o.size ?? "m";
  const bg = o.bg ?? "none";
  // Continuous user-controlled scale (pinch-to-resize) stacks on top of
  // the per-surface render scale (small thumbnails downscale).
  const userScale = typeof o.scale === "number" ? o.scale : 1;
  const fontSize = Math.max(
    10,
    Math.round(FONT_SIZE_PX[size] * scale * userScale),
  );

  const base: CSSProperties = {
    color: o.color,
    fontFamily: FONT_FAMILY[font],
    fontWeight: FONT_WEIGHT[font],
    fontSize,
    lineHeight: 1.2,
    textAlign: "center",
    maxWidth: "82%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  if (bg === "scrim") {
    return {
      ...base,
      padding: `${Math.round(4 * scale)}px ${Math.round(10 * scale)}px`,
      borderRadius: Math.round(8 * scale),
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(2px)",
    };
  }
  if (bg === "fill") {
    return {
      ...base,
      color: isLightHex(o.color) ? "#0E0E10" : "#FFFFFF",
      padding: `${Math.round(4 * scale)}px ${Math.round(10 * scale)}px`,
      borderRadius: Math.round(8 * scale),
      background: o.color,
    };
  }
  // "none" — just text with a drop shadow so it reads over anything.
  return {
    ...base,
    textShadow: "0 1px 3px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.35)",
  };
}

/** True when the overlay should be painted at the given playback time.
 *  Both endpoints are optional — `startMs` defaults to 0 (clip start)
 *  and `endMs` defaults to infinity. */
export function isOverlayVisible(o: TextOverlay, currentMs: number): boolean {
  if (typeof o.startMs === "number" && currentMs < o.startMs) return false;
  if (typeof o.endMs === "number" && currentMs > o.endMs) return false;
  return true;
}

// ── Sanitizer ──────────────────────────────────────────────────────────────

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
      const text =
        typeof raw.text === "string"
          ? raw.text.slice(0, MAX_OVERLAY_TEXT_LEN)
          : "";
      if (!text.trim()) continue;
      const id =
        typeof raw.id === "string" && raw.id.length > 0
          ? raw.id.slice(0, 64)
          : Math.random().toString(36).slice(2, 10);
      const x = clamp(Number(raw.x), 0, 100);
      const y = clamp(Number(raw.y), 0, 100);
      const colorRaw =
        typeof raw.color === "string" ? raw.color : "#FFFFFF";
      const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : "#FFFFFF";
      const overlay: TextOverlay = { id, text, x, y, color };
      if (
        typeof raw.bg === "string" &&
        (TEXT_OVERLAY_BGS as readonly string[]).includes(raw.bg)
      ) {
        overlay.bg = raw.bg as TextOverlayBg;
      }
      if (
        typeof raw.font === "string" &&
        (TEXT_OVERLAY_FONTS as readonly string[]).includes(raw.font)
      ) {
        overlay.font = raw.font as TextOverlayFont;
      }
      if (
        typeof raw.size === "string" &&
        (TEXT_OVERLAY_SIZES as readonly string[]).includes(raw.size)
      ) {
        overlay.size = raw.size as TextOverlaySize;
      }
      if (typeof raw.scale === "number" && Number.isFinite(raw.scale)) {
        overlay.scale = clamp(raw.scale, 0.4, 3);
      }
      if (typeof raw.startMs === "number" && Number.isFinite(raw.startMs)) {
        overlay.startMs = Math.max(0, Math.round(raw.startMs));
      }
      if (typeof raw.endMs === "number" && Number.isFinite(raw.endMs)) {
        overlay.endMs = Math.max(0, Math.round(raw.endMs));
      }
      // Sanity: if both endpoints set, ensure end > start. If not, drop
      // both so the overlay defaults back to "always visible."
      if (
        overlay.startMs !== undefined &&
        overlay.endMs !== undefined &&
        overlay.endMs <= overlay.startMs
      ) {
        delete overlay.startMs;
        delete overlay.endMs;
      }
      overlays.push(overlay);
      if (overlays.length >= MAX_OVERLAYS) break;
    }
    if (overlays.length > 0) out.text_overlays = overlays;
  }

  // If nothing landed in `out`, return null so the column stays NULL.
  if (Object.keys(out).length === 0) return null;
  return out;
}
