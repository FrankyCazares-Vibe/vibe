import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

const HEARTBEAT_SEC = 5;

/**
 * Heartbeat: while the user is actively typing in a channel, the composer
 * calls this every ~3s and we bump typing_until = now() + 5s. Peers polling
 * the messages route see "typing" until typing_until passes.
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

  const until = new Date(Date.now() + HEARTBEAT_SEC * 1000).toISOString();
  const { error } = await supabase
    .from("channel_members")
    .update({ typing_until: until })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    // Soft-fail when the column hasn't been migrated yet — typing is a
    // polish feature, not worth 500-ing the composer.
    if (/column|typing_until/i.test(error.message)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    console.error("[threads.typing]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
