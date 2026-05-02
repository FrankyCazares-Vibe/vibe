/**
 * Redirect target after Supabase email confirmation (`exchangeCodeForSession`).
 * `next` must be a same-origin path (see auth callback route).
 */
export const POST_EMAIL_CONFIRM_PATH = "/auth/school-email?account_verified=1";

/**
 * Next.js bridge: checks session, then full-navigates to static Otto UI (avoids App Router / Link
 * treating `/html/*.html` like an app route and leaving users on the wrong screen).
 */
export const DEFAULT_POST_LOGIN_PATH = "/onboarding";

/** Static Otto onboarding (middleware requires session unless ?legacy=1). */
export const ONBOARDING_STATIC_PATH = "/html/onboarding.html";

/** Build `emailRedirectTo` for signUp / invite flows. Must be listed in Supabase → Auth → Redirect URLs. */
export function getAuthEmailCallbackUrl(siteOrigin: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  const next = encodeURIComponent(POST_EMAIL_CONFIRM_PATH);
  return `${base}/auth/callback?next=${next}`;
}
