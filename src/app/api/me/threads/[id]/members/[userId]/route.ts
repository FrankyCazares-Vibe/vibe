import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

/**
 * Remove a member from a group chat.
 *   - If userId === viewer → leave the group (always allowed).
 *   - Else → kick. Only admins can kick. Admins cannot kick themselves
 *     through this path (use leave instead).
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: channelId, userId: targetUserId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Verify viewer is a member, capture role.
  const { data: viewerRow } = await supabase
    .from("channel_members")
    .select("role")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerRow) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const isSelf = targetUserId === user.id;
  if (!isSelf && viewerRow.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only admins can remove other members" },
      { status: 403 },
    );
  }

  const admin = createSupabaseServiceClient();
  const { error: delErr } = await admin
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", targetUserId);
  if (delErr) {
    console.error("[threads.members.DELETE]", delErr);
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
