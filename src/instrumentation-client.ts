import * as Sentry from "@sentry/nextjs";

import { getSentryInitOptions } from "@/lib/sentry-config";

Sentry.init({
  ...getSentryInitOptions(),
  // The trail a report carries keeps the pages opened, the requests made and
  // our own log lines, and no longer the buttons tapped (Privacy Policy 3d,
  // October 8, 2026): a tap's label says what a person was doing, and the
  // rest is what finds a bug. Same name as the default, so it replaces it.
  integrations: [Sentry.breadcrumbsIntegration({ dom: false })],
});

/**
 * When the browser code rule (Content-Security-Policy, security report
 * 2026-10-08; src/lib/security/csp.ts) refuses something on a page, we want
 * to hear about it: a host nobody put on the list, an inline script without
 * its nonce. Same channel the Privacy Policy already names for errors, and
 * only what is needed to fix the list: the directive and the ORIGIN that was
 * refused, never a path or a query (a signed storage URL carries its key, a
 * profile path carries a handle). The page address on the event goes through
 * the same scrub as every other report (beforeSend).
 *
 * Browser extensions are dropped before anything is counted (skeptic review,
 * 2026-10-11): password managers, ad blockers and the like inject scripts
 * into every page and each one trips the rule on every load. Left in, they
 * would fill the five-per-load allowance before a real miss got through, and
 * spend the Sentry quota on other people's software.
 */
const CSP_REPORTS_PER_LOAD = 5;

const EXTENSION_SCHEMES = [
  "chrome-extension:",
  "moz-extension:",
  "safari-web-extension:",
  "safari-extension:",
];

function fromExtension(value: string | null | undefined): boolean {
  return !!value && EXTENSION_SCHEMES.some((scheme) => value.startsWith(scheme));
}

/** What was refused, as an origin or a keyword the browser gives. Never a path. */
function blockedLabel(blockedURI: string): string {
  // Older Safari reports an inline script with an empty blockedURI.
  if (!blockedURI || blockedURI === "inline") return "inline";
  if (blockedURI === "data" || blockedURI.startsWith("data:")) return "data";
  if (blockedURI === "blob" || blockedURI.startsWith("blob:")) return "blob";
  try {
    const url = new URL(blockedURI);
    return url.origin !== "null" ? url.origin : url.protocol.replace(/:$/, "");
  } catch {
    // "eval", "wasm-eval", "trusted-types-sink" and friends: plain keywords.
    return /^[a-z][a-z-]{0,40}$/.test(blockedURI) ? blockedURI : "other";
  }
}

/** The directive name, or "unknown" when the browser hands us something else. */
function directiveLabel(e: SecurityPolicyViolationEvent): string {
  const directive = (e.effectiveDirective || e.violatedDirective || "").trim();
  return /^[a-z-]{1,40}$/.test(directive) ? directive : "unknown";
}

if (typeof document !== "undefined") {
  // Once per (directive, origin) per page load, five at most.
  const reported = new Set<string>();
  document.addEventListener("securitypolicyviolation", (e) => {
    if (fromExtension(e.blockedURI) || fromExtension(e.sourceFile)) return;
    if (reported.size >= CSP_REPORTS_PER_LOAD) return;
    const directive = directiveLabel(e);
    const blocked = blockedLabel(e.blockedURI);
    const key = `${directive} ${blocked}`;
    if (reported.has(key)) return;
    reported.add(key);
    // Which flavour of the rule the page had. The static /html pages don't
    // load this file today, so this reads "app" until they do.
    const path = window.location.pathname;
    const flavor =
      path.startsWith("/html/") || path.startsWith("/onboarding/classic")
        ? "static"
        : "app";
    Sentry.captureMessage(`csp: ${directive} blocked ${blocked}`, {
      level: "warning",
      tags: { csp_directive: directive, csp_blocked: blocked, csp_flavor: flavor },
    });
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
