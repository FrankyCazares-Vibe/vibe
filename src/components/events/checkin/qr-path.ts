/**
 * The door screen's QR as one SVG path (Oct 19 2026; contract:
 * handoffs/2026-10-19-checkin-build/CONTRACT.md §4.3, D13).
 *
 * WHY ON THE DEVICE. The link holds a live check-in token, so it is never
 * sent to an outside QR service: that would hand every event's link to a new
 * company and need a new host in the Content-Security-Policy. `uqr` (pinned
 * at 0.1.3, no dependencies) builds the matrix right here.
 *
 * WHY ONE PATH. One `<path>` with a small square per dark module stays crisp
 * at any size, needs no canvas, no `data:` URL and no injected markup, and
 * React draws it like any other element.
 *
 * Pure apart from `uqr`: the test runs it under plain Node.
 */
import { encode } from "uqr";

/**
 * ECC level M survives a smudged or glare-washed screen (up to 15% of the
 * code unreadable) without making the modules too small to read from a few
 * feet away. Border 4 is the quiet zone the QR standard asks for: cameras
 * find the code faster with that much white around it.
 */
export const QR_OPTIONS = { ecc: "M", border: 4 } as const;

/** What `encode` answers that the path needs: `size` counts the border. */
export type QrMatrix = { size: number; data: ReadonlyArray<ReadonlyArray<boolean>> };

/**
 * One `M x y h1v1h-1z` square per dark module, in reading order. The SVG's
 * viewBox is `0 0 size size`, so one module is one unit.
 */
export function qrPathFromMatrix(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    const row = matrix.data[y];
    if (!row) continue;
    for (let x = 0; x < matrix.size; x += 1) {
      if (row[x] === true) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** The matrix for `text` with the door's options, and its path. */
export function qrSvgFor(text: string): { size: number; path: string } {
  const qr = encode(text, QR_OPTIONS);
  return { size: qr.size, path: qrPathFromMatrix(qr) };
}
