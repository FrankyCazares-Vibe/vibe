/**
 * Tests for the chat photo shrinker (`shrink-photo.ts`).
 *
 * Run with:
 *   node --test src/lib/media/shrink-photo.test.ts
 *
 * The sizing and the decisions are plain functions. The canvas step is walked
 * with a stand-in page at the bottom (no browser here), which is enough to
 * pin every "send the original instead" rule.
 */

import assert from "node:assert/strict";
import test from "node:test";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097). A variable specifier keeps both happy (the
// profile-image-key.test.ts pattern).
const specifier = "./shrink-photo.ts";
const {
  PROBE_RGB,
  SHRINK_JPEG_QUALITY,
  SHRINK_MAX_EDGE,
  SHRINK_MAX_LONG_TO_SHORT,
  SHRINK_OVER_BYTES,
  SOLID_FROM_ALPHA,
  hasSeeThroughPixels,
  probeCameBackRight,
  shouldShrinkPhoto,
  shrinkPhoto,
  shrinkTargetSize,
  shrunkFileName,
  shrunkIsBetter,
  stillPhotoFormat,
  tooLongAndThin,
} = (await import(specifier)) as typeof import("./shrink-photo");
type KeptOriginalWhy = import("./shrink-photo").KeptOriginalWhy;

const MB = 1024 * 1024;
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));

/** One PNG chunk: 4-byte length, name, data, 4-byte checksum (never checked). */
function pngChunk(name: string, dataLength: number): number[] {
  const length = [dataLength >>> 24, (dataLength >>> 16) & 255, (dataLength >>> 8) & 255, dataLength & 255];
  return [...length, ...ascii(name), ...new Array<number>(dataLength).fill(0), 0, 0, 0, 0];
}

function png(...chunks: Array<[string, number]>): Uint8Array {
  return Uint8Array.from([...PNG_MAGIC, ...chunks.flatMap(([name, len]) => pngChunk(name, len))]);
}

/** "RIFF" <size> "WEBP" <first chunk> <chunk size> <flags byte at 20>. */
function webp(firstChunk: string, flags = 0): Uint8Array {
  return Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(firstChunk), 10, 0, 0, 0, flags, 0, 0, 0]);
}

test("only a JPEG, PNG or WebP over about 1 MB is worth shrinking", () => {
  for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(shouldShrinkPhoto({ contentType, sizeBytes: 3 * MB }), true, contentType);
    assert.equal(shouldShrinkPhoto({ contentType, sizeBytes: SHRINK_OVER_BYTES + 1 }), true, contentType);
    // Already small: sent as picked.
    assert.equal(shouldShrinkPhoto({ contentType, sizeBytes: SHRINK_OVER_BYTES }), false, contentType);
    assert.equal(shouldShrinkPhoto({ contentType, sizeBytes: 200 * 1024 }), false, contentType);
  }
  // GIFs and videos are never touched, whatever their size.
  for (const contentType of ["image/gif", "video/mp4", "video/quicktime", "video/webm", "image/heic", ""]) {
    assert.equal(shouldShrinkPhoto({ contentType, sizeBytes: 12 * MB }), false, contentType);
  }
  // The type is read the way the composer and the upload route read it.
  assert.equal(shouldShrinkPhoto({ contentType: " IMAGE/JPEG; charset=binary", sizeBytes: 2 * MB }), true);
  assert.equal(shouldShrinkPhoto({ contentType: "image/jpeg", sizeBytes: Number.NaN }), false);
  assert.equal(shouldShrinkPhoto({ contentType: "image/jpeg", sizeBytes: Infinity }), false);
});

test("the first bytes name a still JPEG, PNG or WebP", () => {
  assert.equal(stillPhotoFormat(Uint8Array.from(JPEG_MAGIC)), "jpeg");
  assert.equal(stillPhotoFormat(png(["IHDR", 13], ["IDAT", 40])), "png");
  // Colour profile and text chunks before the pixels don't change the answer.
  assert.equal(stillPhotoFormat(png(["IHDR", 13], ["iCCP", 3000], ["iTXt", 900], ["IDAT", 40])), "png");
  assert.equal(stillPhotoFormat(webp("VP8 ")), "webp");
  assert.equal(stillPhotoFormat(webp("VP8L")), "webp");
  // Extended WebP with see-through pixels (0x10) but no animation is a still.
  assert.equal(stillPhotoFormat(webp("VP8X", 0x10)), "webp");
});

test("an animation, a GIF or a file we can't read is left alone", () => {
  // Animated PNG: acTL sits before the first IDAT.
  assert.equal(stillPhotoFormat(png(["IHDR", 13], ["acTL", 8], ["IDAT", 40])), null);
  assert.equal(stillPhotoFormat(png(["IHDR", 13], ["iCCP", 500], ["acTL", 8], ["IDAT", 40])), null);
  // The bytes we hold end before the pixels start: can't tell, so don't touch.
  assert.equal(stillPhotoFormat(png(["IHDR", 13])), null);
  assert.equal(stillPhotoFormat(png(["IHDR", 13], ["iCCP", 500]).slice(0, 60)), null);
  assert.equal(stillPhotoFormat(Uint8Array.from(PNG_MAGIC)), null);
  // A chunk that claims to be 4 GB long ends the walk instead of looping.
  assert.equal(stillPhotoFormat(Uint8Array.from([...PNG_MAGIC, 255, 255, 255, 255, ...ascii("IHDR"), 0, 0])), null);
  // Animated WebP (0x02), alone or with other flags.
  assert.equal(stillPhotoFormat(webp("VP8X", 0x02)), null);
  assert.equal(stillPhotoFormat(webp("VP8X", 0x12)), null);
  assert.equal(stillPhotoFormat(webp("VP8X").slice(0, 20)), null);
  assert.equal(stillPhotoFormat(webp("ANIM")), null);
  // A GIF renamed .png, an HTML page, nothing at all.
  assert.equal(stillPhotoFormat(Uint8Array.from(ascii("GIF89a"))), null);
  assert.equal(stillPhotoFormat(Uint8Array.from(ascii("<!doctype html>"))), null);
  assert.equal(stillPhotoFormat(new Uint8Array(0)), null);
});

test("the long edge comes down to 2048 and the shape is kept", () => {
  assert.equal(SHRINK_MAX_EDGE, 2048);
  // A 12 MP phone photo, landscape and portrait.
  assert.deepEqual(shrinkTargetSize(4032, 3024), { width: 2048, height: 1536 });
  assert.deepEqual(shrinkTargetSize(3024, 4032), { width: 1536, height: 2048 });
  // A 48 MP one.
  assert.deepEqual(shrinkTargetSize(8064, 6048), { width: 2048, height: 1536 });
  // Phone screenshots, tall as they are, still count as ordinary pictures.
  assert.deepEqual(shrinkTargetSize(1290, 2796), { width: 945, height: 2048 });
  assert.deepEqual(shrinkTargetSize(1080, 2400), { width: 922, height: 2048 });
  assert.deepEqual(shrinkTargetSize(5000, 5000), { width: 2048, height: 2048 });
  assert.deepEqual(shrinkTargetSize(4000, 3000, 1000), { width: 1000, height: 750 });
});

test("a photo is never drawn larger than it is, and never under 1 px", () => {
  assert.deepEqual(shrinkTargetSize(2048, 1536), { width: 2048, height: 1536 });
  assert.deepEqual(shrinkTargetSize(1200, 900), { width: 1200, height: 900 });
  assert.deepEqual(shrinkTargetSize(1, 1), { width: 1, height: 1 });
  // A decode that reported nothing is not a picture.
  for (const [w, h] of [[0, 0], [0, 100], [100, 0], [-5, 10], [Number.NaN, 10], [10, Infinity]]) {
    assert.equal(shrinkTargetSize(w, h), null, `${w} x ${h}`);
  }
  assert.equal(shrinkTargetSize(100, 100, 0), null);
});

test("a long thin picture is not scaled down: it would come out a strip", () => {
  assert.equal(SHRINK_MAX_LONG_TO_SHORT, 3);
  // A scrolling screenshot (it would be 307 px wide) and a phone panorama
  // (2048 x 461), the two the reviewer measured, upright and on their side.
  for (const [w, h] of [[1080, 7200], [7200, 1080], [16000, 3600], [3600, 16000], [1080, 15000], [30000, 4]]) {
    assert.equal(tooLongAndThin(w, h), true, `${w} x ${h}`);
    assert.equal(shrinkTargetSize(w, h), null, `${w} x ${h}`);
  }
  // Exactly 3 to 1 is still scaled; one pixel longer is not.
  assert.deepEqual(shrinkTargetSize(6144, 2048), { width: 2048, height: 683 });
  assert.equal(shrinkTargetSize(6145, 2048), null);
  // Ordinary shapes, the tallest phone screens included, are not "long and thin".
  for (const [w, h] of [[4032, 3024], [3024, 4032], [1290, 2796], [1080, 2520], [8000, 3200]]) {
    assert.equal(tooLongAndThin(w, h), false, `${w} x ${h}`);
  }
  // A strip that already fits is not scaled at all, so nothing is crushed:
  // it is redrawn at its own size.
  assert.equal(tooLongAndThin(2000, 500), false);
  assert.deepEqual(shrinkTargetSize(2000, 500), { width: 2000, height: 500 });
  assert.deepEqual(shrinkTargetSize(600, 2048), { width: 600, height: 2048 });
  // The rule follows the edge it is asked for.
  assert.equal(shrinkTargetSize(4000, 1000, 1000), null);
  assert.deepEqual(shrinkTargetSize(4000, 1000, 4000), { width: 4000, height: 1000 });
});

/** A canvas read of `width` x `height` solid pixels, with some set softer. */
function pixels(width: number, height: number, soft: Array<[x: number, y: number, alpha: number]> = []) {
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, alpha] of soft) rgba[(y * width + x) * 4 + 3] = alpha;
  return rgba;
}

test("a see-through pixel anywhere inside the picture is found", () => {
  assert.equal(hasSeeThroughPixels(pixels(6, 5), 6, 5), false);
  // Colour doesn't matter, only the fourth byte of each pixel.
  assert.equal(hasSeeThroughPixels(Uint8ClampedArray.from([0, 0, 0, 255, 9, 9, 9, 255]), 2, 1), false);
  // Every pixel inside the outer ring, one at a time.
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 4; x++) {
      assert.equal(hasSeeThroughPixels(pixels(6, 5, [[x, y, 0]]), 6, 5), true, `${x},${y}`);
    }
  }
  // A canvas nothing was drawn on reads as all zeros: never "solid".
  assert.equal(hasSeeThroughPixels(new Uint8ClampedArray(6 * 5 * 4), 6, 5), true);
});

test("the see-through check forgives a near-solid pixel and the outer ring, nothing more", () => {
  assert.equal(SOLID_FROM_ALPHA, 250);
  // 250 and up is solid (what gentle anti-tracking noise leaves behind).
  assert.equal(hasSeeThroughPixels(pixels(6, 5, [[2, 2, 250], [3, 1, 254]]), 6, 5), false);
  assert.equal(hasSeeThroughPixels(pixels(6, 5, [[2, 2, 249]]), 6, 5), true);
  // The outermost ring is not looked at: edge smoothing can soften it.
  const ring: Array<[number, number, number]> = [];
  for (let x = 0; x < 6; x++) ring.push([x, 0, 0], [x, 4, 0]);
  for (let y = 0; y < 5; y++) ring.push([0, y, 0], [5, y, 0]);
  assert.equal(hasSeeThroughPixels(pixels(6, 5, ring), 6, 5), false);
  // One pixel further in is looked at.
  assert.equal(hasSeeThroughPixels(pixels(6, 5, [...ring, [1, 1, 0]]), 6, 5), true);
  // A picture 1 or 2 pixels across is all ring, so every pixel is looked at.
  assert.equal(hasSeeThroughPixels(pixels(2, 7, [[1, 6, 0]]), 2, 7), true);
  assert.equal(hasSeeThroughPixels(pixels(9, 1, [[0, 0, 0]]), 9, 1), true);
  assert.equal(hasSeeThroughPixels(pixels(9, 2), 9, 2), false);
});

test("a canvas read that is empty or the wrong size vouches for nothing", () => {
  assert.equal(hasSeeThroughPixels(new Uint8ClampedArray(0), 0, 0), true);
  // Fewer or more bytes than width x height says there should be.
  assert.equal(hasSeeThroughPixels(pixels(6, 5), 6, 6), true);
  assert.equal(hasSeeThroughPixels(pixels(6, 5), 5, 5), true);
  assert.equal(hasSeeThroughPixels(pixels(6, 5), 6.5, 5), true);
  assert.equal(hasSeeThroughPixels(pixels(6, 5), Number.NaN, 5), true);
  assert.equal(hasSeeThroughPixels(pixels(6, 5), -6, -5), true);
});

test("the probe dot must come back as painted, give or take a little noise", () => {
  const [r, g, b] = PROBE_RGB;
  assert.equal(probeCameBackRight([r, g, b, 255]), true);
  assert.equal(probeCameBackRight([r + 3, g - 2, b + 1, 255]), true);
  // The same few points of give on how solid it reads.
  assert.equal(probeCameBackRight([r, g, b, SOLID_FROM_ALPHA]), true);
  assert.equal(probeCameBackRight([r, g, b, SOLID_FROM_ALPHA - 1]), false);
  // A privacy mode's blank picture, white or black or see-through.
  assert.equal(probeCameBackRight([255, 255, 255, 255]), false);
  assert.equal(probeCameBackRight([0, 0, 0, 255]), false);
  assert.equal(probeCameBackRight([r, g, b, 0]), false);
  assert.equal(probeCameBackRight([r, g, b + 40, 255]), false);
  assert.equal(probeCameBackRight([]), false);
  assert.equal(probeCameBackRight([r, g, b]), false);
});

test("the smaller copy is kept only when it is a JPEG and really smaller", () => {
  const jpeg = "image/jpeg";
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 400_000, shrunkType: jpeg }), true);
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 3 * MB - 1, shrunkType: jpeg }), true);
  // Same size or bigger: the original goes up.
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 3 * MB, shrunkType: jpeg }), false);
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 4 * MB, shrunkType: jpeg }), false);
  // An empty export, or a browser that exported something other than JPEG.
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 0, shrunkType: jpeg }), false);
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 400_000, shrunkType: "image/png" }), false);
  assert.equal(shrunkIsBetter({ originalBytes: 3 * MB, shrunkBytes: 400_000, shrunkType: "" }), false);
});

test("the smaller copy is named .jpg", () => {
  assert.equal(shrunkFileName("IMG_0042.PNG"), "IMG_0042.jpg");
  assert.equal(shrunkFileName("IMG_0042.jpeg"), "IMG_0042.jpg");
  assert.equal(shrunkFileName("spring.break.2026.webp"), "spring.break.2026.jpg");
  assert.equal(shrunkFileName("no-extension"), "no-extension.jpg");
  assert.equal(shrunkFileName(".png"), "photo.jpg");
  assert.equal(shrunkFileName(""), "photo.jpg");
});

// ---------------------------------------------------------------------------
// The canvas step, walked with a stand-in page. Each knob is one way a real
// browser can behave; `seen` is what the shrinker did with it.
// ---------------------------------------------------------------------------

type Page = {
  /** The upright size the browser reports once the photo is decoded. */
  natural: { width: number; height: number };
  decode: "ok" | "error" | "never";
  /** false = the draw painted nothing (a phone out of memory). */
  paints: boolean;
  /** How solid one pixel in the middle of the drawn photo reads (255 = fully). */
  innerPixelAlpha: number;
  /** How solid the very last pixel, on the outer edge, reads. */
  edgePixelAlpha: number;
  /** What the 1 px probe reads back. */
  probe: number[];
  /** What the JPEG export hands back. */
  exported: Blob | null;
  turnsPhotosUpright: boolean;
  /** true = asking for a canvas throws. */
  canvasThrows: boolean;
};

type Seen = {
  images: number;
  drawn: number[] | null;
  exportAsked: { type: string; quality: number; width: number; height: number } | null;
  revoked: string[];
  canvases: Array<{ width: number; height: number }>;
};

const jpegBlob = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

function page(over: Partial<Page> = {}): Page {
  return {
    natural: { width: 4032, height: 3024 },
    decode: "ok",
    paints: true,
    innerPixelAlpha: 255,
    edgePixelAlpha: 255,
    probe: [...PROBE_RGB, 255],
    exported: jpegBlob(400_000),
    turnsPhotosUpright: true,
    canvasThrows: false,
    ...over,
  };
}

/** Shrink it and say which rule, if any, sent the original instead. */
async function tryShrink(file: File, opts: { timeoutMs?: number } = {}) {
  const whys: KeptOriginalWhy[] = [];
  const shrunk = await shrinkPhoto(file, { ...opts, onKeptOriginal: (why) => whys.push(why) });
  // Told once when the original is kept, never when a copy was made.
  assert.equal(whys.length, shrunk ? 0 : 1);
  return { shrunk, why: whys[0] ?? null };
}

/** A picked file: real first bytes, padded with zeros to `bytes`. */
function pick(bytes: number, name = "IMG_0042.JPG", type = "image/jpeg", head: ArrayLike<number> = JPEG_MAGIC): File {
  const body = new Uint8Array(bytes);
  body.set(head);
  return new File([body], name, { type });
}

async function onPage(p: Page, run: (seen: Seen) => Promise<void>): Promise<void> {
  const seen: Seen = { images: 0, drawn: null, exportAsked: null, revoked: [], canvases: [] };
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_url: string) {
      seen.images += 1;
      if (p.decode === "never") return;
      queueMicrotask(() => {
        if (p.decode === "error") return this.onerror?.();
        this.naturalWidth = p.natural.width;
        this.naturalHeight = p.natural.height;
        this.onload?.();
      });
    }
  }
  const createElement = () => {
    if (p.canvasThrows) throw new Error("no canvas for you");
    let photoDrawn = false;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: () => undefined,
        drawImage: (_img: unknown, ...box: number[]) => {
          photoDrawn = true;
          seen.drawn = box;
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          if (!photoDrawn) return { data: Uint8ClampedArray.from(p.probe), width: 1, height: 1 };
          // A draw that painted nothing leaves the canvas all zeros.
          const data = new Uint8ClampedArray(w * h * 4).fill(p.paints ? 255 : 0);
          if (p.paints) {
            data[(Math.floor(h / 2) * w + Math.floor(w / 2)) * 4 + 3] = p.innerPixelAlpha;
            data[data.length - 1] = p.edgePixelAlpha;
          }
          return { data, width: w, height: h };
        },
      }),
      toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
        seen.exportAsked = { type, quality, width: canvas.width, height: canvas.height };
        done(p.exported);
      },
    };
    seen.canvases.push(canvas);
    return canvas;
  };
  const g = globalThis as Record<string, unknown>;
  const realRevoke = URL.revokeObjectURL;
  g.document = { createElement };
  g.Image = FakeImage;
  g.CSS = { supports: () => p.turnsPhotosUpright };
  URL.revokeObjectURL = (url: string) => {
    seen.revoked.push(url);
    realRevoke.call(URL, url);
  };
  try {
    await run(seen);
  } finally {
    delete g.document;
    delete g.Image;
    delete g.CSS;
    URL.revokeObjectURL = realRevoke;
  }
}

test("outside a browser the answer is null and nothing throws", async () => {
  assert.equal(await shrinkPhoto(pick(3 * MB)), null);
  assert.equal((await tryShrink(pick(3 * MB))).why, "browser-cannot");
});

test("a big photo comes back as a smaller JPEG, drawn at 2048 on the long edge", async () => {
  await onPage(page(), async (seen) => {
    const original = pick(3 * MB);
    const { shrunk, why } = await tryShrink(original);
    assert.ok(shrunk);
    assert.equal(why, null);
    // The type and size the caller declares are the new file's own.
    assert.equal(shrunk.contentType, "image/jpeg");
    assert.equal(shrunk.file.type, "image/jpeg");
    assert.equal(shrunk.file.size, 400_000);
    assert.equal(shrunk.file.name, "IMG_0042.jpg");
    assert.deepEqual(seen.drawn, [0, 0, 2048, 1536]);
    assert.deepEqual(seen.exportAsked, { type: "image/jpeg", quality: SHRINK_JPEG_QUALITY, width: 2048, height: 1536 });
    assert.equal(SHRINK_JPEG_QUALITY, 0.85);
    // The blob: address is freed, and the photo's canvas (made after the
    // probe's) gives its memory back.
    assert.equal(seen.revoked.length, 1);
    assert.equal(seen.canvases.length, 2);
    assert.equal(seen.canvases[1].width, 0);
    assert.equal(seen.canvases[1].height, 0);
  });
});

test("a photo the phone stored on its side is drawn at its upright size", async () => {
  // The browser reports the size after rotation: portrait here.
  await onPage(page({ natural: { width: 3024, height: 4032 } }), async (seen) => {
    assert.ok(await shrinkPhoto(pick(3 * MB)));
    assert.deepEqual(seen.drawn, [0, 0, 1536, 2048]);
  });
});

test("a big solid PNG or still WebP is shrunk too", async () => {
  await onPage(page(), async () => {
    const shot = pick(2 * MB, "Screenshot.png", "image/png", png(["IHDR", 13], ["IDAT", 40]));
    assert.equal((await shrinkPhoto(shot))?.file.name, "Screenshot.jpg");
    const still = pick(2 * MB, "pic.webp", "image/webp", webp("VP8 "));
    assert.equal((await shrinkPhoto(still))?.contentType, "image/jpeg");
  });
});

test("a see-through PNG is left alone, never flattened", async () => {
  await onPage(page({ innerPixelAlpha: 0 }), async (seen) => {
    const logo = pick(2 * MB, "logo.png", "image/png", png(["IHDR", 13], ["IDAT", 40]));
    assert.deepEqual(await tryShrink(logo), { shrunk: null, why: "see-through-or-blank" });
    assert.equal(seen.exportAsked, null, "nothing was exported");
    assert.equal(seen.revoked.length, 1);
  });
  // One pixel a little too soft is enough.
  await onPage(page({ innerPixelAlpha: SOLID_FROM_ALPHA - 1 }), async () => {
    const soft = pick(2 * MB, "a.webp", "image/webp", webp("VP8X", 0x10));
    assert.deepEqual(await tryShrink(soft), { shrunk: null, why: "see-through-or-blank" });
  });
});

test("a draw that painted nothing never goes up as a black rectangle", async () => {
  await onPage(page({ paints: false }), async (seen) => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), { shrunk: null, why: "see-through-or-blank" });
    assert.equal(seen.exportAsked, null, "nothing was exported");
  });
});

test("a browser's own rounding does not switch shrinking off", async () => {
  // A scaled photo whose outermost edge reads a touch soft is still a photo.
  await onPage(page({ edgePixelAlpha: 128 }), async () => {
    assert.ok((await tryShrink(pick(3 * MB))).shrunk);
  });
  // So is one whose pixels come back a point or two under solid, and a
  // probe dot that does.
  await onPage(page({ innerPixelAlpha: 252, probe: [...PROBE_RGB, 252] }), async () => {
    assert.ok((await tryShrink(pick(3 * MB))).shrunk);
  });
});

test("a long scrolling screenshot or a panorama goes up as picked", async () => {
  await onPage(page({ natural: { width: 1080, height: 7200 } }), async (seen) => {
    const shot = pick(3 * MB, "Screenshot.png", "image/png", png(["IHDR", 13], ["IDAT", 40]));
    assert.deepEqual(await tryShrink(shot), { shrunk: null, why: "long-and-thin" });
    assert.equal(seen.drawn, null, "nothing was drawn");
    assert.equal(seen.exportAsked, null, "nothing was exported");
    assert.equal(seen.revoked.length, 1);
  });
  await onPage(page({ natural: { width: 16000, height: 3600 } }), async () => {
    assert.deepEqual(await tryShrink(pick(9 * MB, "pano.jpg")), { shrunk: null, why: "long-and-thin" });
  });
  // An ordinary phone screenshot is still made smaller.
  await onPage(page({ natural: { width: 1290, height: 2796 } }), async (seen) => {
    assert.ok((await tryShrink(pick(3 * MB))).shrunk);
    assert.deepEqual(seen.drawn, [0, 0, 945, 2048]);
  });
});

test("a result that is not smaller is thrown away", async () => {
  await onPage(page({ exported: jpegBlob(3 * MB) }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), { shrunk: null, why: "not-smaller" });
  });
  await onPage(page({ exported: jpegBlob(3 * MB + 50) }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), { shrunk: null, why: "not-smaller" });
  });
});

test("anything that goes wrong sends the original instead, and says which rule", async () => {
  const kept = (why: KeptOriginalWhy) => ({ shrunk: null, why });
  // The browser could not decode the file.
  await onPage(page({ decode: "error" }), async (seen) => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("could-not-decode"));
    assert.equal(seen.revoked.length, 1);
  });
  // The decode reported no size.
  await onPage(page({ natural: { width: 0, height: 0 } }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("could-not-decode"));
  });
  // The export handed back nothing, or not a JPEG.
  await onPage(page({ exported: null }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("export-failed"));
  });
  await onPage(page({ exported: new Blob([new Uint8Array(1000)], { type: "image/png" }) }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("export-failed"));
  });
  // A privacy mode that blanks canvas reads: caught before the photo is decoded.
  await onPage(page({ probe: [255, 255, 255, 255] }), async (seen) => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("canvas-read-blocked"));
    assert.equal(seen.images, 0);
  });
  // A browser too old to turn a phone photo upright.
  await onPage(page({ turnsPhotosUpright: false }), async (seen) => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("browser-cannot"));
    assert.equal(seen.canvases.length, 0);
  });
  // Something threw that nobody planned for.
  await onPage(page({ canvasThrows: true }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB)), kept("failed"));
  });
});

test("a decode that never answers gives up, so a message is never held for ever", async () => {
  await onPage(page({ decode: "never" }), async () => {
    assert.deepEqual(await tryShrink(pick(3 * MB), { timeoutMs: 20 }), { shrunk: null, why: "took-too-long" });
  });
});

test("small photos, GIFs, videos and animations never reach the canvas", async () => {
  await onPage(page(), async (seen) => {
    assert.equal((await tryShrink(pick(300 * 1024))).why, "not-a-big-photo");
    assert.equal((await tryShrink(pick(5 * MB, "party.gif", "image/gif", ascii("GIF89a")))).why, "not-a-big-photo");
    assert.equal((await tryShrink(pick(5 * MB, "clip.mp4", "video/mp4", [0, 0, 0, 24]))).why, "not-a-big-photo");
    assert.equal(seen.canvases.length, 0);
    // An animated WebP, an animated PNG and a GIF wearing a .png name.
    assert.equal((await tryShrink(pick(5 * MB, "a.webp", "image/webp", webp("VP8X", 0x02)))).why, "not-a-still");
    assert.equal((await tryShrink(pick(5 * MB, "a.png", "image/png", png(["IHDR", 13], ["acTL", 8], ["IDAT", 40])))).why, "not-a-still");
    assert.equal((await tryShrink(pick(5 * MB, "b.png", "image/png", ascii("GIF89a")))).why, "not-a-still");
    assert.equal(seen.images, 0, "nothing was decoded");
  });
});

test("the note about why is a courtesy: a throw from it never stops the send", async () => {
  const angry = () => {
    throw new Error("the console is on fire");
  };
  // Kept original: still a plain null, no rejection.
  await onPage(page({ innerPixelAlpha: 0 }), async () => {
    assert.equal(await shrinkPhoto(pick(3 * MB), { onKeptOriginal: angry }), null);
  });
  // A copy was made: nobody is told anything.
  await onPage(page(), async () => {
    assert.ok(await shrinkPhoto(pick(3 * MB), { onKeptOriginal: angry }));
  });
});
