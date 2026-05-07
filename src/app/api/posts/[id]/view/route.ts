import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Record a view on a post or clip. Per-user-per-day dedupe (UTC), enforced
 * inside the SECURITY DEFINER `record_post_view` RPC. Refreshing the same
 * post on the same day is a no-op; viewing it the next day counts again.
 *
 * Fire-and-forget from the client — failures are non-fatal.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    // Anonymous viewers don't count yet — don't 401, just no-op so the
    // client doesn't have to special-case signed-out paths.
    return NextResponse.json({ ok: true, counted: false });
  }

  const { data, error } = await supabase.rpc("record_post_view", {
    p_post_id: id,
  });

  if (error) {
    console.error("[posts/:id/view POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, counted: !!data });
}
