/**
 * The browser code rule (Content-Security-Policy): which code may run on a
 * Vibe page and which hosts the page may load from or send data to.
 *
 * Why it exists: security report 2026-10-08, "No browser rule limiting which
 * code can run on Vibe's pages". Build plan:
 * handoffs/2026-10-11-browser-rule-plan.md ("The policy").
 *
 * ONE builder, TWO flavours:
 *  - "app" (every React page): scripts run only with this request's nonce
 *    (Next stamps it on its own inline scripts; our layout puts it on the
 *    theme boot script), or the NIGHT_LOCK_SCRIPT hash, or because a trusted
 *    script created them ('strict-dynamic': /html/_otto-tour.js, the mention
 *    picker, pdf.js from cdnjs).
 *  - "static" (/html/*.html and /onboarding/classic): those pages still carry
 *    inline <script> blocks and ~280 inline on*= handlers, which no nonce can
 *    cover, so their scripts get 'unsafe-inline' and NO nonce, hash or
 *    'strict-dynamic' (browsers ignore 'unsafe-inline' as soon as one of those
 *    is present, which would silently kill every handler). Every other
 *    directive is exactly as tight as the app flavour's.
 *
 * Hosts are origins only, never paths. An origin whose env var is missing (or
 * malformed) is left out: dev has no Sentry, and a typo must never smuggle a
 * ";" or a space into the header.
 *
 * PURE: no `server-only`, no Node-only APIs. It runs in the proxy and in
 * `node --test` (csp.test.ts). The one import, demo-media.ts, is pure too.
 */

import { demoMediaBase } from "@/lib/landing/demo-media";

export type CspFlavor = "app" | "static";

export type CspEnv = {
  /** NEXT_PUBLIC_SUPABASE_URL: fetch, the realtime websocket, public storage images. */
  supabaseUrl?: string;
  /** R2_ACCOUNT_ID: browser uploads (presigned PUT) and every media proxy's 307 target. */
  r2AccountId?: string;
  /** NEXT_PUBLIC_SENTRY_DSN: the ingest host the browser SDK posts errors to. */
  sentryDsn?: string;
  /** The landing film's folder: NEXT_PUBLIC_DEMO_MEDIA_BASE, else DEFAULT_DEMO_MEDIA_BASE (demo-media.ts). */
  demoMediaBase?: string;
};

export const CSP_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";

/**
 * 'sha256-…' of NIGHT_LOCK_SCRIPT (src/lib/theme/theme.ts), quoted so it drops
 * straight into script-src. MiniFrame.tsx renders that script inline without
 * a nonce at /messages?mini=1. A constant (not computed here) so this module
 * stays free of node:crypto; csp.test.ts recomputes it and fails on drift.
 */
export const NIGHT_LOCK_SCRIPT_HASH = "'sha256-GZQ2qm0VytQLC6b9jXXdjSdXEZTrupcFeuLfyLwYlAQ='";

/** pdf.js (src/lib/pdfjs-cdn.ts, profile.html): the only outside script host. */
const PDFJS_CDN = "https://cdnjs.cloudflare.com";
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";

/** An origin we are willing to write into the header: scheme://host[:port], nothing else. */
const SAFE_ORIGIN = /^(?:https?|wss?):\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;
/** A Host header value (dev only): host[:port] or [ipv6]:port. */
const SAFE_HOST = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;
/** R2 account ids are 32 hex characters; anything that is not a plain label is refused. */
const SAFE_R2_ACCOUNT = /^[A-Za-z0-9-]{1,63}$/;

/** The origin of an absolute http(s) URL, or null (relative, other scheme, unparseable, unsafe). */
function originOf(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return SAFE_ORIGIN.test(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

/** The realtime websocket twin of an http(s) origin: https → wss, http → ws. */
function websocketTwin(origin: string): string {
  return origin.replace(/^http/, "ws");
}

function r2Origin(accountId: string | undefined): string | null {
  const id = (accountId ?? "").trim();
  return SAFE_R2_ACCOUNT.test(id) ? `https://${id}.r2.cloudflarestorage.com` : null;
}

/**
 * The env this policy needs. The default reads each variable by its literal
 * name so Next can inline the NEXT_PUBLIC_* ones wherever this runs, exactly
 * as it does for the browser bundle that talks to those hosts.
 */
export function cspEnvFromProcess(env: NodeJS.ProcessEnv = literalProcessEnv()): CspEnv {
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    r2AccountId: env.R2_ACCOUNT_ID,
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
    // The SAME resolver the landing uses: unset → the Vercel Blob default,
    // "/landing-media/" → this site ('self' already covers it), "off" or a
    // typo → no film, so no host.
    demoMediaBase: demoMediaBase(env.NEXT_PUBLIC_DEMO_MEDIA_BASE) ?? undefined,
  };
}

function literalProcessEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_DEMO_MEDIA_BASE: process.env.NEXT_PUBLIC_DEMO_MEDIA_BASE,
  };
}

/**
 * "static" for /html/*.html and /onboarding/classic (trailing slash
 * tolerated), else "app". Never null: the proxy decides what is a page. A
 * query or fragment, if a caller passes one, is ignored.
 */
export function cspFlavor(pathname: string): CspFlavor {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  if (path.startsWith("/html/") && path.endsWith(".html")) return "static";
  if (path === "/onboarding/classic" || path === "/onboarding/classic/") return "static";
  return "app";
}

/** 16 random bytes, base64 (standard alphabet), via globalThis.crypto.getRandomValues. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Next's own nonce parser only accepts this shape (get-script-nonce-from-header.js). */
const SAFE_NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/;

export function buildCsp(opts: {
  flavor: CspFlavor;
  nonce?: string;
  env: CspEnv;
  dev: boolean;
  requestHost?: string;
}): string {
  const { flavor, nonce, env, dev, requestHost } = opts;
  const supabase = originOf(env.supabaseUrl);
  const r2 = r2Origin(env.r2AccountId);
  const sentry = originOf(env.sentryDsn);
  const demoMedia = originOf(env.demoMediaBase);
  const host = requestHost && SAFE_HOST.test(requestHost) ? requestHost : null;

  if (flavor === "app" && !(nonce && SAFE_NONCE.test(nonce))) {
    // An app page without a usable nonce would refuse every Next script and
    // render blank. Fail loudly in the proxy instead of shipping that.
    throw new Error("buildCsp: the app flavour needs a base64 nonce (makeNonce())");
  }

  const scriptSrc =
    flavor === "app"
      ? ["'self'", `'nonce-${nonce}'`, NIGHT_LOCK_SCRIPT_HASH, "'strict-dynamic'", PDFJS_CDN]
      : ["'self'", "'unsafe-inline'", PDFJS_CDN];
  // React rebuilds server error stacks with eval in development only (Next's
  // CSP guide); production never needs it.
  if (dev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'", supabase, supabase && websocketTwin(supabase), r2, sentry];
  // Dev only: the HMR websocket on whatever host the page was opened on (a
  // phone on the LAN uses 192.168.x.x:3000). 'self' covers same-origin ws in
  // current browsers; this entry is for the ones where it doesn't.
  if (dev && host) connectSrc.push(`ws://${host}`, `wss://${host}`);

  const directives: Array<[string, Array<string | null>]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS]],
    ["font-src", ["'self'", "data:", GOOGLE_FONTS_FILES]],
    // Stored image URLs are storage keys or the Supabase host (counts-only
    // check, 2026-10-11), so nothing live breaks, and the IP-beacon channel of
    // "A profile owner can secretly see who looked at their profile" closes.
    ["img-src", ["'self'", "data:", "blob:", supabase, r2, demoMedia]],
    ["media-src", ["'self'", "blob:", supabase, r2, demoMedia]],
    ["connect-src", connectSrc],
    // Vibe frames only its own pages (/html/messages.html, /onboarding/classic,
    // /messages?mini=1); résumé PDFs are rasterised by pdf.js into <img>,
    // never framed. Storage origins stay OUT so a stored URL can't frame a
    // Supabase or R2 object (skeptic amendment 1, 2026-10-11).
    ["frame-src", ["'self'"]],
    // pdf.js wraps its CDN worker in a blob: URL; /sw.js is same-origin.
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
  ];

  const parts = directives.map(([name, sources]) => {
    const list = sources.filter((s): s is string => typeof s === "string" && s.length > 0);
    return `${name} ${Array.from(new Set(list)).join(" ")}`;
  });
  // Dev is http://localhost; upgrading there would break every request.
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
