import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
