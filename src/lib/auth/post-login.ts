import type { SupabaseClient } from "@supabase/supabase-js";

function ottoOnboardingComplete(otto: unknown): boolean {
  if (!otto || typeof otto !== "object" || Array.isArray(otto)) return false;
  return Object.keys(otto as Record<string, unknown>).length > 0;
}

/**
 * Where to send someone after a successful password login (or when no explicit `next`).
 * Order: finish Otto → add school email if needed → campus home.
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

  if (!ottoOnboardingComplete(row?.otto_answers)) {
    return "/onboarding";
  }
  if (!row?.school_verified) {
    return "/auth/school-email";
  }
  return "/campus";
}
