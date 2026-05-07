import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
type RsvpBody = { status?: unknown };

/**
 * Set or update the viewer's RSVP. `status` accepts 'going' | 'maybe' (UI
 * label: Interested). Pass null/missing or call DELETE to remove.
 *
 * Idempotent: posting the same status twice is fine. Posting a different
 * status overwrites.
 */
export async function PUT(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing event id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: RsvpBody;
  try {
    body = (await req.json()) as RsvpBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (status !== "going" && status !== "maybe") {
    return NextResponse.json(
      { ok: false, error: "status must be 'going' or 'maybe'" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { event_id: id, user_id: user.id, status },
      { onConflict: "event_id,user_id" },
    );

  if (error) {
    console.error("[events/:id/rsvp PUT]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Remove the viewer's RSVP. Idempotent — deleting zero rows is success. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing event id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("event_id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[events/:id/rsvp DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
