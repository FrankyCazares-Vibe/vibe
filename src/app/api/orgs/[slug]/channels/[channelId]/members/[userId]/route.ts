import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; channelId: string; userId: string }> };

/**
 * DELETE /api/orgs/[slug]/channels/[channelId]/members/[userId]
 * Removes a user from the per-channel allow list. Owner/admin only — mods
 * can't revoke channel access (matches the INSERT policy).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, channelId, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: channel } = await service
    .from("channels")
    .select("id, org_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.org_id !== org.id) {
    return NextResponse.json({ ok: false, error: "Channel not found" }, { status: 404 });
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer || !["owner", "admin"].includes(viewer.role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const { error } = await service
    .from("org_channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);
  if (error) {
    console.error("[channel/members/[userId] DELETE]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to revoke access" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
