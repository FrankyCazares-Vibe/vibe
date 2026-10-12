import { after, NextResponse } from "next/server";

import {
  firstRefusal,
  resetAddressLimits,
  resetNetworkLimit,
  resetSendLimits,
  type ResetLimit,
} from "@/lib/auth/password-reset-limits";
import { getSiteUrl } from "@/lib/auth/site-url";
import { recipientRateKey } from "@/lib/email/send-log-core";
import { sendPasswordResetEmail } from "@/lib/email/resend-transactional";
import { clientNetworkKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { email?: string };

/** One ask of the shared limiter for a limit from password-reset-limits.ts. */
function hit(limit: ResetLimit) {
  return rateLimit(limit.key, limit);
}

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
 *
 * Three limits (numbers and keys in src/lib/auth/password-reset-limits.ts),
 * because every reset email comes out of the daily email allowance sign-up
 * codes share: per network and per address before the answer (a 429, the
 * same for an address with or without an account), and a cap on reset emails
 * as a whole after it, which never changes the answer.
 */
export async function POST(req: Request) {
  const generic = {
    ok: true,
    message:
      "If an account exists for that email, you'll receive reset instructions shortly.",
  };

  // The network bucket, not the raw address: one device on IPv6 can pick a
  // new address at will. Refuses when the limiter is down, as the cap below
  // does, so a database hiccup is never an open door to the email allowance.
  const perNetwork = await firstRefusal(
    [resetNetworkLimit(clientNetworkKey(req))],
    hit,
  );
  if (perNetwork) return tooManyRequests(perNetwork);

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

  // Keyed on a hash, never the address: public.rate_limits used to hold
  // every reset address in plaintext (the E1 migration deleted those rows).
  // Counted for every address typed, account or not, so the 429 says nothing
  // about who is on Vibe.
  const emailKey = recipientRateKey(email, process.env.SCHOOL_EMAIL_VERIFY_SECRET);
  const perAddress = await firstRefusal(resetAddressLimits(emailKey), hit);
  if (perAddress) return tooManyRequests(perAddress);

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
  // path (the limits, validation), and nothing below can reach the caller.
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

      // The cap on reset emails as a whole. Counted here and nowhere earlier:
      // only an address with an account gets this far, so requests for
      // addresses with no account can't spend it. The answer has already
      // gone out, so a spent cap looks the same to the caller as a send.
      // The link above is already made, so while the cap is spent an older
      // reset email for this address stops working with no new one sent.
      if (await firstRefusal(resetSendLimits(), hit)) {
        console.warn(
          "[auth/password-reset] the cap on reset emails is spent, or the limiter is down: a reset email was not sent",
        );
        return;
      }

      const resetUrl = `${getSiteUrl()}/auth/update-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
      // The user id goes into the send log (src/lib/email/send-log.ts). An
      // address with no account never gets here, so it never gets a row.
      await sendPasswordResetEmail(email, resetUrl, data?.user?.id ?? null);
    } catch (err) {
      // Logged only; the response has already gone out.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auth/password-reset]", message);
    }
  });

  return NextResponse.json(generic);
}
