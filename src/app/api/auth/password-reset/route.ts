import { NextResponse } from "next/server";

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
 * Configure Supabase Auth redirect URLs to include `${SITE_URL}/auth/update-password`.
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

  try {
    const admin = createSupabaseServiceClient();
    const site = getSiteUrl();
    const redirectTo = `${site}/auth/update-password`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      if (error) {
        console.error("[auth/password-reset] generateLink", error.message);
      }
      return NextResponse.json(generic);
    }

    await sendPasswordResetEmail(email, data.properties.action_link);
  } catch (err) {
    // Never surface provider/config messages to the caller.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/password-reset]", message);
    return NextResponse.json(generic);
  }

  return NextResponse.json(generic);
}
