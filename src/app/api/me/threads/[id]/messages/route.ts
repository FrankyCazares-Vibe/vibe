import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT = 4000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type SendBody = { content?: unknown };

type RouteCtx = { params: Promise<{ id: string }> };

async function ensureMember(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  channelId: string,
  userId: string,
): Promise<{ ok: true; accepted_at: string | null } | { ok: false; status: number }> {
  const { data, error } = await supabase
    .from("channel_members")
    .select("accepted_at")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[messages.ensureMember]", error);
    return { ok: false, status: 500 };
  }
  if (!data) return { ok: false, status: 403 };
  return { ok: true, accepted_at: (data.accepted_at as string | null) ?? null };
}

/**
 * GET: list messages in a channel, oldest-first.
 * `?before=<iso>` paginates older messages; `?limit=<n>` caps results.
 */
export async function GET(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));

  let q = supabase
    .from("messages")
    .select(
      "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)",
    )
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) {
    console.error("[messages.GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Return oldest-first so the UI can append straight to the bottom.
  const messages = (data ?? []).slice().reverse();
  return NextResponse.json({ ok: true, messages });
}

/**
 * POST: send a message in a channel.
 * If the sender's own row is still pending (request state), this reply
 * implicitly accepts the request.
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

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ ok: false, error: "Message too long" }, { status: 400 });
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("messages")
    .insert({ channel_id: channelId, user_id: user.id, content })
    .select(
      "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)",
    )
    .single();

  if (insErr || !inserted) {
    console.error("[messages.POST insert]", insErr);
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Implicit-accept: replying clears your own pending state.
  if (member.accepted_at === null) {
    const { error: accErr } = await supabase
      .from("channel_members")
      .update({ accepted_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);
    if (accErr) {
      console.error("[messages.POST implicit-accept]", accErr);
      // Non-fatal; the message went through.
    }
  }

  // Update viewer's last_read_at since they just saw the channel state.
  await supabase
    .from("channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, message: inserted });
}
