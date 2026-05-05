import { NextResponse } from "next/server";

import { validateHandle } from "@/lib/profile/handle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Live availability check for a candidate handle. Auth-gated so we don't
 * leak existence checks to scrapers. Returns:
 *   - { ok:true, available:true }
 *   - { ok:true, available:false, reason:"..." }   (taken or invalid)
 *
 * Treats the viewer's own current handle as "available" so the inline
 * editor doesn't flag it as taken when the user just opens the field.
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (data && data.id !== user.id) {
    return NextResponse.json({ ok: true, available: false, reason: "Taken" });
  }
  return NextResponse.json({ ok: true, available: true });
}
