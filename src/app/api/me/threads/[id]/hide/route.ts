import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/** What a refusal on the `threadSettings` budget says: the same line on every route that shares it (the numbers are in src/lib/limits/budgets.ts). */
const SETTINGS_TOO_FAST = "You're changing chat settings too fast. Try again in a few minutes.";

/**
 * Soft-hide a DM thread on the viewer's side. The peer's view is untouched.
 * If the peer sends a new message after this point, the thread re-surfaces
 * for the viewer (handled at the GET /api/me/threads filter step).
 *
 * A follower reading a club's Board (Franky, Oct 16) holds no row, so this
 * is a no-op for them (ok, nothing stored): the Board leaves their list
 * when they unfollow, not here.
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
  const rl = await limitFor("threadSettings", user.id);
  if (!rl.allowed) return tooManyRequests(rl, SETTINGS_TOO_FAST);

  const { error } = await supabase
    .from("channel_members")
    .update({ hidden_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[threads.hide]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
