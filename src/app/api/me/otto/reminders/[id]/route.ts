import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * DELETE /api/me/otto/reminders/:id — soft-dismiss.
 *
 * We set `dismissed_at` instead of hard-deleting so we can rebuild a "what
 * Otto remembered" history later if needed. The user_remind_idx is partial
 * on `dismissed_at IS NULL`, so dismissed rows drop out of the hot query.
 *
 * RLS scopes the update to the row owner — no extra `eq("user_id", …)`
 * needed, but we include it as belt-and-suspenders.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("otto_reminders")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[otto/reminders DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
