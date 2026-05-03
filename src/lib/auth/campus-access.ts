import { redirect } from "next/navigation";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Campus shell routes: require login, Otto saved to DB, and verified school email.
 * Prevents hitting shell routes when the static Otto page fell back without a session.
 */
export async function enforceCampusAccess(currentPath: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const { data: row } = await supabase
    .from("users")
    .select("otto_answers, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!isOttoOnboardingComplete(row?.otto_answers)) {
    redirect("/onboarding");
  }
  if (!row?.school_verified) {
    redirect("/auth/school-email");
  }
}

/**
 * School email step: only after Otto is persisted; skip if already verified.
 */
export async function enforceSchoolEmailPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/auth/school-email")}`);
  }

  const { data: row } = await supabase
    .from("users")
    .select("otto_answers, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!isOttoOnboardingComplete(row?.otto_answers)) {
    redirect("/onboarding");
  }
  if (row?.school_verified) {
    redirect(DEFAULT_POST_LOGIN_PATH);
  }
}
