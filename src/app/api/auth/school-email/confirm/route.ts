import { NextResponse } from "next/server";

import { applySchoolEmailVerification } from "@/lib/auth/school-email-apply";
import { verifySchoolEmailToken } from "@/lib/auth/school-email-token";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service";

type Body = { token?: string };

/**
 * P1-006 — consume signed token; set users.school_email + school_verified
 * (+ school_system from the domain) with the service role.
 *
 * The token alone is not enough: the caller must be signed in as the account
 * that requested the link. Otherwise an attacker could request a link for a
 * victim's .edu address and have the victim's click verify the attacker's row.
 * The write itself (idempotent / allowlist / 409 / update) is shared with the
 * typed-code route in school-email-apply.ts.
 */
export async function POST(req: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration." },
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

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const payload = verifySchoolEmailToken(token);
  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This verification link has expired or is broken. Send a new one from the verify page.",
      },
      { status: 400 },
    );
  }

  if (user.id !== payload.userId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This link belongs to a different account. Sign in with the account that requested it.",
      },
      { status: 403 },
    );
  }

  const r = await applySchoolEmailVerification(user.id, payload.email);
  return NextResponse.json(r.body, { status: r.status });
}
