// Plain-JS copy of src/lib/media/shrink-photo.ts for the static pages
// (messages.html, the full Messages page on a computer). It makes a big chat
// photo smaller in the browser before it is sent. The WHY, the rules and what
// the caller owes are in that file's header: read it there.
//
// Exposes window.__vibeShrinkPhoto = { shouldShrinkPhoto, shrinkPhoto }.
//
// TWIN. This is the .ts file with its types removed and nothing else changed.
// Change the rules there first (it has the tests), then copy them here, and
// change the Privacy Policy (section 3c) the same day.
// src/lib/media/shrink-photo-static.test.ts fails while the two disagree: it
// reads every number here, runs both files on the same photos, and compares
// the code itself (comments and spacing are free to differ, nothing else).
//
// If this file does not load (an old browser stops at the `??` below, or the
// request fails), the page finds no window.__vibeShrinkPhoto and sends every
// photo as picked, as it did before.

(function () {
  if (window.__vibeShrinkPhoto) return;

  /** Photos at or under this size are sent as picked ("about 1 MB"). */
  const SHRINK_OVER_BYTES = 1024 * 1024;
  /** Long edge of the smaller copy: strip-image.ts's cap for a post photo. */
  const SHRINK_MAX_EDGE = 2048;
  /**
   * A picture more than this many times as long as it is wide is not scaled
   * down. At 2048 on the long edge a 1080 x 7200 scrolling screenshot would
   * come out 307 px wide, its text a blur, and a phone panorama a ribbon.
   */
  const SHRINK_MAX_LONG_TO_SHORT = 3;
  /**
   * How solid a drawn pixel has to read to count as solid (255 is fully).
   * A few points under is nothing an eye can see, even on black, and it is
   * what a browser's gentle anti-tracking noise does to a canvas read.
   */
  const SOLID_FROM_ALPHA = 250;
  const SHRINK_JPEG_QUALITY = 0.85;
  /** Always JPEG, so the upload route stores it as `.jpg`. */
  const SHRUNK_CONTENT_TYPE = "image/jpeg";
  /** Longest the whole job may take before the original is sent instead. */
  const SHRINK_TIMEOUT_MS = 10000;
  /** How much of the file is read to tell a still from an animation. */
  const HEAD_BYTES = 256 * 1024;
  const SHRINKABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  /** `image/jpeg; charset=x` and `IMAGE/JPEG` both read as `image/jpeg`. */
  function plainType(contentType) {
      return contentType.split(";")[0].trim().toLowerCase();
  }
  /** Is this pick worth trying to shrink at all? Decided before any decoding. */
  function shouldShrinkPhoto(pick) {
      if (typeof pick.contentType !== "string" || !SHRINKABLE_TYPES.has(plainType(pick.contentType))) {
          return false;
      }
      return Number.isFinite(pick.sizeBytes) && pick.sizeBytes > SHRINK_OVER_BYTES;
  }
  function startsWith(buf, bytes, offset = 0) {
      if (buf.length < offset + bytes.length)
          return false;
      return bytes.every((b, i) => buf[offset + i] === b);
  }
  function ascii(text) {
      return Array.from(text, (ch) => ch.charCodeAt(0));
  }
  /**
   * A PNG is animated when an `acTL` chunk comes before its first `IDAT`.
   * `null` when the bytes we hold end before either shows up: can't tell.
   */
  function pngIsAnimated(head) {
      let at = 8; // past the signature
      while (at + 8 <= head.length) {
          const length = ((head[at] << 24) | (head[at + 1] << 16) | (head[at + 2] << 8) | head[at + 3]) >>> 0;
          if (startsWith(head, ascii("acTL"), at + 4))
              return true;
          if (startsWith(head, ascii("IDAT"), at + 4))
              return false;
          at += 12 + length; // length + name + data + checksum
      }
      return null;
  }
  /**
   * What the first bytes say the file is, and only when it is a STILL picture
   * a canvas can redraw without losing anything but size. `null` for a GIF, an
   * animated PNG or WebP, anything else, and whenever we can't tell.
   */
  function stillPhotoFormat(head) {
      if (startsWith(head, [0xff, 0xd8, 0xff]))
          return "jpeg";
      if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
          return pngIsAnimated(head) === false ? "png" : null;
      }
      // "RIFF" <4-byte size> "WEBP" <first chunk's name>
      if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) {
          if (startsWith(head, ascii("VP8 "), 12) || startsWith(head, ascii("VP8L"), 12))
              return "webp";
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
  function tooLongAndThin(width, height, maxEdge = SHRINK_MAX_EDGE) {
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
  function shrinkTargetSize(width, height, maxEdge = SHRINK_MAX_EDGE) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
          return null;
      if (!Number.isFinite(maxEdge) || maxEdge < 1)
          return null;
      if (tooLongAndThin(width, height, maxEdge))
          return null;
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
  function hasSeeThroughPixels(rgba, width, height) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
          return true;
      if (rgba.length !== width * height * 4)
          return true;
      // A picture 1 or 2 pixels across is all ring: look at every pixel of it.
      const ring = width > 2 && height > 2 ? 1 : 0;
      for (let y = ring; y < height - ring; y++) {
          const rowEnd = (y * width + width - ring) * 4;
          for (let i = (y * width + ring) * 4 + 3; i < rowEnd; i += 4) {
              if (rgba[i] < SOLID_FROM_ALPHA)
                  return true;
          }
      }
      return false;
  }
  /** The one dot painted to check that this browser reads a canvas back as drawn. */
  const PROBE_RGB = [20, 120, 220];
  /**
   * Did the probe dot come back as painted? Some privacy modes hand a page a
   * blank or scrambled picture when it reads a canvas, and the export would be
   * that blank. A few points of drift are fine (gentle anti-tracking noise
   * leaves a photo looking the same); a different colour is not.
   */
  function probeCameBackRight(rgba) {
      if (rgba.length < 4 || !(rgba[3] >= SOLID_FROM_ALPHA))
          return false;
      return PROBE_RGB.every((want, i) => Math.abs(rgba[i] - want) <= 8);
  }
  /** Keep the smaller copy only if it is a real JPEG and really smaller. */
  function shrunkIsBetter(result) {
      return (result.shrunkType === SHRUNK_CONTENT_TYPE &&
          result.shrunkBytes > 0 &&
          result.shrunkBytes < result.originalBytes);
  }
  /** `IMG_0042.PNG` becomes `IMG_0042.jpg`, so the name matches what is inside. */
  function shrunkFileName(name) {
      const base = (typeof name === "string" ? name : "").replace(/\.[^./\\]*$/, "").trim();
      return `${base || "photo"}.jpg`;
  }
  /**
   * Can this page shrink at all? Needs a document, and a browser that turns a
   * phone photo upright when it draws an <img> (every browser since 2020 does;
   * an older one would send the photo on its side once the tag is gone).
   */
  function browserCanShrink() {
      return (typeof document !== "undefined" &&
          typeof Image !== "undefined" &&
          typeof CSS !== "undefined" &&
          typeof CSS.supports === "function" &&
          CSS.supports("image-orientation", "from-image"));
  }
  /** Paint one known dot on a scratch canvas and read it back. */
  function canvasReadsBackAsDrawn() {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx)
          return false;
      ctx.fillStyle = `rgb(${PROBE_RGB.join(", ")})`;
      ctx.fillRect(0, 0, 1, 1);
      return probeCameBackRight(ctx.getImageData(0, 0, 1, 1).data);
  }
  /**
   * Steps 2 to 6 of the file header. Answers the smaller copy, or the rule
   * that sent the original instead. May throw; the caller turns that into
   * "failed".
   */
  async function redrawSmaller(file) {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      if (!stillPhotoFormat(head))
          return "not-a-still";
      if (!canvasReadsBackAsDrawn())
          return "canvas-read-blocked";
      const url = URL.createObjectURL(file);
      const canvas = document.createElement("canvas");
      try {
          const img = new Image();
          const opened = await new Promise((resolve) => {
              img.onload = () => resolve(true);
              img.onerror = () => resolve(false);
              img.src = url;
          });
          if (!opened)
              return "could-not-decode";
          // Best effort: finish decoding off the main thread, so the draw below
          // doesn't freeze the composer while the student types.
          if (typeof img.decode === "function")
              await img.decode().catch(() => undefined);
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
          if (!ctx)
              return "failed";
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, size.width, size.height);
          // The read's own width and height, not the ones we asked for: if a
          // browser hands back another size, the check says so (see-through).
          const drawn = ctx.getImageData(0, 0, size.width, size.height);
          if (hasSeeThroughPixels(drawn.data, drawn.width, drawn.height))
              return "see-through-or-blank";
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, SHRUNK_CONTENT_TYPE, SHRINK_JPEG_QUALITY));
          if (!blob || blob.type !== SHRUNK_CONTENT_TYPE)
              return "export-failed";
          if (!shrunkIsBetter({ originalBytes: file.size, shrunkBytes: blob.size, shrunkType: blob.type })) {
              return "not-smaller";
          }
          return {
              file: new File([blob], shrunkFileName(file.name), { type: SHRUNK_CONTENT_TYPE }),
              contentType: SHRUNK_CONTENT_TYPE,
          };
      }
      finally {
          URL.revokeObjectURL(url);
          // Hand the pixels back now: phones cap the memory all canvases may hold.
          canvas.width = 0;
          canvas.height = 0;
      }
  }
  /** The whole job: the smaller copy, or the rule that kept the original. Never throws. */
  async function shrinkOrSayWhy(file, timeoutMs) {
      let timer;
      try {
          if (!shouldShrinkPhoto({ contentType: file.type, sizeBytes: file.size })) {
              return "not-a-big-photo";
          }
          if (!browserCanShrink())
              return "browser-cannot";
          // A decode that never answers must not hold a message back for ever.
          const gaveUp = new Promise((resolve) => {
              timer = setTimeout(() => resolve("took-too-long"), timeoutMs);
          });
          return await Promise.race([
              redrawSmaller(file).catch(() => "failed"),
              gaveUp,
          ]);
      }
      catch {
          return "failed";
      }
      finally {
          if (timer !== undefined)
              clearTimeout(timer);
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
  async function shrinkPhoto(file, opts = {}) {
      const answer = await shrinkOrSayWhy(file, opts.timeoutMs ?? SHRINK_TIMEOUT_MS);
      if (typeof answer !== "string")
          return answer;
      try {
          opts.onKeptOriginal?.(answer);
      }
      catch {
          // The note is a courtesy. The original still goes up.
      }
      return null;
  }

  window.__vibeShrinkPhoto = { shouldShrinkPhoto, shrinkPhoto };
})();
