/**
 * Re-encode an uploaded photo so it carries no metadata (S67 security wave B,
 * B3; finding #8).
 *
 * WHY. A phone photo's EXIF block holds the GPS position it was taken at, the
 * camera and often the owner's name. Every photo that lands in the PUBLIC
 * `profiles` bucket (profile photo, cover, work logo, post photo, a video's
 * poster frame) is readable by anyone with its URL, so a raw upload publishes
 * where a student lives. Re-encoding the pixels drops every block: EXIF (GPS
 * included), XMP, IPTC and the ICC profile (sharp converts to sRGB first, so
 * colours stay right).
 *
 * WHAT IT DOES, in order:
 *  1. Sniff the first bytes. Only JPEG, PNG, GIF and WebP pass; anything else
 *     (SVG, TIFF, HEIF, AVIF, HTML...) is refused BEFORE sharp sees it, so
 *     none of libvips' other decoders ever run on a stranger's file.
 *  2. Read the header and refuse a picture over MAX_INPUT_PIXELS (all frames
 *     of an animation count), a cheap guard against decompression bombs.
 *  3. `.rotate()` a single-frame image: the EXIF orientation is applied to
 *     the pixels, so the photo looks the same once the tag is gone.
 *  4. Shrink to `maxEdge` when asked (never enlarge).
 *  5. Write the SAME format back (GIFs stay animated, PNG keeps transparency)
 *     and never call withMetadata / keepExif / keepIccProfile.
 * The content type and extension come from the OUTPUT, never from the
 * client's declared type.
 *
 * FAILURES map onto the strings the clients already understand
 * (avatar-upload.ts, onboarding.html): "type" -> "Unsupported file type",
 * "size" -> "Invalid file size", "failed" -> "Upload failed".
 *
 * NOT "server-only", so node:test can load it; the only import is sharp.
 */

import sharp from "sharp";

export type StrippableFormat = "jpeg" | "png" | "webp" | "gif";

export type StripImageResult =
  | {
      ok: true;
      bytes: Buffer;
      format: StrippableFormat;
      contentType: string;
      ext: string;
      width: number;
      /** One frame's height (an animation's frames are stacked in `bytes`). */
      height: number;
    }
  | { ok: false; reason: "type" | "size" | "failed" };

/**
 * Largest picture decoded, counting every frame. 50 million covers a 48 MP
 * phone camera (8064 x 6048 = 48.8 M); an RGBA frame that size is ~200 MB,
 * and JPEG shrink-on-load keeps the real cost far lower.
 */
export const MAX_INPUT_PIXELS = 50_000_000;

const OUTPUT: Record<StrippableFormat, { contentType: string; ext: string }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
  gif: { contentType: "image/gif", ext: "gif" },
};

function startsWith(buf: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** The format the file's magic bytes say it is, or null for anything else. */
export function sniffImageFormat(buf: Uint8Array): StrippableFormat | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "gif";
  // "RIFF" <4-byte size> "WEBP"
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

/**
 * Decode, orient, optionally shrink and re-encode `input` with no metadata.
 * `maxEdge: null` keeps the size (résumé images: legibility, and redaction
 * bars are percentages of the upright page).
 */
export async function stripImage(
  input: Uint8Array,
  opts: { maxEdge: number | null },
): Promise<StripImageResult> {
  const format = sniffImageFormat(input);
  if (!format) return { ok: false, reason: "type" };
  // GIF and WebP can hold several frames; ask for all of them so an
  // animation stays animated.
  const multiFrameFormat = format === "gif" || format === "webp";
  const decodeOpts = { animated: multiFrameFormat, limitInputPixels: MAX_INPUT_PIXELS };

  try {
    const meta = await sharp(input, decodeOpts).metadata();
    // libvips must agree with the sniff, or the file is lying about itself.
    if (meta.format !== format) return { ok: false, reason: "type" };
    const width = meta.width ?? 0;
    // With `animated`, height is every frame stacked.
    const totalHeight = meta.height ?? 0;
    if (width <= 0 || totalHeight <= 0) return { ok: false, reason: "type" };
    if (width * totalHeight > MAX_INPUT_PIXELS) return { ok: false, reason: "size" };
    const frames = meta.pages ?? 1;

    let img = sharp(input, decodeOpts);
    // An animation has no orientation tag worth honouring; a still does.
    if (frames <= 1) img = img.rotate();
    if (opts.maxEdge !== null) {
      img = img.resize({
        width: opts.maxEdge,
        height: opts.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    switch (format) {
      case "jpeg":
        img = img.jpeg({ quality: 88 });
        break;
      case "png":
        img = img.png();
        break;
      case "webp":
        img = img.webp({ quality: 88 });
        break;
      case "gif":
        img = img.gif();
        break;
    }
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      bytes: data,
      format,
      ...OUTPUT[format],
      width: info.width,
      height: info.pageHeight ?? info.height,
    };
  } catch (e) {
    // The bytes already passed the sniff, so a decode failure means a corrupt
    // or lying file: "type". Only the pixel cap is "size".
    if (e instanceof Error) {
      return { ok: false, reason: /pixel limit/i.test(e.message) ? "size" : "type" };
    }
    return { ok: false, reason: "failed" };
  }
}
