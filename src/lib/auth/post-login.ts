import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isSafeRelativePath } from "@/lib/auth/login-next";

/** True when `public.users.otto_answers` has been saved after Otto onboarding. */
export function isOttoOnboardingComplete(otto: unknown): boolean {
  if (!otto || typeof otto !== "object" || Array.isArray(otto)) return false;
  return Object.keys(otto as Record<string, unknown>).length > 0;
}

/**
 * Where to send someone after a successful password login (or when no explicit `next`).
 * Order: verify school email → finish Otto → profile home.
 *
 * Runs in the browser with the anon/RLS client, which can no longer read
 * `otto_answers` (private column). The onboarding state comes from
 * /api/me/onboarding-state, which reads it server-side with the service
 * role scoped to the session user. On any failure we fall through to
 * `/onboarding`, whose server page redirects already-onboarded users onward.
 */
export async function getPostLoginDestination(
  supabase: SupabaseClient,
  explicitNext: string | null,
): Promise<string> {
  if (isSafeRelativePath(explicitNext)) {
    return explicitNext;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth/login";

  try {
    const res = await fetch("/api/me/onboarding-state", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as {
        ok?: boolean;
        school_verified?: boolean;
        otto_complete?: boolean;
      };
      if (body.ok) {
        if (!body.school_verified) return "/auth/school-email";
        if (!body.otto_complete) return "/onboarding";
        return DEFAULT_POST_LOGIN_PATH;
      }
    }
  } catch {
    // fall through
  }
  return "/onboarding";
}
