import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Record a view on a post or clip. Per-user-per-day dedupe (UTC), enforced
 * inside the SECURITY DEFINER `record_post_view` RPC. Refreshing the same
 * post on the same day is a no-op; viewing it the next day counts again.
 *
 * `counted: false` covers every case where no row was written: a signed-out
 * viewer, a repeat view on the same day, a post that no longer exists, and
 * — once 20260912100500_post_views_self_guard.sql is applied — the author
 * looking at their own post. Clients must not treat it as an error; the
 * campus post viewer uses it to decide whether to tick its local number,
 * which is exactly why an author's own view must answer false.
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, counted: !!data });
}
