/**
 * Login ?next= is preserved for deep links (e.g. /messages). Generic shell entry
 * points like /feed should not override getPostLoginDestination (profile vs onboarding).
 */
const LOGIN_NEXT_OVERRIDES_SMART_ROUTING = new Set(["/feed", "/campus"]);

/** After school verify email link — only these paths may be requested (open redirect guard). */
const SCHOOL_VERIFY_NEXT_ALLOWLIST = new Set([
  "/onboarding",
  "/profile",
  "/auth/school-email",
]);

export function sanitizeLoginNextParam(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const pathOnly = next.split("?")[0] ?? "";
  if (LOGIN_NEXT_OVERRIDES_SMART_ROUTING.has(pathOnly)) return null;
  return next;
}

/** Path only (no untrusted query) for the `next` param on /auth/verify-school links. */
export function sanitizeSchoolVerifyNextParam(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const pathOnly = next.split("?")[0] ?? "";
  if (!SCHOOL_VERIFY_NEXT_ALLOWLIST.has(pathOnly)) return null;
  return pathOnly;
}
