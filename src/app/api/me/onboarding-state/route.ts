import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/me/onboarding-state — { school_verified, otto_complete } for the
 * signed-in user. Exists because `otto_answers` is a private column the
 * browser client can't read; the login page uses this to pick the
 * post-login destination.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await createSupabaseServiceClient()
    .from("users")
    .select("school_verified, otto_answers")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[me/onboarding-state]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      school_verified: Boolean(row?.school_verified),
      otto_complete: isOttoOnboardingComplete(row?.otto_answers),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
