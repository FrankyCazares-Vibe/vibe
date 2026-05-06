import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };
type Body = { duration_hours?: unknown };

const ALLOWED_HOURS: ReadonlySet<number> = new Set([1, 8, 24, 168]);
const FOREVER_YEARS = 100;

/**
 * Mute a specific person within a single channel.
 * Distinct from /api/me/mute (which is global) and /api/me/threads/[id]/mute
 * (which silences a whole channel). Body `{ duration_hours }` set to
 * 1/8/24/168, omitted = forever.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id: channelId, userId: targetUserId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot mute yourself" }, { status: 400 });
  }

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* allow empty */ }

  let until: string;
  if (typeof body.duration_hours === "number" && body.duration_hours > 0) {
    if (!ALLOWED_HOURS.has(body.duration_hours)) {
      return NextResponse.json(
        { ok: false, error: "duration_hours must be one of 1, 8, 24, 168" },
        { status: 400 },
      );
    }
    until = new Date(Date.now() + body.duration_hours * 60 * 60 * 1000).toISOString();
  } else {
    const d = new Date();
    d.setFullYear(d.getFullYear() + FOREVER_YEARS);
    until = d.toISOString();
  }

  // Verify viewer is actually in the channel — RLS already protects but
  // be explicit so we can return a clear 403.
  const { data: viewerMembership } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerMembership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const { error } = await supabase
    .from("channel_member_mutes")
    .upsert(
      {
        channel_id: channelId,
        muter_id: user.id,
        muted_user_id: targetUserId,
        until,
      },
      { onConflict: "channel_id,muter_id,muted_user_id" },
    );

  if (error) {
    if (/channel_member_mutes|relation .* does not exist/i.test(error.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "Per-member mute is rolling out — try again in a minute." },
        { status: 503 },
      );
    }
    console.error("[channelMemberMute.POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, until });
}

/** Unmute (channel-scoped). Idempotent. */
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
  const { error } = await supabase
    .from("channel_member_mutes")
    .delete()
    .eq("channel_id", channelId)
    .eq("muter_id", user.id)
    .eq("muted_user_id", targetUserId);
  if (error) {
    console.error("[channelMemberMute.DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
