/**
 * Tests for the upload re-encoder (`strip-image.ts`).
 *
 * Run with:
 *   node --test src/lib/media/strip-image.test.ts
 *
 * Every fixture is built in memory with sharp; no files on disk.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "node:zlib";

import sharp from "sharp";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097). A variable specifier keeps both happy (the
// profile-image-key.test.ts pattern).
const specifier = "./strip-image.ts";
const { MAX_INPUT_PIXELS, sniffImageFormat, stripImage } = (await import(
  specifier
)) as typeof import("./strip-image");

function solid(width: number, height: number, background = "#cc3333") {
  return sharp({ create: { width, height, channels: 3, background } });
}

/** A JPEG that says "rotate me 90°" and carries a GPS position. */
async function gpsJpeg(): Promise<Buffer> {
  return solid(40, 20)
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Copyright: "someone" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 46/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

async function twoFrameGif(): Promise<Buffer> {
  const a = await solid(30, 20, "#cc3333").png().toBuffer();
  const b = await solid(30, 20, "#3333cc").png().toBuffer();
  return sharp([a, b], { join: { animated: true } }).gif().toBuffer();
}

/** A real PNG whose header claims `width` x `height` (no pixel data to match). */
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(await solid(1, 1).png().toBuffer());
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

test("sniffImageFormat: the four photo formats and nothing else", async () => {
  assert.equal(sniffImageFormat(await solid(2, 2).jpeg().toBuffer()), "jpeg");
  assert.equal(sniffImageFormat(await solid(2, 2).png().toBuffer()), "png");
  assert.equal(sniffImageFormat(await solid(2, 2).webp().toBuffer()), "webp");
  assert.equal(sniffImageFormat(await solid(2, 2).gif().toBuffer()), "gif");
  assert.equal(sniffImageFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImageFormat(Buffer.from("<html><body>hi</body></html>")), null);
  assert.equal(sniffImageFormat(Buffer.from("RIFF\0\0\0\0WAVEfmt ")), null);
  assert.equal(sniffImageFormat(await solid(2, 2).tiff().toBuffer()), null);
  assert.equal(sniffImageFormat(Buffer.from([0xff, 0xd8])), null);
  assert.equal(sniffImageFormat(new Uint8Array(0)), null);
});

test("a GPS-tagged, rotated JPEG comes out upright with no metadata at all", async () => {
  const input = await gpsJpeg();
  const before = await sharp(input).metadata();
  assert.ok(before.exif, "fixture must carry EXIF");
  assert.equal(before.orientation, 6);

  const out = await stripImage(input, { maxEdge: 1024 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.contentType, "image/jpeg");
  assert.equal(out.ext, "jpg");
  const after = await sharp(out.bytes).metadata();
  assert.equal(after.format, "jpeg");
  assert.equal(after.exif, undefined);
  assert.equal(after.xmp, undefined);
  assert.equal(after.iptc, undefined);
  assert.equal(after.icc, undefined);
  assert.equal(after.orientation, undefined);
  // The orientation was applied to the pixels: 40x20 turned 90°.
  assert.equal(after.width, 20);
  assert.equal(after.height, 40);
  assert.equal(out.width, 20);
  assert.equal(out.height, 40);
});

test("an embedded colour profile is dropped (pixels converted, not kept)", async () => {
  const input = await solid(8, 8).withIccProfile("p3").jpeg().toBuffer();
  assert.ok((await sharp(input).metadata()).icc, "fixture must carry an ICC profile");
  const out = await stripImage(input, { maxEdge: null });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal((await sharp(out.bytes).metadata()).icc, undefined);
});

test("PNG stays PNG and keeps its transparency", async () => {
  const input = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const out = await stripImage(input, { maxEdge: 512 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.contentType, "image/png");
  assert.equal(out.ext, "png");
  const meta = await sharp(out.bytes).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.hasAlpha, true);
});

test("WebP stays WebP", async () => {
  const input = await solid(12, 12).webp().toBuffer();
  const out = await stripImage(input, { maxEdge: 2048 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.contentType, "image/webp");
  assert.equal(out.ext, "webp");
  assert.equal((await sharp(out.bytes).metadata()).format, "webp");
});

test("an animated GIF stays an animated GIF, resized frame by frame", async () => {
  const out = await stripImage(await twoFrameGif(), { maxEdge: 10 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.contentType, "image/gif");
  assert.equal(out.ext, "gif");
  const meta = await sharp(out.bytes, { animated: true }).metadata();
  assert.equal(meta.format, "gif");
  assert.equal(meta.pages, 2);
  assert.equal(meta.width, 10);
  assert.equal(meta.pageHeight, 7);
  assert.equal(out.height, 7);
});

test("maxEdge shrinks the long edge and never enlarges", async () => {
  const big = await stripImage(await solid(3000, 1000).jpeg().toBuffer(), { maxEdge: 1024 });
  assert.equal(big.ok, true);
  if (big.ok) {
    assert.equal(big.width, 1024);
    assert.equal(big.height, 341);
  }
  const small = await stripImage(await solid(100, 50).jpeg().toBuffer(), { maxEdge: 1024 });
  assert.equal(small.ok, true);
  if (small.ok) {
    assert.equal(small.width, 100);
    assert.equal(small.height, 50);
  }
  const kept = await stripImage(await solid(1500, 900).png().toBuffer(), { maxEdge: null });
  assert.equal(kept.ok, true);
  if (kept.ok) assert.equal(kept.width, 1500);
});

test("not a photo -> type, before any decoder runs", async () => {
  for (const bytes of [
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>"),
    Buffer.from("<html><script>alert(1)</script></html>"),
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    await solid(4, 4).tiff().toBuffer(),
  ]) {
    assert.deepEqual(await stripImage(bytes, { maxEdge: 1024 }), { ok: false, reason: "type" });
  }
});

test("a file that starts like a photo but isn't one -> type", async () => {
  const jpegHead = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
  assert.deepEqual(await stripImage(jpegHead, { maxEdge: 1024 }), { ok: false, reason: "type" });
  const truncated = (await solid(300, 300).jpeg().toBuffer()).subarray(0, 200);
  assert.deepEqual(await stripImage(truncated, { maxEdge: 1024 }), { ok: false, reason: "type" });
});

test("a picture over the pixel cap -> size (decompression bomb)", async () => {
  const bomb = await pngClaiming(8000, 8000);
  assert.ok(8000 * 8000 > MAX_INPUT_PIXELS);
  assert.deepEqual(await stripImage(bomb, { maxEdge: 2048 }), { ok: false, reason: "size" });
});
