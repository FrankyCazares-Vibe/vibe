/**
 * Make a chat photo smaller in the browser before it is sent (launch
 * checklist of Oct 12 2026, item 11).
 *
 * WHY. A photo sent in a direct or group chat went up exactly as the phone
 * took it, up to 15 MB, and everyone in the chat then downloaded all of it,
 * often on cell data. Post photos were already shrunk (ImageCropperModal in
 * the browser, strip-image.ts on the server). Chat uploads go straight from
 * the browser to storage, so the browser is the only place to do it.
 *
 * WHAT `shrinkPhoto` DOES, in order:
 *  1. Only a JPEG, PNG or WebP over about 1 MB is touched. GIFs, videos and
 *     anything smaller are left alone.
 *  2. Read the first bytes. An animated PNG or WebP, or a file that is not
 *     what its type says, is left alone: a canvas would keep a single frame.
 *  3. Decode it through an <img>. That path applies the rotation a phone
 *     writes into the file, so the photo comes out the right way up (the
 *     cropper relies on the same thing).
 *  4. Draw it at 2048 px on the long edge, never larger than it was. A long
 *     thin picture (more than 3 times as long as it is wide) is left alone
 *     instead: a scrolling screenshot or a panorama scaled to 2048 comes
 *     out a strip too thin to read.
 *  5. Look at the drawn pixels. If any of them is see-through, the original
 *     is kept. JPEG has no transparency, so a see-through PNG would come out
 *     on black; we leave such a picture alone rather than flatten it on
 *     white. The same look catches a draw that painted nothing (a phone out
 *     of memory), which would otherwise send a black rectangle. The look is
 *     forgiving in two small ways, so a browser's own rounding can't make
 *     every photo read as see-through: see `hasSeeThroughPixels`.
 *  6. Export JPEG at 0.85 and keep it only when it is smaller than the pick.
 *
 * NEVER WORSE. A step that fails, takes too long or does not help answers
 * null, and the caller sends the original exactly as before. `shrinkPhoto`
 * never throws and never rejects. Two quiet ways to go wrong are checked
 * for by name: a privacy mode that hands a page a blank picture when it
 * reads a canvas (one known dot is painted and read back first), and a
 * decode that never answers (the job gives up after 10 seconds).
 *
 * WHY IT KEPT THE ORIGINAL. Nothing tells the student, on purpose. A caller
 * can pass `onKeptOriginal` to hear which rule decided (`KeptOriginalWhy`);
 * the chat logs it to the console in dev builds only.
 *
 * WHAT THE CALLER OWES. The upload route signs the declared size and type
 * into the storage URL, and names the stored file from the type. So declare
 * and upload the SAME file: `shrunk.file` with `shrunk.contentType`, or the
 * original with its own.
 *
 * SIDE EFFECT. A redrawn photo carries none of the hidden details the camera
 * saved, the location included. It is not a promise: it happens in the
 * browser, and a GIF, a video, a small photo, a picture this file leaves
 * alone on purpose and a shrink that did not work out all go up untouched.
 * The Privacy Policy (section 3c) has to say it that way: a change to these
 * rules and a change to that section go out the same day.
 * (Read from the files themselves on Oct 12 2026: Chrome 154 writes no Exif
 * block at all. Safari 27 and iOS Safari 26.4 write a small one of their
 * own that holds the copy's size and colour space and nothing of the
 * camera's. So "Exif" inside a chat photo is not, alone, a leak.)
 *
 * NO IMPORTS, so node:test loads it directly. The page (document, Image,
 * canvas) is only touched inside `shrinkPhoto`. A static page can't import
 * this file at all: public/html/messages.html (the full Messages page on a
 * computer) has its own upload code and needs a hand copy kept in step.
 */

/** Photos at or under this size are sent as picked ("about 1 MB"). */
export const SHRINK_OVER_BYTES = 1024 * 1024;
/** Long edge of the smaller copy: strip-image.ts's cap for a post photo. */
export const SHRINK_MAX_EDGE = 2048;
/**
 * A picture more than this many times as long as it is wide is not scaled
 * down. At 2048 on the long edge a 1080 x 7200 scrolling screenshot would
 * come out 307 px wide, its text a blur, and a phone panorama a ribbon.
 */
export const SHRINK_MAX_LONG_TO_SHORT = 3;
/**
 * How solid a drawn pixel has to read to count as solid (255 is fully).
 * A few points under is nothing an eye can see, even on black, and it is
 * what a browser's gentle anti-tracking noise does to a canvas read.
 */
export const SOLID_FROM_ALPHA = 250;
export const SHRINK_JPEG_QUALITY = 0.85;
/** Always JPEG, so the upload route stores it as `.jpg`. */
export const SHRUNK_CONTENT_TYPE = "image/jpeg";
/** Longest the whole job may take before the original is sent instead. */
export const SHRINK_TIMEOUT_MS = 10_000;
/** How much of the file is read to tell a still from an animation. */
const HEAD_BYTES = 256 * 1024;

const SHRINKABLE_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The smaller copy and the type to declare for it. */
export type ShrunkPhoto = { file: File; contentType: typeof SHRUNK_CONTENT_TYPE };

/**
 * Which rule sent the original instead. For a developer's console only:
 * never shown to a student, and it says nothing about the photo itself.
 */
export type KeptOriginalWhy =
  /** A GIF, a video, another type, or 1 MB or less. */
  | "not-a-big-photo"
  /** No page, or a browser too old to turn a phone photo upright. */
  | "browser-cannot"
  /** Animated, or the first bytes are not what the type says. */
  | "not-a-still"
  /** The probe dot did not come back as painted (a privacy mode). */
  | "canvas-read-blocked"
  /** The browser could not open the file, or reported no size. */
  | "could-not-decode"
  /** A scrolling screenshot or a panorama: scaling would crush it. */
  | "long-and-thin"
  /** A see-through pixel, or a draw that painted nothing. */
  | "see-through-or-blank"
  /** The browser handed back nothing, or something other than a JPEG. */
  | "export-failed"
  /** The JPEG came out no smaller than the pick. */
  | "not-smaller"
  /** The 10 seconds ran out. */
  | "took-too-long"
  /** Anything else that threw. */
  | "failed";

/** `image/jpeg; charset=x` and `IMAGE/JPEG` both read as `image/jpeg`. */
function plainType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/** Is this pick worth trying to shrink at all? Decided before any decoding. */
export function shouldShrinkPhoto(pick: { contentType: string; sizeBytes: number }): boolean {
  if (typeof pick.contentType !== "string" || !SHRINKABLE_TYPES.has(plainType(pick.contentType))) {
    return false;
  }
  return Number.isFinite(pick.sizeBytes) && pick.sizeBytes > SHRINK_OVER_BYTES;
}

function startsWith(buf: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

/**
 * A PNG is animated when an `acTL` chunk comes before its first `IDAT`.
 * `null` when the bytes we hold end before either shows up: can't tell.
 */
function pngIsAnimated(head: Uint8Array): boolean | null {
  let at = 8; // past the signature
  while (at + 8 <= head.length) {
    const length =
      ((head[at] << 24) | (head[at + 1] << 16) | (head[at + 2] << 8) | head[at + 3]) >>> 0;
    if (startsWith(head, ascii("acTL"), at + 4)) return true;
    if (startsWith(head, ascii("IDAT"), at + 4)) return false;
    at += 12 + length; // length + name + data + checksum
  }
  return null;
}

/**
 * What the first bytes say the file is, and only when it is a STILL picture
 * a canvas can redraw without losing anything but size. `null` for a GIF, an
 * animated PNG or WebP, anything else, and whenever we can't tell.
 */
export function stillPhotoFormat(head: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return pngIsAnimated(head) === false ? "png" : null;
  }
  // "RIFF" <4-byte size> "WEBP" <first chunk's name>
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) {
    if (startsWith(head, ascii("VP8 "), 12) || startsWith(head, ascii("VP8L"), 12)) return "webp";
    // The extended header's flags sit at byte 20; 0x02 marks an animation.
    if (startsWith(head, ascii("VP8X"), 12) && head.length > 20) {
      return (head[20] & 0x02) === 0 ? "webp" : null;
    }
  }
  return null;
}

/**
 * Would scaling this picture down to `maxEdge` leave a strip too thin to
 * read? True for a long scrolling screenshot and for a panorama. A picture
 * that already fits is not scaled at all, so its shape doesn't matter.
 */
export function tooLongAndThin(
  width: number,
  height: number,
  maxEdge: number = SHRINK_MAX_EDGE,
): boolean {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return long > maxEdge && long > short * SHRINK_MAX_LONG_TO_SHORT;
}

/**
 * The size to draw at: `maxEdge` on the long edge, same shape, never larger
 * than the photo already is, never under 1 px. `null` means don't draw it:
 * the sizes aren't a picture (a decode that reported 0 x 0), or it is a long
 * thin picture that scaling would crush (`tooLongAndThin`).
 */
export function shrinkTargetSize(
  width: number,
  height: number,
  maxEdge: number = SHRINK_MAX_EDGE,
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  if (!Number.isFinite(maxEdge) || maxEdge < 1) return null;
  if (tooLongAndThin(width, height, maxEdge)) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Does the drawn picture have see-through parts? `rgba` is a canvas read of
 * the whole drawing, `width` x `height` pixels, four bytes each; the fourth
 * says how solid the pixel is.
 *
 * Forgiving in two small ways, so that a quirk of one browser can't quietly
 * switch shrinking off for every photo on it:
 *  - a pixel at `SOLID_FROM_ALPHA` or more counts as solid;
 *  - the outermost ring of pixels is not looked at. Smoothing a scaled
 *    picture can leave its very edge a touch soft, and a picture that
 *    really is see-through is see-through further in than one pixel.
 * A read that is empty, or not the size it says, counts as see-through:
 * then nothing vouches for the picture.
 */
export function hasSeeThroughPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return true;
  if (rgba.length !== width * height * 4) return true;
  // A picture 1 or 2 pixels across is all ring: look at every pixel of it.
  const ring = width > 2 && height > 2 ? 1 : 0;
  for (let y = ring; y < height - ring; y++) {
    const rowEnd = (y * width + width - ring) * 4;
    for (let i = (y * width + ring) * 4 + 3; i < rowEnd; i += 4) {
      if (rgba[i] < SOLID_FROM_ALPHA) return true;
    }
  }
  return false;
}

/** The one dot painted to check that this browser reads a canvas back as drawn. */
export const PROBE_RGB = [20, 120, 220] as const;

/**
 * Did the probe dot come back as painted? Some privacy modes hand a page a
 * blank or scrambled picture when it reads a canvas, and the export would be
 * that blank. A few points of drift are fine (gentle anti-tracking noise
 * leaves a photo looking the same); a different colour is not.
 */
export function probeCameBackRight(rgba: ArrayLike<number>): boolean {
  if (rgba.length < 4 || !(rgba[3] >= SOLID_FROM_ALPHA)) return false;
  return PROBE_RGB.every((want, i) => Math.abs(rgba[i] - want) <= 8);
}

/** Keep the smaller copy only if it is a real JPEG and really smaller. */
export function shrunkIsBetter(result: {
  originalBytes: number;
  shrunkBytes: number;
  shrunkType: string;
}): boolean {
  return (
    result.shrunkType === SHRUNK_CONTENT_TYPE &&
    result.shrunkBytes > 0 &&
    result.shrunkBytes < result.originalBytes
  );
}

/** `IMG_0042.PNG` becomes `IMG_0042.jpg`, so the name matches what is inside. */
export function shrunkFileName(name: string): string {
  const base = (typeof name === "string" ? name : "").replace(/\.[^./\\]*$/, "").trim();
  return `${base || "photo"}.jpg`;
}

/**
 * Can this page shrink at all? Needs a document, and a browser that turns a
 * phone photo upright when it draws an <img> (every browser since 2020 does;
 * an older one would send the photo on its side once the tag is gone).
 */
function browserCanShrink(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof Image !== "undefined" &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("image-orientation", "from-image")
  );
}

/** Paint one known dot on a scratch canvas and read it back. */
function canvasReadsBackAsDrawn(): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = `rgb(${PROBE_RGB.join(", ")})`;
  ctx.fillRect(0, 0, 1, 1);
  return probeCameBackRight(ctx.getImageData(0, 0, 1, 1).data);
}

/**
 * Steps 2 to 6 of the file header. Answers the smaller copy, or the rule
 * that sent the original instead. May throw; the caller turns that into
 * "failed".
 */
async function redrawSmaller(file: File): Promise<ShrunkPhoto | KeptOriginalWhy> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  if (!stillPhotoFormat(head)) return "not-a-still";
  if (!canvasReadsBackAsDrawn()) return "canvas-read-blocked";

  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  try {
    const img = new Image();
    const opened = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    if (!opened) return "could-not-decode";
    // Best effort: finish decoding off the main thread, so the draw below
    // doesn't freeze the composer while the student types.
    if (typeof img.decode === "function") await img.decode().catch(() => undefined);

    // naturalWidth / naturalHeight are the upright size, rotation applied.
    const size = shrinkTargetSize(img.naturalWidth, img.naturalHeight);
    if (!size) {
      return tooLongAndThin(img.naturalWidth, img.naturalHeight)
        ? "long-and-thin"
        : "could-not-decode";
    }
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "failed";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, size.width, size.height);
    // The read's own width and height, not the ones we asked for: if a
    // browser hands back another size, the check says so (see-through).
    const drawn = ctx.getImageData(0, 0, size.width, size.height);
    if (hasSeeThroughPixels(drawn.data, drawn.width, drawn.height)) return "see-through-or-blank";

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, SHRUNK_CONTENT_TYPE, SHRINK_JPEG_QUALITY),
    );
    if (!blob || blob.type !== SHRUNK_CONTENT_TYPE) return "export-failed";
    if (
      !shrunkIsBetter({ originalBytes: file.size, shrunkBytes: blob.size, shrunkType: blob.type })
    ) {
      return "not-smaller";
    }
    return {
      file: new File([blob], shrunkFileName(file.name), { type: SHRUNK_CONTENT_TYPE }),
      contentType: SHRUNK_CONTENT_TYPE,
    };
  } finally {
    URL.revokeObjectURL(url);
    // Hand the pixels back now: phones cap the memory all canvases may hold.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** The whole job: the smaller copy, or the rule that kept the original. Never throws. */
async function shrinkOrSayWhy(
  file: File,
  timeoutMs: number,
): Promise<ShrunkPhoto | KeptOriginalWhy> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!shouldShrinkPhoto({ contentType: file.type, sizeBytes: file.size })) {
      return "not-a-big-photo";
    }
    if (!browserCanShrink()) return "browser-cannot";
    // A decode that never answers must not hold a message back for ever.
    const gaveUp = new Promise<KeptOriginalWhy>((resolve) => {
      timer = setTimeout(() => resolve("took-too-long"), timeoutMs);
    });
    return await Promise.race([
      redrawSmaller(file).catch((): KeptOriginalWhy => "failed"),
      gaveUp,
    ]);
  } catch {
    return "failed";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * A smaller JPEG copy of a picked chat photo, or null when the original
 * should go up as it is (see the file header for every reason). Never throws
 * and never rejects, so a caller may simply await it before sending.
 *
 * `onKeptOriginal` hears which rule answered null. It is for a developer's
 * console; a throw from it is swallowed, so a note can never stop a send.
 */
export async function shrinkPhoto(
  file: File,
  opts: { timeoutMs?: number; onKeptOriginal?: (why: KeptOriginalWhy) => void } = {},
): Promise<ShrunkPhoto | null> {
  const answer = await shrinkOrSayWhy(file, opts.timeoutMs ?? SHRINK_TIMEOUT_MS);
  if (typeof answer !== "string") return answer;
  try {
    opts.onKeptOriginal?.(answer);
  } catch {
    // The note is a courtesy. The original still goes up.
  }
  return null;
}
