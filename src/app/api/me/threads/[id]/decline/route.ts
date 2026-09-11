import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Decline a message request — removes the viewer's own membership row while
 * it is still pending. RLS allows exactly that and nothing wider (policy
 * channel_members_delete_own_pending, migration 20260911100000); an accepted
 * conversation is hidden or left through other routes, never deleted here.
 * The other party still sees the channel on their side; v1 accepts that
 * minor oddity in exchange for not adding a `declined_at` flag column.
 *
 * The delete has to prove it removed something. Before that policy existed
 * it matched zero rows without an error, this route answered ok:true, and
 * the request came straight back on the next reload. Now zero rows removed
 * means re-reading the row and answering with what actually happened.
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: removed, error } = await supabase
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .is("accepted_at", null)
    .select("channel_id");

  if (error) {
    console.error("[threads.decline]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!removed?.length) {
    const { data: row, error: rowErr } = await supabase
      .from("channel_members")
      .select("accepted_at")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (rowErr) {
      console.error("[threads.decline reread]", rowErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    // No row left: a double tap, or already declined. That's what they asked for.
    if (!row) return NextResponse.json({ ok: true, already: true });
    if (row.accepted_at) {
      return NextResponse.json(
        { ok: false, error: "You already accepted this conversation." },
        { status: 409 },
      );
    }
    // Still pending after the delete: the DELETE policy is missing or no
    // longer matches. Fail loudly rather than claim a decline that didn't happen.
    console.error("[threads.decline] pending row survived delete", { channelId });
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
