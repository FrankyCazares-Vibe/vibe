import { NextResponse } from "next/server";

import { isSchoolVerifySecretConfigured } from "@/lib/auth/school-email-token";
import { isResendConfigured } from "@/lib/resend";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * P1-006 — reports whether server-side auth email flows can run.
 */
export async function GET() {
  const resendFrom = Boolean(process.env.RESEND_FROM?.trim());
  const siteUrl = Boolean(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.VERCEL_URL?.trim(),
  );

  return NextResponse.json({
    ok: true,
    supabaseServiceRole: isSupabaseServiceConfigured(),
    resendApi: isResendConfigured(),
    resendFrom,
    schoolVerifySecret: isSchoolVerifySecretConfigured(),
    siteUrlConfigured: siteUrl,
    note:
      "Password reset and .edu verification need service role + RESEND_FROM + verified Resend domain.",
  });
}
