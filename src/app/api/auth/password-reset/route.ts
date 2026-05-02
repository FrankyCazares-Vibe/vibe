import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/auth/site-url";
import { sendPasswordResetEmail } from "@/lib/email/resend-transactional";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { email?: string };

/**
 * P1-006 — password reset via Resend: admin generateLink (recovery) + custom email.
 * Configure Supabase Auth redirect URLs to include `${SITE_URL}/auth/update-password`.
 */
export async function POST(req: Request) {
  const generic = {
    ok: true,
    message:
      "If an account exists for that email, you'll receive reset instructions shortly.",
  };

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
      return NextResponse.json(generic);
    }

    await sendPasswordResetEmail(email, data.properties.action_link);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/RESEND_FROM/i.test(message)) {
      return NextResponse.json({ ok: false, error: message }, { status: 503 });
    }
    console.error("[auth/password-reset]", message);
    return NextResponse.json(generic);
  }

  return NextResponse.json(generic);
}
