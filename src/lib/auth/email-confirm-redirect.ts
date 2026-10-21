/**
 * Where a student goes once their email is confirmed. Since Oct 8, 2026 the
 * "Confirm your Vibe account" email carries an 8-digit code and nothing to
 * tap; typing it anywhere (the sign-up page, the login code box, the
 * /auth/confirm box, ConfirmCodeForm in each) confirms and signs in, then
 * comes here. Older emails' links still land here too, through /auth/confirm
 * (`?token_hash=`) and /auth/callback (`?code=`).
 * Campus .edu verification comes first, then Otto (`/onboarding` from school-email page).
 * A first confirmation also removes any password chosen before the inbox was
 * proven, so the sign-up page and the login code box put theirs back before
 * coming here, and everyone else meets the choose screen on the way
 * (src/lib/auth/choose-password-path.ts).
 * `next` must be a same-origin path (see auth callback route).
 */
export const POST_EMAIL_CONFIRM_PATH = "/auth/school-email?account_verified=1";

/**
 * Tap-to-confirm page that older "Confirm your Vibe account" emails link to
 * (`?token_hash=…&type=email`), with a code box for today's code-only email.
 * It makes no auth call until the student taps, so link scanners that GET
 * the URL can't use up the token.
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
