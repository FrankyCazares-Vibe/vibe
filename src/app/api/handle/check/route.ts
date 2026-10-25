import { NextResponse } from "next/server";

import { NEW_HANDLE_TOO_SHORT, NEW_HANDLE_MIN, validateHandle } from "@/lib/profile/handle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Live availability check for a candidate handle. Auth-gated so we don't
 * leak existence checks to scrapers. Returns:
 *   - { ok:true, available:true }
 *   - { ok:true, available:false, reason:"..." }   (taken or invalid)
 *
 * Treats the viewer's own current handle as "available" so the inline
 * editor doesn't flag it as taken when the user just opens the field. Any
 * other handle under NEW_HANDLE_MIN (7, Oct 25 2026) is "too short": the
 * 3-6 character handles people already have stay theirs, nobody new gets one.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const v = validateHandle(url.searchParams.get("h"));
  if (!v.ok) {
    return NextResponse.json({ ok: true, available: false, reason: v.reason });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("handle", v.handle)
    .maybeSingle();

  if (error) {
    console.error("[handle/check]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  if (data && data.id === user.id) {
    return NextResponse.json({ ok: true, available: true });
  }
  if (v.handle.length < NEW_HANDLE_MIN) {
    return NextResponse.json({ ok: true, available: false, reason: NEW_HANDLE_TOO_SHORT });
  }
  if (data) {
    return NextResponse.json({ ok: true, available: false, reason: "Taken" });
  }
  return NextResponse.json({ ok: true, available: true });
}
