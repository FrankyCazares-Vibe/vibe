import { NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import {
  isEduEmail,
  isSchoolVerifySecretConfigured,
  signSchoolEmailToken,
} from "@/lib/auth/school-email-token";
import { sendSchoolVerificationEmail } from "@/lib/email/resend-transactional";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { schoolEmail?: string };

/**
 * P1-006 — request .edu verification email (signed token, Resend).
 * Caller must be logged in; does not mutate DB until confirm.
 */
export async function POST(req: Request) {
  if (!isSchoolVerifySecretConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "School email verification is not configured (SCHOOL_EMAIL_VERIFY_SECRET).",
      },
      { status: 503 },
    );
  }

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server misconfiguration (SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const schoolEmail =
    typeof body.schoolEmail === "string" ? body.schoolEmail.trim().toLowerCase() : "";

  if (!schoolEmail || !schoolEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid school email." },
      { status: 400 },
    );
  }

  if (!isEduEmail(schoolEmail)) {
    return NextResponse.json(
      {
        ok: false,
        error: "School email must be a .edu address.",
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("school_email, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profile?.school_verified &&
    profile.school_email?.toLowerCase() === schoolEmail
  ) {
    return NextResponse.json({
      ok: true,
      message: "This school email is already verified on your account.",
    });
  }

  const admin = createSupabaseServiceClient();
  const { data: row, error: lookupErr } = await admin
    .from("users")
    .select("id, school_email, school_verified")
    .eq("school_email", schoolEmail)
    .maybeSingle();

  if (lookupErr) {
    console.error("[school-email/request] lookup", lookupErr);
    return NextResponse.json(
      { ok: false, error: "Could not verify email availability." },
      { status: 500 },
    );
  }

  if (row && row.id !== user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "That school email is already linked to another account.",
      },
      { status: 409 },
    );
  }

  const token = signSchoolEmailToken(user.id, schoolEmail);
  const site = getSiteOriginForRequest(req);

  const { data: progress } = await supabase
    .from("users")
    .select("otto_answers")
    .eq("id", user.id)
    .maybeSingle();

  const afterVerify = isOttoOnboardingComplete(progress?.otto_answers)
    ? "/profile"
    : "/onboarding";
  const verifyUrl = `${site}/auth/verify-school?token=${encodeURIComponent(token)}&next=${encodeURIComponent(afterVerify)}`;

  try {
    await sendSchoolVerificationEmail(schoolEmail, verifyUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    message: "Check your school inbox for a verification link.",
  });
}
