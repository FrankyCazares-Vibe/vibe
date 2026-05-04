/**
 * Redirect target after Supabase email confirmation (`exchangeCodeForSession`).
 * Campus .edu verification comes first, then Otto (`/onboarding` from school-email page).
 * `next` must be a same-origin path (see auth callback route).
 */
export const POST_EMAIL_CONFIRM_PATH = "/auth/school-email?account_verified=1";

/**
 * Default “you’re in” route after Otto + school verification (login, onboarding-complete, etc.).
 */
export const DEFAULT_POST_LOGIN_PATH = "/profile";

/** Static Otto HTML — load through `/onboarding` so query params are preserved. */
export const ONBOARDING_STATIC_PATH = "/html/onboarding.html";

/** Build `emailRedirectTo` for signUp / invite flows. Must be listed in Supabase → Auth → Redirect URLs. */
export function getAuthEmailCallbackUrl(siteOrigin: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  const next = encodeURIComponent(POST_EMAIL_CONFIRM_PATH);
  return `${base}/auth/callback?next=${next}`;
}
