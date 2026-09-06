import { NextResponse } from "next/server";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { sanitizeOnboardingProfile } from "@/lib/profile/onboarding-prefill";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = {
  otto_answers?: unknown;
  profile?: unknown;
};

/**
 * Persist Otto output + optional quick profile pre-fill to `public.users`.
 *
 * Refuses (403 `terms_required`) until the user has accepted the Terms —
 * the /onboarding server page already redirects such users to /auth/terms,
 * but the API must hold the line on its own. The write goes through the
 * service client: `otto_answers` is no longer in the authenticated UPDATE
 * grant (20260906110000), so this route is the only way to mark Otto done
 * and its consent check cannot be skipped via PostgREST.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const otto_answers = body.otto_answers;
  if (
    !otto_answers ||
    typeof otto_answers !== "object" ||
    Array.isArray(otto_answers)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid otto_answers" },
      { status: 400 },
    );
  }

  const profilePatch = sanitizeOnboardingProfile(body.profile, user.id);
  if (profilePatch === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid profile" },
      { status: 400 },
    );
  }

  const updateRow = {
    otto_answers,
    ...profilePatch,
  };

  const service = createSupabaseServiceClient();
  const { error: upErr } = await service
    .from("users")
    .update(updateRow)
    .eq("id", user.id);

  if (upErr) {
    console.error("[onboarding-complete]", upErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const { data: row } = await service
    .from("users")
    .select("school_verified")
    .eq("id", user.id)
    .single();

  const schoolVerified = row?.school_verified === true;
  const baseNext = schoolVerified ? DEFAULT_POST_LOGIN_PATH : "/auth/school-email";
  const next =
    schoolVerified && Object.keys(profilePatch).length > 0
      ? `${baseNext}?otto=1`
      : baseNext;

  return NextResponse.json({
    ok: true,
    next,
  });
}
