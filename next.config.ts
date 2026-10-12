import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import {
  inlineScriptHashes,
  offlinePageCsp,
} from "./src/lib/security/inline-script-hashes";
import { pickPublicSupabaseKey } from "./src/lib/supabase/key-guard";

// The key every visitor's browser receives. Next.js copies any NEXT_PUBLIC_*
// variable the code mentions into the downloaded files, so the choice is made
// here, at build time, and a build that would ship a SECRET key stops
// (src/lib/supabase/key-guard.ts). In S71 Vercel Production held the
// service_role key in NEXT_PUBLIC_SUPABASE_ANON_KEY and the login page
// carried it for months. `env` below replaces whatever the variable holds with
// the publishable / anon key, in the browser files and the server files alike.
const publicKey = pickPublicSupabaseKey(process.env);
if (publicKey.ignoredSecretInAnonSlot) {
  console.warn(
    "[supabase-key-guard] NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET Supabase key: ignored. " +
      `Using ${publicKey.source}. Fix the variable in Vercel (Settings → Environment Variables).`,
  );
}

// This build's own id, for the "is a newer build live?" check on an open tab
// (src/lib/build/build-refresh.ts). Vercel gives every deployment one, an
// empty redeploy of the same commit included, and sets it while building as
// well as at run time, so it is copied here into the browser files and the
// server files of the same build. A commit hash would not do: a changed
// setting goes live by redeploying the same commit. Not set outside Vercel,
// and then the check does nothing (to try it locally, put
// NEXT_PUBLIC_BUILD_ID in .env.development.local).
const buildId = process.env.VERCEL_DEPLOYMENT_ID?.trim();

/** public/offline.html's inline scripts today: the theme boot and the Try again button. */
const OFFLINE_INLINE_SCRIPTS = 2;

/**
 * The browser code rule for /offline.html (security report 2026-10-08). That
 * page skips the proxy (its matcher), so it can't have a nonce; it gets a
 * hash of each of its own inline scripts instead, worked out from the file
 * itself on every build so an edit can't leave a stale hash behind.
 *
 * Read from process.cwd(), not __dirname: headers() runs at build time on
 * Vercel with cwd at the repo root, and __dirname is not reliable for a
 * transpiled .ts config (skeptic review, 2026-10-11). Called from headers()
 * rather than at the top of this file, so only the build and the dev server
 * ever read the file, never a server that has no public/ folder on disk.
 *
 * The count check is the build-time twin of inline-script-hashes.test.ts. A
 * page whose scripts don't match its rule shows but its button does nothing,
 * and the service worker precaches it, so nobody would ever see the console
 * error. Adding a script on purpose? Change OFFLINE_INLINE_SCRIPTS and the
 * test in the same commit.
 */
function offlinePagePolicy(): string {
  const html = readFileSync(
    path.join(process.cwd(), "public", "offline.html"),
    "utf8",
  );
  const hashes = inlineScriptHashes(html);
  if (hashes.length !== OFFLINE_INLINE_SCRIPTS) {
    throw new Error(
      `[csp] public/offline.html has ${hashes.length} inline scripts; next.config.ts expects ` +
        `${OFFLINE_INLINE_SCRIPTS}. Check the page, then update OFFLINE_INLINE_SCRIPTS and ` +
        "src/lib/security/inline-script-hashes.test.ts together.",
    );
  }
  return offlinePageCsp(hashes);
}

const nextConfig: NextConfig = {
  env: {
    ...(publicKey.key ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey.key } : {}),
    ...(buildId ? { NEXT_PUBLIC_BUILD_ID: buildId } : {}),
  },
  experimental: {
    // Next 16.3 turns Turbopack's build cache on by default and Vercel
    // restores .next/cache between builds. In S65 that shipped a production
    // build whose CSS was the PREVIOUS build's: a new globals.css rule never
    // reached anyone, and because chunk names are content hashes the page
    // kept pointing at the old, year-long-immutable stylesheet. A local
    // build from the same commit had the rule. Every production build
    // compiles from scratch instead — slower, but what ships is what's in git.
    turbopackFileSystemCacheForBuild: false,
  },
  // Server-side resume redaction (src/lib/profile/resume-redact.ts).
  // PDFium's Emscripten glue relies on createRequire / import.meta.url and
  // sharp is a native addon, so none of these may be bundled into route
  // code. The 3.9 MB pdfium.wasm is read from disk at runtime; the tracing
  // include copies it into the resume proxy's lambda.
  serverExternalPackages: ["@hyzyla/pdfium", "sharp", "pdf-lib"],
  outputFileTracingIncludes: {
    "/api/resume/[...path]": ["./node_modules/@hyzyla/pdfium/dist/pdfium.wasm"],
  },
  async redirects() {
    return [
      {
        source: "/html/landing.html",
        destination: "/",
        permanent: false,
      },
      {
        // The static Opportunities prototype (fake "Apply" / "Post") was
        // retired in S55; there is no product surface behind it yet.
        source: "/opportunities",
        destination: "/campus",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "connectvibe.app" }],
        destination: "https://www.connectvibe.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Baseline security headers on every response. The browser code
        // rule (Content-Security-Policy, security report 2026-10-08) is NOT
        // one of them: a React page needs a fresh nonce per request, which
        // only src/proxy.ts can mint (policy in src/lib/security/csp.ts), and
        // a second, static policy here would be ENFORCED alongside it, the
        // browser applying both. /offline.html skips the proxy and gets its
        // own rule below; /sw.js has none (see its rule).
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // SAMEORIGIN, not DENY: Vibe frames its OWN pages in five places,
          // all same-origin — the desktop messages shell
          // (app/messages/MessagesSwitch.tsx), the onboarding shell
          // (app/onboarding/OnboardingSwitch.tsx), the old thread pane
          // (desktop/messages/LegacyThreadPane.tsx) and the two small
          // Messages windows (desktop/messages/MiniMessenger.tsx,
          // public/html/_miniMessenger.js). Résumés are drawn by pdf.js into
          // <img>, never framed, which is why frame-src in
          // src/lib/security/csp.ts is 'self' and nothing else. DENY blocked
          // every one of them ("refused to connect"), which is how it shipped
          // in S51. SAMEORIGIN keeps the clickjacking protection that matters
          // — no OTHER site can frame Vibe — while letting the app frame itself.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // The service worker (public/sw.js) must never come from a cache: a
        // stale copy keeps a phone on old code and holds back the kill switch
        // (scripts/pwa/sw-killswitch.js). Browsers already skip their own HTTP
        // cache when they check for an update; this covers the first fetch
        // and any cache in between. No Content-Type rule: a JavaScript type is
        // sent already, and a doubled value would stop the worker
        // registering. No CSP either, on purpose (S75, 2026-10-11): a policy
        // on the worker script governs only the worker's OWN fetches, which
        // are same-origin navigations and /offline.html (public/sw.js rule
        // 4), never a page. Every page already answers to its own rule (the
        // proxy, or the /offline.html rule below), checked before a request
        // reaches the worker, so a worker rule would protect nothing more,
        // and a slip in it would break the offline fallback on every phone
        // without a visible error.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // The page the service worker shows offline. The worker precaches it
        // with `cache: "reload"`; this keeps an ordinary visit from reusing a
        // stale copy after the page changes. Its browser code rule is a hash
        // of each inline script (offlinePagePolicy above): the cached copy
        // keeps this header, so the rule travels with the page when the
        // worker shows it in place of another one.
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Security-Policy", value: offlinePagePolicy() },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
