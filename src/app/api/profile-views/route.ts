import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/profile-views — record that the signed-in user viewed a
 * profile. Body: `{ profile_user_id?: string, handle?: string }`.
 *
 * Per-viewer-per-day dedupe enforced by `record_profile_view_as` (SECURITY
 * DEFINER) — refreshing the same profile in a day is a no-op. Self-views
 * are intentionally skipped server-side. Anonymous viewers no-op without
 * a 401 so the client can fire-and-forget without branching on auth.
 *
 * WHY THE SERVICE ROLE (20261016120000). `record_profile_view_as` takes the
 * viewer from here: the id the sign-in server verified (`getUser()`), never
 * from the body. It refuses anon and authenticated inside (42501), so no
 * browser can call it and count views as anyone. The old
 * `record_profile_view` ran with the person's own sign-in; after the deploy
 * it answers false for everyone (20261016130000).
 *
 * Past the day cap (1,000 profiles a UTC day, counted in the database from
 * that day's view rows) the answer is `counted: false`, like a repeat. No
 * limiter key here: it would keep a record of when each person was viewing
 * (Privacy Policy 3d).
 */
export async function POST(req: Request) {
  let body: { profile_user_id?: unknown; handle?: unknown };
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

  // The page the viewer came from is no longer stored (Privacy Policy 3d,
  // Oct 7 2026): nothing read it. A `referrer` an old tab still sends is
  // dropped here, and the function has no place for one.
  let data: unknown;
  let error: { code?: string; message?: string } | null;
  try {
    ({ data, error } = await createSupabaseServiceClient().rpc("record_profile_view_as", {
      p_viewer: user.id,
      p_profile_user_id: profileId,
    }));
  } catch (err) {
    console.error("[profile-views POST]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (error) {
    console.error("[profile-views POST]", error.code ?? "unknown", error.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, counted: data === true });
}
