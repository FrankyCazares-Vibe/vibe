import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Resolve a user id to their CURRENT public-safe profile fields.
 * Used by the recently-searched dropdown so a stale handle (the user
 * changed it after we cached them) doesn't 404 the next click — we
 * look up by stable id and navigate to whatever the current handle is.
 *
 * Returns 404 only when the user no longer exists (deleted account).
 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, handle, name, avatar_url, school, major, year")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[users/by-id]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, user: data });
}
