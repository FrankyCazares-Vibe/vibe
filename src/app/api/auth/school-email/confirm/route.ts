import { NextResponse } from "next/server";

import { verifySchoolEmailToken } from "@/lib/auth/school-email-token";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { token?: string };

/**
 * P1-006 — consume signed token; set users.school_email + school_verified (service role).
 *
 * The token alone is not enough: the caller must be signed in as the account
 * that requested the link. Otherwise an attacker could request a link for a
 * victim's .edu address and have the victim's click verify the attacker's row.
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
      { ok: false, error: "Invalid or expired verification link." },
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

  const admin = createSupabaseServiceClient();

  // Idempotent: a re-click of an already-consumed link is a no-op.
  const { data: current } = await admin
    .from("users")
    .select("school_email, school_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (
    current?.school_verified === true &&
    typeof current.school_email === "string" &&
    current.school_email.toLowerCase() === payload.email
  ) {
    return NextResponse.json({
      ok: true,
      message: "School email verified.",
    });
  }

  const { data: taken } = await admin
    .from("users")
    .select("id")
    .eq("school_email", payload.email)
    .maybeSingle();

  if (taken && taken.id !== user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "That school email was claimed by another account.",
      },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("users")
    .update({
      school_email: payload.email,
      school_verified: true,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[school-email/confirm]", error);
    return NextResponse.json(
      { ok: false, error: "Could not update profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "School email verified.",
  });
}
