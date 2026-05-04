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
    redirect(`/auth/login?next=${encodeURIComponent(currentPath)}`);
  }

  const { data: row } = await supabase
    .from("users")
    .select("otto_answers, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.school_verified) {
    redirect("/auth/school-email");
  }
  if (!isOttoOnboardingComplete(row?.otto_answers)) {
    redirect("/onboarding");
  }
}

/**
 * School email step: before Otto for new users; skip if already verified (then continue flow).
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

  if (row?.school_verified) {
    if (isOttoOnboardingComplete(row?.otto_answers)) {
      redirect(DEFAULT_POST_LOGIN_PATH);
    }
    redirect("/onboarding");
  }
}
