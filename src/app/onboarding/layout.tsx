import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Otto runs only after campus email is verified; skip if onboarding already saved.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/onboarding")}`);
  }

  const { data: row } = await supabase
    .from("users")
    .select("school_verified, otto_answers")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.school_verified) {
    redirect("/auth/school-email");
  }
  if (isOttoOnboardingComplete(row?.otto_answers)) {
    redirect(DEFAULT_POST_LOGIN_PATH);
  }

  return children;
}
