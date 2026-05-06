import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  target_id?: unknown;
  handle?: unknown;
};

async function resolveTargetId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: Body,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    return { ok: true, id: body.target_id };
  }
  if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (error) {
      console.error("[block.resolveTargetId]", error);
      return { ok: false, status: 500, error: "Lookup failed" };
    }
    if (!data?.id) return { ok: false, status: 404, error: "User not found" };
    return { ok: true, id: data.id as string };
  }
  return { ok: false, status: 400, error: "Missing target_id or handle" };
}

/**
 * Block a user. Mutual-hide: neither party sees the other's content,
 * messages between them are rejected at the API layer. Idempotent.
 *
 * Side effect: any 1:1 DM channel between viewer and target is hidden
 * from the viewer's thread list (channel_members.hidden_at = now()) so
 * the chat disappears from view immediately. Same flag the soft-delete
 * uses; the row stays in the DB so the unblock can re-surface state.
 */
export async function POST(req: Request) {
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

  const target = await resolveTargetId(supabase, body);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }
  if (target.id === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot block yourself" }, { status: 400 });
  }

  const { error: insErr } = await supabase
    .from("blocks")
    .insert({ blocker_id: user.id, blocked_id: target.id });

  if (insErr) {
    if (/duplicate key|unique constraint/i.test(insErr.message ?? "")) {
      // Already blocked — idempotent success.
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[block.POST]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  // Hide any existing 1:1 DM channels between viewer and target on the
  // viewer's side (the row stays — soft-delete pattern).
  try {
    const { data: viewerDms } = await supabase
      .from("channel_members")
      .select("channel_id, channels!inner(type)")
      .eq("user_id", user.id)
      .eq("channels.type", "dm");
    const ids = (viewerDms ?? []).map((r) => r.channel_id as string);
    if (ids.length > 0) {
      const { data: shared } = await supabase
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", target.id)
        .in("channel_id", ids);
      const sharedIds = (shared ?? []).map((s) => s.channel_id as string);
      if (sharedIds.length > 0) {
        await supabase
          .from("channel_members")
          .update({ hidden_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .in("channel_id", sharedIds);
      }
    }
  } catch (e) {
    console.error("[block.POST hide-dm]", e);
    // Non-fatal; the block row went in.
  }

  return NextResponse.json({ ok: true });
}

/** Unblock. Idempotent — deleting 0 rows is success. */
export async function DELETE(req: Request) {
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

  const target = await resolveTargetId(supabase, body);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", target.id);

  if (error) {
    console.error("[block.DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
