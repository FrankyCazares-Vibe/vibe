import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";

/** True when `public.users.otto_answers` has been saved after Otto onboarding. */
export function isOttoOnboardingComplete(otto: unknown): boolean {
  if (!otto || typeof otto !== "object" || Array.isArray(otto)) return false;
  return Object.keys(otto as Record<string, unknown>).length > 0;
}

/**
 * Where to send someone after a successful password login (or when no explicit `next`).
 * Order: verify school email → finish Otto → profile home.
 */
export async function getPostLoginDestination(
  supabase: SupabaseClient,
  explicitNext: string | null,
): Promise<string> {
  if (
    explicitNext &&
    explicitNext.startsWith("/") &&
    !explicitNext.startsWith("//")
  ) {
    return explicitNext;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth/login";

  const { data: row } = await supabase
    .from("users")
    .select("otto_answers, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.school_verified) {
    return "/auth/school-email";
  }
  if (!isOttoOnboardingComplete(row?.otto_answers)) {
    return "/onboarding";
  }
  return DEFAULT_POST_LOGIN_PATH;
}
