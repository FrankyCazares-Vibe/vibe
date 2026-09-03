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

/**
 * Single open-redirect gate shared by every `next`-style param.
 *
 * Accepts only a same-origin relative path: a single leading `/`, not
 * protocol-relative (`//host` or `/\host` — browsers treat a backslash as a
 * slash), no backslashes anywhere, no whitespace or control characters, and
 * the URL parser must agree it stays on the base origin.
 */
export function isSafeRelativePath(
  next: string | null | undefined,
): next is string {
  if (typeof next !== "string" || next.length === 0) return false;
  if (next[0] !== "/") return false;
  if (next[1] === "/" || next[1] === "\\") return false;
  if (next.includes("\\")) return false;
  if (/[\s\x00-\x1f\x7f]/.test(next)) return false;
  try {
    return new URL(next, "https://x.invalid").origin === "https://x.invalid";
  } catch {
    return false;
  }
}

export function sanitizeLoginNextParam(next: string | null): string | null {
  if (!isSafeRelativePath(next)) return null;
  const pathOnly = next.split("?")[0] ?? "";
  if (LOGIN_NEXT_OVERRIDES_SMART_ROUTING.has(pathOnly)) return null;
  return next;
}

/** Path only (no untrusted query) for the `next` param on /auth/verify-school links. */
export function sanitizeSchoolVerifyNextParam(next: string | null): string | null {
  if (!isSafeRelativePath(next)) return null;
  const pathOnly = next.split("?")[0] ?? "";
  if (!SCHOOL_VERIFY_NEXT_ALLOWLIST.has(pathOnly)) return null;
  return pathOnly;
}
