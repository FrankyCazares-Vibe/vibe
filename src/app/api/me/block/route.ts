import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  target_id?: unknown;
  handle?: unknown;
};

/**
 * List the users the viewer has blocked. Powers the "Blocked users"
 * section on /settings — newest block first.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[block.GET list]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (rows ?? []).map((r) => (r as { blocked_id: string }).blocked_id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, users: [] });
  }

  const { data: profiles } = await supabase
    .from("users")
    .select("id, name, handle, avatar_url, major, year")
    .in("id", ids);
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of profiles ?? []) {
    byId.set((p as { id: string }).id, p as Record<string, unknown>);
  }

  // Preserve newest-first order from the blocks query.
  const blockedAtById = new Map<string, string>();
  for (const r of rows ?? []) {
    const row = r as { blocked_id: string; created_at: string };
    blockedAtById.set(row.blocked_id, row.created_at);
  }
  const users = ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return {
        id,
        name: (p.name as string | null) ?? null,
        handle: (p.handle as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        major: (p.major as string | null) ?? null,
        year: (p.year as number | null) ?? null,
        blocked_at: blockedAtById.get(id) ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ ok: true, users });
}

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
