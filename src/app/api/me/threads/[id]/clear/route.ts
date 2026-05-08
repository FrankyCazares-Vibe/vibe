import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Clear the viewer's history for this channel. Stamps
 * `channel_members.cleared_at = now()`, so the messages GET filters out
 * everything older than that timestamp on the viewer's side. The peer's
 * copy is untouched — same model as iMessage / Telegram "Clear chat."
 *
 * No-op for channels the viewer isn't a member of (org channels without
 * an explicit channel_members row are silently ignored).
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

  const { error } = await supabase
    .from("channel_members")
    .update({ cleared_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    // If `cleared_at` column isn't on the DB yet (deploy lag) the API
    // surfaces a column-missing error. Surface it as a 500 so the UI
    // can show a fallback toast — same pattern other endpoints use.
    console.error("[threads.clear]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
