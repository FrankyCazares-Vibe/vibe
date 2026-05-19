import { redirect } from "next/navigation";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OnboardingSwitch } from "./OnboardingSwitch";

/**
 * `/onboarding` server page. Does the same auth + school + replay +
 * already-complete gates the old route handler did, then hands off to
 * the client-side `OnboardingSwitch` which forks desktop vs mobile.
 *
 * Desktop is unchanged — it loads the existing static HTML page at
 * `/onboarding/classic` inside an iframe so the custom cursor + warp
 * overlay + script tags all still run inside their own document.
 *
 * Mobile gets a native React rebuild that mirrors the same 4 steps
 * (Otto intro → profile → experience → resume) but laid out for
 * thumbs instead of mouse + cursor.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const replay = params.replay === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=/onboarding${replay ? "?replay=1" : ""}`);
  }

  const { data: row } = await supabase
    .from("users")
    .select("school_verified, otto_answers")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.school_verified) {
    redirect("/auth/school-email");
  }
  if (!replay && isOttoOnboardingComplete(row?.otto_answers)) {
    redirect(DEFAULT_POST_LOGIN_PATH);
  }

  return <OnboardingSwitch replay={replay} />;
}
