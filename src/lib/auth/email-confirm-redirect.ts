/**
 * Redirect target after Supabase email confirmation (`exchangeCodeForSession`).
 * `next` must be a same-origin path (see auth callback route).
 */
export const POST_EMAIL_CONFIRM_PATH = "/auth/school-email?account_verified=1";

/**
 * Where sign-in goes when `?next=` is missing. App shell (feed), not marketing `/`.
 */
export const DEFAULT_POST_LOGIN_PATH = "/feed";

/** Build `emailRedirectTo` for signUp / invite flows. Must be listed in Supabase → Auth → Redirect URLs. */
export function getAuthEmailCallbackUrl(siteOrigin: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  const next = encodeURIComponent(POST_EMAIL_CONFIRM_PATH);
  return `${base}/auth/callback?next=${next}`;
}
