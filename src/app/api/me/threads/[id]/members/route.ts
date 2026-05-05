import { NextResponse } from "next/server";

import { getFollowState } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = {
  handle?: unknown;
  target_id?: unknown;
};

/**
 * Add a member to a group chat. Group only. The inviter (viewer) must be
 * mutually connected with the target — matches the user's "you can't add
 * anyone you're not connected with" rule. Idempotent: re-adding an
 * existing member returns `{ already: true }`.
 */
export async function POST(req: Request, ctx: RouteCtx) {
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

  // Resolve target id from handle/id.
  let targetId: string | null = null;
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    targetId = body.target_id;
  } else if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (!u) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    targetId = u.id as string;
  } else {
    return NextResponse.json(
      { ok: false, error: "Missing target_id or handle" },
      { status: 400 },
    );
  }
  if (targetId === user.id) {
    return NextResponse.json({ ok: false, error: "Already a member" }, { status: 400 });
  }

  // Channel must be a group.
  const { data: chan } = await supabase
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!chan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (chan.type !== "group") {
    return NextResponse.json(
      { ok: false, error: "Members can only be added to group chats" },
      { status: 400 },
    );
  }

  // Inviter must be a member of the channel themselves.
  const { data: viewerMembership } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerMembership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  // Connected check: inviter and target must be mutually connected. Anything
  // less (one-way follow, none) blocks the add.
  const state = await getFollowState(supabase, user.id, targetId);
  if (state !== "connected") {
    return NextResponse.json(
      {
        ok: false,
        error: "You can only add people you're connected with",
        state,
      },
      { status: 403 },
    );
  }

  // Idempotent insert via service client (RLS blocks inserting another user's row).
  const admin = createSupabaseServiceClient();
  const { data: existing } = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", targetId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }
  const { error: insErr } = await admin.from("channel_members").insert({
    channel_id: channelId,
    user_id: targetId,
    role: "member",
    accepted_at: new Date().toISOString(),
  });
  if (insErr) {
    console.error("[threads.members.POST]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
