import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Mark a thread as read up to now. Idempotent.
 *
 * No limiter, on purpose (rate limits, wave 3): a per-account count of read
 * marks would be a record of when someone reads their chats, which Privacy
 * Policy 3d rules out. Clients send a mark when a chat opens and when a new
 * message lands in it, not on every poll.
 *
 * And the write is never skipped: other members' "Read" and the unread
 * badge both come from `last_read_at` (api/me/threads/route.ts), so a mark
 * skipped because the last one was recent would leave a message that came
 * in between unread for good once the chat goes quiet (limits critique #4).
 * One row, the caller's own.
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
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[threads.read]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
