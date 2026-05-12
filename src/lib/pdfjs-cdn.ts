/**
 * On-demand pdf.js loader. Mobile rasterizes resume PDFs page-by-page
 * to JPEG so they render inside the mobile viewer alongside the
 * persisted redaction overlays — same pattern desktop profile.html
 * uses, just packaged as a reusable helper here.
 *
 * Loaded from CDN (matching profile.html's pinned version) so we
 * don't ship a multi-MB worker bundle through Next. Returned promise
 * resolves to the pdfjsLib namespace; safe to call repeatedly — the
 * second call short-circuits on the cached promise.
 */

const PDFJS_VERSION = "3.11.174";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

type PdfJs = {
  getDocument: (params: { data?: Uint8Array; url?: string }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<PdfPage>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfPage = {
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

let cached: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdf.js can only load in the browser"));
  }
  if (cached) return cached;
  cached = new Promise<PdfJs>((resolve, reject) => {
    const existing = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
    if (existing) {
      existing.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(existing);
      return;
    }
    const s = document.createElement("script");
    s.src = `${PDFJS_BASE}/pdf.min.js`;
    s.async = true;
    s.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!lib) {
        reject(new Error("pdf.js loaded but pdfjsLib is missing"));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = () => reject(new Error("pdf.js failed to load from CDN"));
    document.head.appendChild(s);
  });
  return cached;
}

/**
 * Rasterize every page of a PDF (or data: URL or remote URL) to a
 * JPEG data URL. Scale 1.6 matches desktop profile.html so the
 * resulting image is sharp enough for redaction-bar overlay math to
 * line up at any viewport width.
 */
export async function rasterizePdf(input: string): Promise<string[]> {
  const lib = await loadPdfJs();
  let source: { data?: Uint8Array; url?: string };
  if (input.startsWith("data:")) {
    // pdf.js wants raw bytes for data URLs; decode the base64 chunk.
    const comma = input.indexOf(",");
    const b64 = comma >= 0 ? input.slice(comma + 1) : "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    source = { data: bytes };
  } else {
    source = { url: input };
  }
  const doc = await lib.getDocument(source).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  return pages;
}
