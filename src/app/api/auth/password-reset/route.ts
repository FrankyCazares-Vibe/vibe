import { after, NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/auth/site-url";
import { sendPasswordResetEmail } from "@/lib/email/resend-transactional";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { email?: string };

/**
 * P1-006 — password reset via Resend: admin generateLink (recovery) + custom email.
 *
 * The email links to our own `/auth/update-password?token_hash=…&type=recovery`,
 * never to GoTrue's `action_link`. A plain GET on `action_link` spends the
 * one-time token, and mail scanners (Outlook Safe Links, Gmail) GET links
 * before the student taps them — 3 of the 8 "One-time token not found"
 * errors on 2026-09-14 were reset links. The page spends the token with
 * verifyOtp only when the student submits a new password, and it works in
 * any browser because no PKCE verifier is involved.
 *
 * Every non-config outcome returns the same constant body so the endpoint
 * cannot be used to enumerate which emails have accounts.
 */
export async function POST(req: Request) {
  const generic = {
    ok: true,
    message:
      "If an account exists for that email, you'll receive reset instructions shortly.",
  };

  const perIp = await rateLimit(`pw-reset-ip:${clientIp(req)}`, {
    limit: 5,
    windowSec: 900,
  });
  if (!perIp.allowed) return tooManyRequests(perIp);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(generic);
  }

  const perEmail = await rateLimit(`pw-reset-email:${email}`, {
    limit: 3,
    windowSec: 3600,
  });
  if (!perEmail.allowed) return tooManyRequests(perEmail);

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Password reset is not configured (missing SUPABASE_SERVICE_ROLE_KEY on server).",
      },
      { status: 503 },
    );
  }

  // Only a real account costs a generated link and an email send, so doing
  // them before answering made real accounts measurably slower to respond.
  // They run after the response instead: every answer above takes the same
  // path (both limits, validation), and nothing below can reach the caller.
  after(async () => {
    try {
      const admin = createSupabaseServiceClient();

      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      const hashedToken = data?.properties?.hashed_token;
      if (error || !hashedToken) {
        if (error) {
          console.error("[auth/password-reset] generateLink", error.message);
        }
        return;
      }

      const resetUrl = `${getSiteUrl()}/auth/update-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      // Logged only; the response has already gone out.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auth/password-reset]", message);
    }
  });

  return NextResponse.json(generic);
}
