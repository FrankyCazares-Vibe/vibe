/**
 * What the forgot-password page (src/app/auth/forgot-password/page.tsx) says
 * after POST /api/auth/password-reset. Kept here, with no imports, so the
 * node test runner loads it (password-reset-limits.test.ts runs the limits
 * and this copy together).
 */

/**
 * The per-network limit's window is 15 minutes; the per-address one is the
 * UTC day (src/lib/auth/password-reset-limits.ts). Retry-After is the time
 * actually left in the window that refused.
 */
const DEFAULT_RETRY_MINUTES = 15;

export const UNAVAILABLE_COPY =
  "Password reset isn't available right now. Try again in a few minutes.";

/**
 * The 429's `code` says why: "limiter_unavailable" when the server couldn't
 * count the request and refused it to be safe, "rate_limited" when a limit
 * is spent (src/app/api/auth/password-reset/route.ts).
 */
export function tooManyRequestsCopy(retryAfter: string | null, code: unknown): string {
  if (code === "limiter_unavailable") return UNAVAILABLE_COPY;
  const seconds = Number(retryAfter);
  const known = retryAfter !== null && Number.isFinite(seconds) && seconds > 0;
  // No code: an answer from before the code existed, when a wait shorter
  // than the shortest limit meant the server couldn't count the request.
  if (code !== "rate_limited" && known && seconds < DEFAULT_RETRY_MINUTES * 60) return UNAVAILABLE_COPY;
  // Over an hour is the per-address daily limit. It resets at midnight UTC,
  // which is evening in Indiana, so "tomorrow" could be too early: 24 hours
  // is the longest the wait can be.
  if (known && seconds > 60 * 60) {
    return "Too many reset requests. Try again in 24 hours.";
  }
  const minutes = known ? Math.max(1, Math.ceil(seconds / 60)) : DEFAULT_RETRY_MINUTES;
  return `Too many reset requests. Try again in ${minutes === 1 ? "a minute" : `${minutes} minutes`}.`;
}

/**
 * What to tell the student after POST /api/auth/password-reset, or null when
 * the request went through. Never the server's own text: a 503 carries a
 * config message meant for us, and a 5xx from the host may not be JSON.
 */
export function resetRequestError(
  status: number,
  retryAfter: string | null,
  body: unknown,
): string | null {
  if (status === 429) {
    const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : null;
    return tooManyRequestsCopy(retryAfter, code);
  }
  const ok =
    status >= 200 &&
    status < 300 &&
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === true;
  return ok ? null : UNAVAILABLE_COPY;
}
