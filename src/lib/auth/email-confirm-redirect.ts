/**
 * Redirect target after Supabase email confirmation (`verifyOtp` on
 * /auth/confirm, or the client's own one-time `?code=` exchange that
 * /auth/callback waits for on older emails).
 * Campus .edu verification comes first, then Otto (`/onboarding` from school-email page).
 * `next` must be a same-origin path (see auth callback route).
 */
export const POST_EMAIL_CONFIRM_PATH = "/auth/school-email?account_verified=1";

/**
 * Tap-to-confirm page the "Confirm your Vibe account" email links to
 * (`?token_hash=…&type=email`). It makes no auth call until the student taps,
 * so link scanners that GET the URL can't use up the token.
 */
export const EMAIL_CONFIRM_PAGE_PATH = "/auth/confirm";

/**
 * Default “you’re in” route after Otto + school verification (login, onboarding-complete, etc.).
 */
export const DEFAULT_POST_LOGIN_PATH = "/profile";

/** Build `emailRedirectTo` for signUp / invite flows. Must be listed in Supabase → Auth → Redirect URLs. */
export function getAuthEmailCallbackUrl(siteOrigin: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  const next = encodeURIComponent(POST_EMAIL_CONFIRM_PATH);
  return `${base}/auth/callback?next=${next}`;
}

/**
 * Site origin for auth email links built in the browser (signUp, resend):
 * NEXT_PUBLIC_SITE_URL without a trailing slash, else the current origin.
 * Empty string during a server render, where there is no window.
 */
export function getBrowserSiteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}
