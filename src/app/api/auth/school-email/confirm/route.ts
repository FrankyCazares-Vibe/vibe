import { NextResponse } from "next/server";

import { verifySchoolEmailToken } from "@/lib/auth/school-email-token";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { token?: string };

/** P1-006 — consume signed token; set users.school_email + school_verified (service role). */
export async function POST(req: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration." },
      { status: 503 },
    );
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

  const admin = createSupabaseServiceClient();

  const { data: taken } = await admin
    .from("users")
    .select("id")
    .eq("school_email", payload.email)
    .maybeSingle();

  if (taken && taken.id !== payload.userId) {
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
    .eq("id", payload.userId);

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
    school_email: payload.email,
  });
}
