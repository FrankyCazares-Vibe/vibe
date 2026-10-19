"use client";

/**
 * The door screen's QR (Oct 19 2026; contract §4.3, D13): an inline SVG drawn
 * on this device from `qr-path.ts`. No outside QR service, no `data:` URL and
 * no injected markup.
 *
 * `size` is any CSS length for the square's side ("100%", "320px"); `label`
 * is what a screen reader says for the code, since the picture itself means
 * nothing read aloud.
 */
import { useMemo } from "react";

import { qrSvgFor } from "./qr-path";

/**
 * The one fixed colour pair in check-in, on purpose: dark modules on white in
 * every theme, Night included. Many phone cameras misread an inverted
 * (light-on-dark) code, and a door line can't debug that.
 */
const QR_PAPER = "#fff";
const QR_INK = "#000";

export function QrCode({ text, size, label }: { text: string; size: string; label: string }) {
  // Encoding is the slow part (a few ms); the door redraws every second for
  // its countdown, so only a new link encodes again.
  const qr = useMemo(() => qrSvgFor(text), [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      style={{ display: "block", width: size, height: size }}
    >
      <rect width={qr.size} height={qr.size} fill={QR_PAPER} />
      <path d={qr.path} fill={QR_INK} />
    </svg>
  );
}
