import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/** Explicitly accept a message request. Idempotent. */
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

  const { data: existing, error: readErr } = await supabase
    .from("channel_members")
    .select("accepted_at")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) {
    console.error("[threads.accept read]", readErr);
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }
  if (existing.accepted_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error: updErr } = await supabase
    .from("channel_members")
    .update({ accepted_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (updErr) {
    console.error("[threads.accept update]", updErr);
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
