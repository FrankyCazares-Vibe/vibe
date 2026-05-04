import { NextResponse } from "next/server";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { sanitizeOnboardingProfile } from "@/lib/profile/onboarding-prefill";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  otto_answers?: unknown;
  profile?: unknown;
};

/** Persist Otto output + optional quick profile pre-fill to `public.users`. */
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

  const profilePatch = sanitizeOnboardingProfile(body.profile);
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

  const { error: upErr } = await supabase
    .from("users")
    .update(updateRow)
    .eq("id", user.id);

  if (upErr) {
    console.error("[onboarding-complete]", upErr);
    return NextResponse.json(
      { ok: false, error: upErr.message },
      { status: 500 },
    );
  }

  const { data: row } = await supabase
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
