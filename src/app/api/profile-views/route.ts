import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/profile-views — record that the signed-in user viewed a
 * profile. Body: `{ profile_user_id?: string, handle?: string, referrer?: string }`.
 *
 * Per-viewer-per-day dedupe enforced by `record_profile_view` (SECURITY
 * DEFINER) — refreshing the same profile in a day is a no-op. Self-views
 * are intentionally skipped server-side. Anonymous viewers no-op without
 * a 401 so the client can fire-and-forget without branching on auth.
 */
export async function POST(req: Request) {
  let body: { profile_user_id?: unknown; handle?: unknown; referrer?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: true, counted: false });
  }

  let profileId: string | null = null;
  if (typeof body.profile_user_id === "string" && body.profile_user_id.length > 0) {
    profileId = body.profile_user_id;
  } else if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    profileId = data.id as string;
  }
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "Missing profile_user_id or handle" }, { status: 400 });
  }

  const referrer =
    typeof body.referrer === "string" ? body.referrer.slice(0, 80) : null;

  const { data, error } = await supabase.rpc("record_profile_view", {
    p_profile_user_id: profileId,
    p_referrer: referrer,
  });
  if (error) {
    console.error("[profile-views POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, counted: !!data });
}
