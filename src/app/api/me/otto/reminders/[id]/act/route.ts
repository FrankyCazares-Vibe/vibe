import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/me/otto/reminders/:id/act — mark a reminder as acted-on.
 *
 * "Acted" is the affirmative dismiss — user did the thing — distinct from
 * `dismissed_at` which is "I don't care". Stamping `acted_at` also implies
 * dismissal (we set both so the row drops out of the hot query); future
 * Otto can mine `acted_at`-vs-`dismissed_at` to learn which reminders
 * actually convert.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("otto_reminders")
    .update({ acted_at: now, dismissed_at: now })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[otto/reminders ACT]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
