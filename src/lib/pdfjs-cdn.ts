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

/**
 * What we hand pdf.js's getDocument. `isEvalSupported` is ALWAYS false: pdf.js
 * up to 4.1.392 (we pin 3.11.174) lets a crafted PDF run its own script
 * through the font renderer's eval path (CVE-2024-4367). Turning eval off is
 * the vendor's own workaround, and it costs us nothing visible — fonts still
 * draw, just through the slower non-eval path.
 */
export type PdfDocumentParams = {
  data?: Uint8Array;
  url?: string;
  isEvalSupported: false;
};

type PdfJs = {
  getDocument: (params: PdfDocumentParams) => {
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
 *
 * Deliberately dumb about WHAT the URL is: callers that hold a private
 * resume proxy path (`/api/resume/...`) must resolve it to a signed URL
 * first via `resolveResumeDocUrl` (src/lib/profile/resolve-resume-url.ts)
 * so pdf.js's Range requests hit storage directly instead of re-minting
 * a signed URL through the proxy on every chunk.
 */
export async function rasterizePdf(input: string): Promise<string[]> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument(pdfDocumentParams(input, window.location.href)).promise;
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

/**
 * Build the getDocument params for one input: raw bytes for a `data:` URL,
 * an absolute URL for anything else, and eval switched off either way (see
 * PdfDocumentParams). Pure, so the eval switch is pinned by a test and can't
 * quietly fall off the next time someone touches the loader.
 *
 * `pageHref` is the page's own address. pdf.js resolves relative URLs against
 * the worker, not the page, so a relative input is made absolute here.
 */
export function pdfDocumentParams(input: string, pageHref: string): PdfDocumentParams {
  if (input.startsWith("data:")) {
    // pdf.js wants raw bytes for data URLs; decode the base64 chunk.
    const comma = input.indexOf(",");
    const b64 = comma >= 0 ? input.slice(comma + 1) : "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { data: bytes, isEvalSupported: false };
  }
  return { url: new URL(input, pageHref).href, isEvalSupported: false };
}
