import { NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import {
  isSchoolEmail,
  isSchoolVerifySecretConfigured,
  normalizeSchoolEmail,
  schoolEmailDomainsLabel,
  signSchoolEmailToken,
} from "@/lib/auth/school-email-token";
import { sendSchoolVerificationEmail } from "@/lib/email/resend-transactional";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { schoolEmail?: string };

/**
 * P1-006 — request campus email verification (signed token, Resend).
 * Only addresses on the SCHOOL_EMAIL_DOMAINS allowlist (default IU: iu.edu,
 * iupui.edu + subdomains) are accepted; other .edu domains get a clear 400.
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

  // Outbound email is the expensive part; cap per account and per source IP.
  const perUser = await rateLimit(`school-email:${user.id}`, {
    limit: 3,
    windowSec: 3600,
  });
  if (!perUser.allowed) return tooManyRequests(perUser);

  const perIp = await rateLimit(`school-email-ip:${clientIp(req)}`, {
    limit: 10,
    windowSec: 3600,
  });
  if (!perIp.allowed) return tooManyRequests(perIp);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Canonical form (trimmed, lowercased, trailing host dot stripped) so the
  // stored value, the token payload and the uniqueness lookup all agree.
  const schoolEmail =
    typeof body.schoolEmail === "string"
      ? normalizeSchoolEmail(body.schoolEmail)
      : null;

  if (!schoolEmail) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid school email." },
      { status: 400 },
    );
  }

  if (!isSchoolEmail(schoolEmail)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Use your IU email address (${schoolEmailDomainsLabel()}).`,
      },
      { status: 400 },
    );
  }

  // `school_email` / `otto_answers` are private columns the RLS role cannot
  // select; read them with the service client scoped to the session's user id.
  const admin = createSupabaseServiceClient();

  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("school_email, school_verified, otto_answers")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[school-email/request] profile", profileErr);
    return NextResponse.json(
      { ok: false, error: "Could not load your profile." },
      { status: 500 },
    );
  }

  if (
    profile?.school_verified &&
    profile.school_email?.toLowerCase() === schoolEmail
  ) {
    return NextResponse.json({
      ok: true,
      message: "This school email is already verified on your account.",
    });
  }

  const { data: row, error: lookupErr } = await admin
    .from("users")
    .select("id")
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

  const afterVerify = isOttoOnboardingComplete(profile?.otto_answers)
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
