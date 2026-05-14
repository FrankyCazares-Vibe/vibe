import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Marks a suggested-connection target as dismissed by the viewer so
 * they stop showing up on Discover. Idempotent — re-dismissing the
 * same target is a no-op (UPSERT on the composite PK).
 *
 * Accepts either target_id (uuid) OR target_handle (resolves via a
 * single users lookup). target_id wins if both are provided.
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

  let body: { target_id?: unknown; target_handle?: unknown };
  try {
    body = (await req.json()) as { target_id?: unknown; target_handle?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let targetId: string | null = null;
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    targetId = body.target_id;
  } else if (typeof body.target_handle === "string" && body.target_handle.length > 0) {
    const handle = body.target_handle.trim().toLowerCase().replace(/^@/, "");
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    targetId = (data as { id: string } | null)?.id ?? null;
  }

  if (!targetId) {
    return NextResponse.json(
      { ok: false, error: "Missing target_id or target_handle" },
      { status: 400 },
    );
  }
  if (targetId === user.id) {
    return NextResponse.json(
      { ok: false, error: "Cannot dismiss yourself" },
      { status: 400 },
    );
  }

  // UPSERT — same composite PK from the migration means a dup just
  // bumps no rows. Don't surface that as an error to the client.
  const { error } = await supabase
    .from("suggestion_dismissals")
    .upsert(
      { user_id: user.id, target_id: targetId },
      { onConflict: "user_id,target_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[dismiss-suggestion]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
