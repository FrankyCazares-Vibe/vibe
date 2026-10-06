import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
        // Baseline security headers on every response. No CSP yet: the
        // static prototypes under /html rely on inline scripts, so a strict
        // policy would need a nonce rollout first.
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // SAMEORIGIN, not DENY: Vibe frames its OWN pages in four places
          // — the desktop messages shell (app/messages/MessagesSwitch.tsx)
          // and onboarding shell (app/onboarding/OnboardingSwitch.tsx) both
          // iframe /html/*.html, and both onboarding flows iframe the resume
          // preview. DENY blocked every one of them ("refused to connect"),
          // which is how it shipped in S51. SAMEORIGIN keeps the
          // clickjacking protection that matters — no OTHER site can frame
          // Vibe — while letting the app frame itself.
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
        // registering. No CSP either: a policy on the worker script governs
        // the worker's own fetches, and v1 has no allow-list worked out.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // The page the service worker shows offline. The worker precaches it
        // with `cache: "reload"`; this keeps an ordinary visit from reusing a
        // stale copy after the page changes.
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
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
