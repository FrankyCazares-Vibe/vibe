import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };

/**
 * Delete a single message. RLS (`messages_delete_own`) restricts this to
 * the original sender — any other caller hits 0-row delete and we surface
 * that as 403 so the UI shows a clear "you can't delete this" instead of
 * a silent success that leaves the message on the peer's side.
 *
 * Reactions and any cascaded children drop with the message via FK
 * cascade. The peer's view also loses the message on their next poll.
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: channelId, messageId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Confirm the message exists in the channel and we own it before delete —
  // gives a precise error rather than RLS-quiet 0 rows. Sender check is
  // belt-and-suspenders against the policy.
  const { data: msg, error: lookupErr } = await supabase
    .from("messages")
    .select("id, user_id, channel_id")
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (lookupErr) {
    console.error("[messages.DELETE lookup]", lookupErr);
    return NextResponse.json({ ok: false, error: lookupErr.message }, { status: 500 });
  }
  if (!msg) {
    return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if ((msg as { user_id: string }).user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Only the sender can delete this message" },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", user.id);
  if (error) {
    console.error("[messages.DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
