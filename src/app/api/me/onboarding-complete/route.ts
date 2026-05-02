import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { otto_answers?: unknown };

/** Persist Otto output to public.users; client is static HTML with session cookies. */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const otto_answers = body.otto_answers;
  if (
    !otto_answers ||
    typeof otto_answers !== "object" ||
    Array.isArray(otto_answers)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid otto_answers" },
      { status: 400 },
    );
  }

  const { error: upErr } = await supabase
    .from("users")
    .update({ otto_answers })
    .eq("id", user.id);

  if (upErr) {
    console.error("[onboarding-complete]", upErr);
    return NextResponse.json(
      { ok: false, error: upErr.message },
      { status: 500 },
    );
  }

  const { data: row } = await supabase
    .from("users")
    .select("school_verified")
    .eq("id", user.id)
    .single();

  const schoolVerified = row?.school_verified === true;
  return NextResponse.json({
    ok: true,
    next: schoolVerified ? "/campus" : "/auth/school-email",
  });
}
