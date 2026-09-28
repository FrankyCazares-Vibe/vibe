import { NextResponse } from "next/server";

import { isUuid } from "@/lib/pgrest";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

/**
 * Resolve a user id to their CURRENT public-safe profile fields.
 * Used by the recently-searched dropdown so a stale handle (the user
 * changed it after we cached them) doesn't 404 the next click — we
 * look up by stable id and navigate to whatever the current handle is.
 *
 * 404 "User not found" when the user no longer exists (deleted account), when
 * the id isn't a uuid (it used to reach the database and come back a 500),
 * and when the caller and that person are in a block pair, either way round
 * (S67 security wave 2, A2; report #4). The block answer is the missing-user
 * answer, so nobody learns they were blocked, the same as search and the
 * profile bootstrap. The only caller (public/html/profile.html) falls back to
 * /profile/<cached handle>, where the bootstrap shows the blocked state.
 * The block read fails closed: an unreadable block list is a 500, never a
 * profile.
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

  if (!isUuid(id)) return notFound();

  const { data, error } = await supabase
    .from("users")
    .select("id, handle, name, avatar_url, school, major, year")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[users/by-id]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!data) return notFound();

  // Yourself: loadPairBlock answers "not blocked" with no read.
  const pair = await loadPairBlock(supabase, user.id, String((data as { id: unknown }).id));
  if (!pair.ok) {
    console.error("[users/by-id block-check]", pair.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (pair.blocked) return notFound();

  return NextResponse.json({ ok: true, user: data });
}
