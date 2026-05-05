import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = {
  name?: unknown;
  /** R2 object key (`groups/<channel_id>/<uuid>.<ext>`). Pass null/empty to clear. */
  photo_url?: unknown;
};

/**
 * PATCH a channel — set group name or photo. Any member can change either
 * for v1 (matches the user's "anyone can upload" intent). 1:1 DMs reject
 * since they have no editable surface.
 */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Verify membership + that the channel is editable (group only).
  const { data: chan, error: chanErr } = await supabase
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (chanErr) {
    console.error("[threads.PATCH chan]", chanErr);
    return NextResponse.json({ ok: false, error: chanErr.message }, { status: 500 });
  }
  if (!chan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (chan.type !== "group") {
    return NextResponse.json(
      { ok: false, error: "Only group chats can be edited" },
      { status: 400 },
    );
  }

  const { data: membership } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const update: Record<string, string | null> = {};
  if (typeof body.name === "string") {
    update.name = body.name.trim().slice(0, 80);
  }
  if (typeof body.photo_url === "string") {
    const t = body.photo_url.trim();
    update.photo_url = t.length === 0 ? null : t;
  } else if (body.photo_url === null) {
    update.photo_url = null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  // Use service client because `channels` has no UPDATE RLS policy in the
  // base schema. Membership has been verified above.
  const admin = createSupabaseServiceClient();
  const { error: updErr } = await admin
    .from("channels")
    .update(update)
    .eq("id", channelId);
  if (updErr) {
    console.error("[threads.PATCH update]", updErr);
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
