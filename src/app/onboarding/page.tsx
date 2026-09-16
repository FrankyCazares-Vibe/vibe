import { redirect } from "next/navigation";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";
import { hasRecordedConsent, CONSENT_COLUMNS, type ConsentRow } from "@/lib/legal/terms";
import { preselectCampusId, type OnboardingBoot } from "@/lib/onboarding/boot";
import {
  ONBOARDING_PREFILL_CAMPUS_COLUMNS,
  ONBOARDING_PREFILL_COLUMNS,
  buildOnboardingPrefill,
  type OnboardingPrefillRow,
} from "@/lib/profile/onboarding-prefill";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { OnboardingSwitch } from "./OnboardingSwitch";

/** Gates + prefill. `school_email` is read here and NEVER sent to the client. */
const BASE_COLUMNS = `school_verified, otto_answers, ${CONSENT_COLUMNS}, ${ONBOARDING_PREFILL_COLUMNS}, school_email`;
/** The campus columns come from migration M1 (plan §5.1). */
const CAMPUS_COLUMNS = `${BASE_COLUMNS},school_system,${ONBOARDING_PREFILL_CAMPUS_COLUMNS}`;

type OnboardingPageRow = OnboardingPrefillRow &
  ConsentRow & {
    school_verified?: unknown;
    otto_answers?: unknown;
    school_system?: unknown;
    school_email?: unknown;
  };

/**
 * `/onboarding` server page. Does the same auth + consent + school + replay +
 * already-complete gates the old route handler did, then hands off to the
 * client-side `OnboardingSwitch` which forks desktop vs mobile.
 *
 * Desktop is unchanged — it loads the existing static HTML page at
 * `/onboarding/classic` inside an iframe so the custom cursor + warp overlay
 * + script tags all still run inside their own document. That page gets the
 * same boot data through an injected `<script id="onbBoot">`.
 *
 * BOOT DATA (plan §3.3, wave 2 B7): the flow starts from server facts, so the
 * campus screen paints before any fetch and the profile screen starts from the
 * student's saved answers with the `handle_new_user` trigger defaults blanked.
 * `school_email` is read for the @pfw.edu / @pnw.edu preselect and reduced to
 * a campus id — the address itself is a private column and never leaves here.
 *
 * Before migration M1 is applied the campus columns don't exist, so the read
 * falls back to the base list and the prefill takes the campus from the legacy
 * `school` label (unconfirmed), which is exactly what `buildOnboardingPrefill`
 * does with an absent `campus_id`.
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

  // otto_answers, the consent columns and school_email are private (no RLS
  // read); self-read via service role.
  const service = createSupabaseServiceClient();
  let { data, error } = await service
    .from("users")
    .select(CAMPUS_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await service
      .from("users")
      .select(BASE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle());
  }
  const row = (data ?? null) as OnboardingPageRow | null;

  // Consent first (S53 A4): accounts that predate consent capture see the
  // /auth/terms interstitial once, then come back here.
  if (!hasRecordedConsent(row)) {
    redirect(
      `/auth/terms?next=${encodeURIComponent(`/onboarding${replay ? "?replay=1" : ""}`)}`,
    );
  }
  if (row?.school_verified !== true) {
    redirect("/auth/school-email");
  }
  if (!replay && isOttoOnboardingComplete(row?.otto_answers)) {
    redirect(DEFAULT_POST_LOGIN_PATH);
  }

  const system: SchoolSystem | null = isSchoolSystem(row?.school_system)
    ? row.school_system
    : null;
  const boot: OnboardingBoot = {
    replay,
    userId: user.id,
    system,
    prefill: buildOnboardingPrefill(row),
    singleCampusId: preselectCampusId(row?.school_email, system),
  };

  return <OnboardingSwitch boot={boot} />;
}
