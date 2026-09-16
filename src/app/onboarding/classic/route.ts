import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";
import { hasRecordedConsent, CONSENT_COLUMNS, type ConsentRow } from "@/lib/legal/terms";
import { injectOnbBoot, preselectCampusId, type OnboardingBoot } from "@/lib/onboarding/boot";
import {
  ONBOARDING_PREFILL_CAMPUS_COLUMNS,
  ONBOARDING_PREFILL_COLUMNS,
  buildOnboardingPrefill,
  type OnboardingPrefillRow,
} from "@/lib/profile/onboarding-prefill";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** Gates + prefill. `school_email` is read here and NEVER sent to the client. */
const BASE_COLUMNS = `school_verified, otto_answers, ${CONSENT_COLUMNS}, ${ONBOARDING_PREFILL_COLUMNS}, school_email`;
/** The campus columns come from migration M1 (plan §5.1). */
const CAMPUS_COLUMNS = `${BASE_COLUMNS},school_system,${ONBOARDING_PREFILL_CAMPUS_COLUMNS}`;

type ClassicUserRow = OnboardingPrefillRow &
  ConsentRow & {
    school_verified?: unknown;
    otto_answers?: unknown;
    school_system?: unknown;
    school_email?: unknown;
  };

/**
 * Otto onboarding lives in `public/html/onboarding.html` as a static page, but
 * we serve it through the clean `/onboarding` URL (no `.html` in the address
 * bar). Auth checks happen here instead of in a layout file because Route
 * Handlers don't compose with `app/<segment>/layout.tsx`.
 *
 * `?replay=1` bypasses the "already complete" redirect so users can revisit
 * the flow after they've finished it; the static page reads the same param
 * and skips the API save so a replay doesn't overwrite their saved answers.
 *
 * BOOT DATA (plan §3.3, wave 2 B7): the same facts `/onboarding` hands the
 * phone tree are injected here as `<script id="onbBoot" type="application/
 * json">`, so the desktop page starts from the student's saved answers instead
 * of an empty form. It is served no-store and is per-user. The page is static
 * on disk, so this is the only way in; the JSON is escaped (`<` → `<`) so
 * a value can never close the script tag. Wave 3 (B13) reads the tag; the
 * bundle deployed today ignores it.
 *
 * Before migration M1 is applied the campus columns don't exist and the read
 * falls back to the base list — same handling as `/onboarding`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const replay = url.searchParams.get("replay") === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL("/auth/login?next=/onboarding", request.url),
      302,
    );
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
  const row = (data ?? null) as ClassicUserRow | null;

  // Consent first (S53 A4) — mirrors src/app/onboarding/page.tsx so a direct
  // hit on /onboarding/classic (bookmark, back button) can't skip the
  // interstitial and then dead-end on onboarding-complete's 403.
  if (!hasRecordedConsent(row)) {
    const back = `/onboarding${replay ? "?replay=1" : ""}`;
    return Response.redirect(
      new URL(`/auth/terms?next=${encodeURIComponent(back)}`, request.url),
      302,
    );
  }
  if (row?.school_verified !== true) {
    return Response.redirect(
      new URL("/auth/school-email", request.url),
      302,
    );
  }
  if (!replay && isOttoOnboardingComplete(row?.otto_answers)) {
    return Response.redirect(
      new URL(DEFAULT_POST_LOGIN_PATH, request.url),
      302,
    );
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

  const htmlPath = join(
    process.cwd(),
    "public",
    "html",
    "onboarding.html",
  );
  const html = await readFile(htmlPath, "utf-8");
  return new Response(injectOnbBoot(html, boot), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
