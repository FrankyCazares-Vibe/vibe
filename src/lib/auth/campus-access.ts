import { redirect } from "next/navigation";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { hasRecordedConsent, CONSENT_COLUMNS } from "@/lib/legal/terms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Campus shell routes: require login, accepted Terms, verified school email,
 * and Otto saved to DB.
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

  // otto_answers + the consent columns are private (not readable through
  // RLS), so the self-read goes through the service role scoped to the
  // caller's id.
  const { data: row } = await createSupabaseServiceClient()
    .from("users")
    .select(`otto_answers, school_verified, ${CONSENT_COLUMNS}`)
    .eq("id", user.id)
    .maybeSingle();

  // Consent first (S53 A4): accounts that predate consent capture — or whose
  // record is partial / stale — see the /auth/terms interstitial once, then
  // continue to `currentPath`.
  if (!hasRecordedConsent(row)) {
    redirect(`/auth/terms?next=${encodeURIComponent(currentPath)}`);
  }
  if (!row?.school_verified) {
    redirect("/auth/school-email");
  }
  if (!isOttoOnboardingComplete(row?.otto_answers)) {
    redirect("/onboarding");
  }
}

/**
 * School email step: before Otto for new users; skip if already verified (then continue flow).
 * Consent comes first (S53 A4): the request API 403s `terms_required`, so a
 * legacy unverified user must see the /auth/terms interstitial before this
 * page or they would be stuck with an inline error and no way forward.
 */
export async function enforceSchoolEmailPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/auth/school-email")}`);
  }

  // otto_answers + the consent columns are private (not readable through
  // RLS), so the self-read goes through the service role scoped to the
  // caller's id.
  const { data: row } = await createSupabaseServiceClient()
    .from("users")
    .select(`otto_answers, school_verified, ${CONSENT_COLUMNS}`)
    .eq("id", user.id)
    .maybeSingle();

  if (!hasRecordedConsent(row)) {
    redirect(`/auth/terms?next=${encodeURIComponent("/auth/school-email")}`);
  }
  if (row?.school_verified) {
    if (isOttoOnboardingComplete(row?.otto_answers)) {
      redirect(DEFAULT_POST_LOGIN_PATH);
    }
    redirect("/onboarding");
  }
}
