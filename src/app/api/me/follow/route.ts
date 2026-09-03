import { NextResponse } from "next/server";

import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FollowBody = {
  target_id?: unknown;
  target_handle?: unknown;
};

async function resolveTargetId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: FollowBody,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  if (body.target_id !== undefined && body.target_id !== null && body.target_id !== "") {
    // Interpolated into a PostgREST `or=` filter for the block check, so it
    // must be a real UUID.
    if (!isUuid(body.target_id)) {
      return { ok: false, status: 400, error: "Invalid target_id" };
    }
    return { ok: true, id: body.target_id };
  }
  if (typeof body.target_handle === "string" && body.target_handle.length > 0) {
    const handle = body.target_handle.trim().toLowerCase();
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (error) {
      console.error("[follow.resolveTargetId]", error);
      return { ok: false, status: 500, error: "Lookup failed" };
    }
    if (!data?.id) return { ok: false, status: 404, error: "User not found" };
    return { ok: true, id: data.id as string };
  }
  return { ok: false, status: 400, error: "Missing target_id or target_handle" };
}

/** Follow a user (current → target). Idempotent — duplicate POSTs return 200. */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: FollowBody;
  try {
    body = (await req.json()) as FollowBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const target = await resolveTargetId(supabase, body);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }
  if (target.id === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot follow yourself" }, { status: 400 });
  }

  const rl = await rateLimit(`follow:${user.id}`, { limit: 60, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // A block in either direction ends the relationship; neither party may
  // re-follow until it is lifted. Same two-direction pattern as the profile
  // bootstrap route — `blocks` RLS lets either party read the row. Both ids
  // are trusted UUIDs (auth session / isUuid-validated / DB lookup).
  const { data: blockRows, error: blockErr } = await supabase
    .from("blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${target.id}),` +
        `and(blocker_id.eq.${target.id},blocked_id.eq.${user.id})`,
    )
    .limit(1);
  if (blockErr) {
    console.error("[follow.POST block-check]", blockErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if ((blockRows ?? []).length > 0) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 403 });
  }

  const { error } = await supabase
    .from("connections")
    .insert({ follower_id: user.id, following_id: target.id });

  if (error) {
    // Unique constraint violation = already following → idempotent success.
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[follow.POST]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Unfollow. Idempotent — deletes 0 rows is success. */
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: FollowBody;
  try {
    body = (await req.json()) as FollowBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const target = await resolveTargetId(supabase, body);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }

  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", target.id);

  if (error) {
    console.error("[follow.DELETE]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
