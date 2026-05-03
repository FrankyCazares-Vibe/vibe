/**
 * Login ?next= is preserved for deep links (e.g. /messages). Generic shell entry
 * points like /feed should not override getPostLoginDestination (profile vs onboarding).
 */
const LOGIN_NEXT_OVERRIDES_SMART_ROUTING = new Set(["/feed", "/campus"]);

export function sanitizeLoginNextParam(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const pathOnly = next.split("?")[0] ?? "";
  if (LOGIN_NEXT_OVERRIDES_SMART_ROUTING.has(pathOnly)) return null;
  return next;
}
