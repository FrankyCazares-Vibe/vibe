import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  target_id?: unknown;
  handle?: unknown;
  /** Hours to mute for. Omit / null / 0 → forever. */
  duration_hours?: unknown;
};

const ALLOWED_HOURS: ReadonlySet<number> = new Set([1, 8, 24, 168]);

async function resolveTargetId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: Body,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    return { ok: true, id: body.target_id };
  }
  if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (!data?.id) return { ok: false, status: 404, error: "User not found" };
    return { ok: true, id: data.id as string };
  }
  return { ok: false, status: 400, error: "Missing target_id or handle" };
}

/**
 * Mute a user for a fixed duration (1h / 8h / 24h / 7d) or forever.
 * Idempotent — re-muting upserts the `until` timestamp.
 *
 * Mute hides the muted user's posts/notifications from the muter; the
 * muted user has no visibility into the mute state.
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
    return NextResponse.json({ ok: false, error: "Cannot mute yourself" }, { status: 400 });
  }

  let until: string | null = null;
  if (typeof body.duration_hours === "number" && body.duration_hours > 0) {
    if (!ALLOWED_HOURS.has(body.duration_hours)) {
      return NextResponse.json(
        { ok: false, error: "duration_hours must be one of 1, 8, 24, 168" },
        { status: 400 },
      );
    }
    until = new Date(Date.now() + body.duration_hours * 60 * 60 * 1000).toISOString();
  }

  // Upsert: if the row exists, update `until`; if not, insert.
  const { error } = await supabase
    .from("mutes")
    .upsert(
      { muter_id: user.id, muted_id: target.id, until },
      { onConflict: "muter_id,muted_id" },
    );

  if (error) {
    console.error("[mute.POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, until });
}

/** Unmute. Idempotent. */
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
    .from("mutes")
    .delete()
    .eq("muter_id", user.id)
    .eq("muted_id", target.id);

  if (error) {
    console.error("[mute.DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
