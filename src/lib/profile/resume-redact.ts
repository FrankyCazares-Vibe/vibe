import "server-only";

import fs from "node:fs";
import path from "node:path";

import { PDFiumLibrary } from "@hyzyla/pdfium";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import type { RedactionBar } from "@/lib/profile/resume-redactions";

/**
 * Server-side redaction renderer for resumes / portfolio documents.
 *
 * THE INVARIANT THIS MODULE EXISTS FOR: a non-owner viewer must never be
 * able to obtain the un-redacted bytes of a document that has redaction
 * bars, and must never learn the bar geometry. Bars used to be a client
 * overlay drawn from `users.resume_redactions`, which meant any signed-in
 * viewer could fetch the original and read straight through the boxes.
 *
 * Now the proxy (GET /api/resume/<key>) serves non-owners a DERIVATIVE
 * produced here, in which every bar is burned in as opaque black pixels
 * BEFORE the page is encoded. For PDFs the derivative is image-only: each
 * page is rasterised with PDFium, painted, JPEG-encoded and re-wrapped in
 * a fresh PDF with pdf-lib at the source page size in points. There is no
 * text layer, no fonts, no original content streams — that is the
 * guarantee, not a limitation. For images the pixels are painted and the
 * file is re-encoded in the same format (EXIF orientation is applied
 * first so the bars land where the browser showed them, and all metadata
 * is dropped on output).
 *
 * Bar coordinates: percentages (0–100) of the rendered page box — the
 * same box pdf.js `getViewport()` gives the clients (CropBox with /Rotate
 * applied), which is exactly what PDFium renders, so the percentages map
 * 1:1 onto the bitmap here. `pageNumber` is 1-based.
 *
 * Deployment notes:
 *  - `@hyzyla/pdfium`, `sharp` and `pdf-lib` are listed in
 *    `serverExternalPackages` (next.config.ts). The Emscripten glue in
 *    pdfium uses `createRequire` / `import.meta.url` and breaks when
 *    bundled.
 *  - The 3.9 MB `pdfium.wasm` is read from disk under `process.cwd()`
 *    (not via `require.resolve` of a `.wasm` subpath, which bundled route
 *    code cannot do). `outputFileTracingIncludes` for the resume route
 *    copies it into the lambda.
 *  - PDFium is initialised once per instance and cached in a module-level
 *    promise; expect a 50–150 ms cold `WebAssembly.compile` on Lambda.
 */

export type RedactionRect = Pick<RedactionBar, "pageNumber" | "x" | "y" | "w" | "h">;

export type RenderRedactedInput = {
  bytes: Uint8Array;
  /** MIME type of `bytes`: application/pdf, image/jpeg, image/png, image/webp. */
  contentType: string;
  /** Bars for THIS document only (caller filters by docIndex). */
  bars: readonly RedactionRect[];
};

export type RenderRedactedOutput = {
  bytes: Buffer;
  contentType: string;
  /** File extension without the dot (pdf, jpg, png, webp). */
  ext: string;
};

export type RedactedPage = {
  /** 1-based page number in the source document. */
  pageNumber: number;
  /** Source page size in points (CropBox with /Rotate applied). */
  widthPt: number;
  heightPt: number;
  /** Rendered bitmap size in pixels. */
  width: number;
  height: number;
  /** Number of bars burned into this page. */
  barsApplied: number;
  /** JPEG-encoded page with bars burned in. */
  jpeg: Buffer;
};

/** Hard cap on rendered pages; anything beyond is dropped from the derivative. */
export const MAX_REDACT_PAGES = 20;

/** A Letter page (612 pt) renders to 1275 px wide (≈150 dpi). */
const TARGET_PAGE_WIDTH_PX = 1275;
/** Guard against absurd aspect ratios producing huge bitmaps. */
const MAX_PAGE_HEIGHT_PX = 4000;
const JPEG_QUALITY = 85;

const WASM_RELATIVE_PATH = "node_modules/@hyzyla/pdfium/dist/pdfium.wasm";

let pdfiumPromise: Promise<PDFiumLibrary> | null = null;

/**
 * Initialise PDFium once per process. The promise is cached so concurrent
 * requests share the same instance; a failed init is cleared so the next
 * request retries instead of being wedged forever.
 */
function getPdfium(): Promise<PDFiumLibrary> {
  if (!pdfiumPromise) {
    pdfiumPromise = (async () => {
      const wasmPath = path.join(process.cwd(), WASM_RELATIVE_PATH);
      const buf = fs.readFileSync(wasmPath);
      const wasmBinary = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
      return PDFiumLibrary.init({ wasmBinary });
    })().catch((err) => {
      pdfiumPromise = null;
      throw err;
    });
  }
  return pdfiumPromise;
}

/**
 * Paint an opaque black rectangle into an RGBA (4 channels, 8-bit) bitmap.
 * Pixel bounds are floor/ceil-snapped so the bar never under-covers the
 * requested box by a fractional pixel. Returns the number of pixels
 * painted (0 when the rect is empty after clamping).
 */
function burnRect(
  data: Uint8Array,
  width: number,
  height: number,
  px: number,
  py: number,
  pw: number,
  ph: number,
): number {
  const x0 = Math.max(0, Math.floor(px));
  const y0 = Math.max(0, Math.floor(py));
  const x1 = Math.min(width, Math.ceil(px + pw));
  const y1 = Math.min(height, Math.ceil(py + ph));
  if (x1 <= x0 || y1 <= y0) return 0;
  for (let y = y0; y < y1; y++) {
    const row = y * width * 4;
    for (let x = x0; x < x1; x++) {
      const i = row + x * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return (x1 - x0) * (y1 - y0);
}

/** Apply every bar for `pageNumber` (percent coords) to an RGBA bitmap. */
function burnBars(
  data: Uint8Array,
  width: number,
  height: number,
  bars: readonly RedactionRect[],
  pageNumber: number,
): number {
  let applied = 0;
  for (const b of bars) {
    if (b.pageNumber !== pageNumber) continue;
    const painted = burnRect(
      data,
      width,
      height,
      (b.x / 100) * width,
      (b.y / 100) * height,
      (b.w / 100) * width,
      (b.h / 100) * height,
    );
    if (painted > 0) applied++;
  }
  return applied;
}

async function encodeRgbaJpeg(
  data: Uint8Array,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Rasterise a PDF page by page (serially, to keep memory bounded — a
 * single 1275×1650 RGBA page is ~8.4 MB), burn in the bars for each page
 * and yield the JPEG. The RGBA buffer is dropped as soon as the JPEG is
 * encoded. Stops after MAX_REDACT_PAGES.
 *
 * NOTE on channel order: @hyzyla/pdfium labels the bitmap "BGRA" but
 * renders with FPDF_REVERSE_BYTE_ORDER, so the buffer is actually RGBA.
 * Black is black either way, but the JPEG encode relies on this.
 */
export async function* renderRedactedPdfPages(
  bytes: Uint8Array,
  bars: readonly RedactionRect[],
): AsyncGenerator<RedactedPage> {
  const lib = await getPdfium();
  const doc = await lib.loadDocument(bytes);
  try {
    const pageCount = Math.min(doc.getPageCount(), MAX_REDACT_PAGES);
    for (let idx = 0; idx < pageCount; idx++) {
      const pageNumber = idx + 1;
      const page = doc.getPage(idx);
      const { originalWidth: widthPt, originalHeight: heightPt } =
        page.getOriginalSize();
      if (!(widthPt > 0) || !(heightPt > 0)) {
        throw new Error(`Page ${pageNumber} has an invalid size`);
      }
      const scale = Math.min(
        TARGET_PAGE_WIDTH_PX / widthPt,
        MAX_PAGE_HEIGHT_PX / heightPt,
      );

      const r = await page.render({ scale, render: "bitmap" });
      const barsApplied = burnBars(r.data, r.width, r.height, bars, pageNumber);
      const jpeg = await encodeRgbaJpeg(r.data, r.width, r.height);
      // r.data goes out of scope here; nothing else retains the bitmap.

      yield {
        pageNumber,
        widthPt,
        heightPt,
        width: r.width,
        height: r.height,
        barsApplied,
        jpeg,
      };
    }
  } finally {
    doc.destroy();
  }
}

/**
 * PDF → image-only PDF. One page per rendered JPEG, page size equal to
 * the source page size in points so the document paginates / prints the
 * same as the original.
 */
async function renderRedactedPdf(
  bytes: Uint8Array,
  bars: readonly RedactionRect[],
): Promise<Buffer> {
  const out = await PDFDocument.create();
  let pages = 0;
  for await (const p of renderRedactedPdfPages(bytes, bars)) {
    const img = await out.embedJpg(p.jpeg);
    const page = out.addPage([p.widthPt, p.heightPt]);
    page.drawImage(img, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
    pages++;
  }
  if (pages === 0) throw new Error("PDF has no pages");
  return Buffer.from(await out.save({ useObjectStreams: false }));
}

type ImageFormat = "jpeg" | "png" | "webp";

const IMAGE_FORMATS: Record<string, ImageFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const IMAGE_EXT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

/**
 * Image → same-format image. Decodes to RGBA with EXIF orientation
 * applied (so the bitmap matches what the client rendered the bars on),
 * burns bars for page 1, re-encodes. Output carries no metadata.
 */
async function renderRedactedImage(
  bytes: Uint8Array,
  format: ImageFormat,
  bars: readonly RedactionRect[],
): Promise<Buffer> {
  const { data, info } = await sharp(bytes)
    .rotate() // honour EXIF orientation, then strip it
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Unexpected channel count ${info.channels}`);
  }
  burnBars(data, info.width, info.height, bars, 1);

  const img = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
  switch (format) {
    case "jpeg":
      return img.removeAlpha().jpeg({ quality: JPEG_QUALITY }).toBuffer();
    case "png":
      return img.png().toBuffer();
    case "webp":
      return img.webp({ quality: JPEG_QUALITY }).toBuffer();
  }
}

function normalizeContentType(contentType: string): string {
  return (contentType || "").split(";")[0].trim().toLowerCase();
}

/**
 * Produce the redacted derivative of a hosted resume document.
 *
 * - `application/pdf` → image-only PDF (`pdf`).
 * - `image/jpeg|png|webp` → same format with bars painted in.
 *
 * Bars whose pageNumber does not exist in the document are ignored (the
 * page they would cover is not in the output either). Throws on any
 * decode / render failure — callers must NOT fall back to the original.
 */
export async function renderRedactedDocument(
  input: RenderRedactedInput,
): Promise<RenderRedactedOutput> {
  const ct = normalizeContentType(input.contentType);
  if (ct === "application/pdf") {
    const bytes = await renderRedactedPdf(input.bytes, input.bars);
    return { bytes, contentType: "application/pdf", ext: "pdf" };
  }
  const format = IMAGE_FORMATS[ct];
  if (!format) throw new Error(`Unsupported content type: ${ct || "(empty)"}`);
  const bytes = await renderRedactedImage(input.bytes, format, input.bars);
  return { bytes, contentType: `image/${format}`, ext: IMAGE_EXT[format] };
}
