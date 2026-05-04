import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type FollowBody = {
  target_id?: unknown;
  target_handle?: unknown;
};

async function resolveTargetId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: FollowBody,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
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

  const { error } = await supabase
    .from("connections")
    .insert({ follower_id: user.id, following_id: target.id });

  if (error) {
    // Unique constraint violation = already following → idempotent success.
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[follow.POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
