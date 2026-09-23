import { NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { schoolIdentityRestrictionGate } from "@/lib/auth/school-email-apply";
import { schoolEmailRejection } from "@/lib/auth/school-email-domains";
import {
  isSchoolVerifySecretConfigured,
  normalizeSchoolEmail,
  SCHOOL_CODE_LENGTH,
  SCHOOL_CODE_WINDOW_SEC,
  schoolEmailCode,
  signSchoolEmailToken,
} from "@/lib/auth/school-email-token";
import { sendSchoolVerificationEmail } from "@/lib/email/resend-transactional";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { schoolIdentityConflict } from "@/lib/moderation/access";
import { clientNetworkKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { schoolEmail?: string };

/**
 * P1-006 — request school email verification (signed link + typed code, Resend).
 * Only addresses in the code allowlist (school-email-domains.ts: @iu.edu, plus
 * Purdue's domains once PURDUE_SIGNUPS_ENABLED flips; subdomains included,
 * optionally narrowed by SCHOOL_EMAIL_DOMAINS) are accepted. Retired IU
 * domains (@iupui.edu, …) and everything else get a clear 400 with a `code`.
 * Caller must be logged in; does not mutate DB until confirm / confirm-code.
 *
 * A verified student may request a DIFFERENT address, including one from the
 * other university (Franky Q1); only a resubmit of the same verified address
 * short-circuits. The apply helper handles the system change.
 *
 * Two refusals sit BELOW the rate limits, never above them: an address another
 * account already holds (409) and an address a restriction covers (403).
 * Unmetered, either one is a free answer to "does this student have Vibe?"
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

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

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

  // Retired IU domain → "IU retired @iupui.edu addresses…"; anything else off
  // the allowlist → "Use your school email (@iu.edu)." (no Purdue mention
  // until PURDUE_SIGNUPS_ENABLED flips, critic B4).
  const rejection = schoolEmailRejection(schoolEmail);
  if (rejection) {
    return NextResponse.json(
      { ok: false, code: rejection.code, error: rejection.error },
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
      alreadyVerified: true,
      message: "This school email is already verified on your account.",
    });
  }

  // Rate limit ONLY requests that will actually send mail. Placing these
  // above the validation above meant a typo — a malformed address, or a
  // non-IU domain, which A3 made the common rejection — spent the same
  // budget as a real send. Three typos locked a student out of the signup
  // gate for an hour having received zero emails. The already-verified
  // resubmit above sends nothing, so it is free too. Outbound email is still
  // the expensive part; it just costs nothing to reject a bad address.
  //
  // These MUST stay above the "linked to another account" lookup below:
  // without a limit in front of it, that 409 is an unlimited oracle for
  // which school addresses already have a Vibe account.
  const perUser = await rateLimit(`school-email:${user.id}`, {
    limit: 3,
    windowSec: 3600,
  });
  if (!perUser.allowed) {
    return tooManyRequests(
      perUser,
      "You've asked for 3 emails this hour. Use the code or link from the newest one, or try again later this hour.",
    );
  }

  // Per network, sized for a signup table on shared campus Wi-Fi, where one
  // IPv4 address can be a whole room. IPv6 counts by /64, so rotating
  // addresses doesn't buy more sends; the per-user limit above still caps
  // each account at 3.
  const perIp = await rateLimit(`school-email-ip:${clientNetworkKey(req)}`, {
    limit: 60,
    windowSec: 3600,
  });
  if (!perIp.allowed) {
    return tooManyRequests(
      perIp,
      "Lots of verification emails from this network right now. Try again later this hour.",
    );
  }

  // Canonical, not exact: `name@iu.edu`, `name+2@iu.edu` and
  // `name@mail.iu.edu` are one student, and until S64 each variant could
  // verify its own account. Same status and same sentence as before — clients
  // match on both — plus a `code` they can branch on.
  const conflict = await schoolIdentityConflict(schoolEmail, user.id);

  if (!conflict.ok) {
    // Already logged where the read failed; repeating it here would put a
    // school address in the log next to it.
    return NextResponse.json(
      { ok: false, error: "Could not verify email availability." },
      { status: 500 },
    );
  }

  // The canonical scan only reads rows that are already VERIFIED, but the
  // unique index behind this column (`users_school_email_key`) is on the raw
  // text and doesn't care who verified. A row holding this exact address
  // unverified would walk past the scan and then break the UPDATE at confirm
  // time — a 500 where the student deserves the sentence below. One indexed
  // lookup, only when the scan found nothing.
  let takenBy = conflict.takenBy;
  if (!takenBy) {
    const { data: exact, error: exactErr } = await admin
      .from("users")
      .select("id")
      .eq("school_email", schoolEmail)
      .neq("id", user.id)
      .maybeSingle();
    if (exactErr) {
      // Code only: the query was filtered on a school address, and the error
      // text can carry it back.
      console.error("[school-email/request] address lookup", exactErr.code);
      return NextResponse.json(
        { ok: false, error: "Could not verify email availability." },
        { status: 500 },
      );
    }
    takenBy = exact?.id ?? null;
  }

  if (takenBy) {
    return NextResponse.json(
      {
        ok: false,
        code: "school_email_taken",
        error: "That school email is already linked to another account.",
      },
      { status: 409 },
    );
  }

  // A suspended or banned student can delete the account and sign up again,
  // so the address itself is what carries the restriction. Sits here, below
  // the limits, for the same reason the lookup above does: unmetered, it
  // would answer "is this address banned?" for anyone who asks.
  const restricted = await schoolIdentityRestrictionGate(schoolEmail);
  if (restricted) {
    return NextResponse.json(restricted.body, { status: restricted.status });
  }

  const token = signSchoolEmailToken(user.id, schoolEmail);
  // Same code for every send inside a 30-minute window, so a resend never
  // invalidates the email the student is already reading.
  const code = schoolEmailCode(user.id, schoolEmail);
  const site = getSiteOriginForRequest(req);

  const afterVerify = isOttoOnboardingComplete(profile?.otto_answers)
    ? "/profile"
    : "/onboarding";
  const verifyUrl = `${site}/auth/verify-school?token=${encodeURIComponent(token)}&next=${encodeURIComponent(afterVerify)}`;

  try {
    await sendSchoolVerificationEmail(schoolEmail, verifyUrl, code, user.id);
  } catch (err) {
    // Never surface provider/config messages to the caller. The attempt and
    // what Resend said are in the send log (src/lib/email/send-log.ts).
    const message = err instanceof Error ? err.message : String(err);
    console.error("[school-email/request] send", message);
    // `error` stays byte-identical: onboarding (StepCampus, onboarding.html)
    // shows it as-is and older /auth/school-email bundles match on it.
    // `attemptedTo` is the address this signed-in caller just typed, the
    // same value a success echoes as `sentTo`, so the page can name it.
    return NextResponse.json(
      {
        ok: false,
        code: "send_failed",
        error: "We couldn't send the email right now. Try again in a minute.",
        attemptedTo: schoolEmail,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Check your school inbox for a code and a link.",
    sentTo: schoolEmail,
    codeLength: SCHOOL_CODE_LENGTH,
    codeMinutes: SCHOOL_CODE_WINDOW_SEC / 60,
  });
}
