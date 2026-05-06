import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type Body = { message?: unknown };

/**
 * POST /api/orgs/[slug]/join
 *
 * Public org → inserts an org_members row with role='member'. Idempotent: if
 * the viewer is already a member, returns the existing role.
 *
 * Private org → inserts an org_join_requests row with status='pending' and
 * an optional `message`. The unique partial index prevents duplicate pending
 * requests for the same (org, user). Returns { pending: true } so the UI can
 * render "Request sent" state.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* allow empty body */
  }

  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id, is_public")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/join load org]", orgErr);
    return NextResponse.json({ ok: false, error: "Failed to load org" }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const service = createSupabaseServiceClient();

  // Already a member? Return existing role — idempotent.
  const { data: existing } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, joined: true, role: existing.role });
  }

  if (org.is_public) {
    const { error } = await service.from("org_members").insert({
      org_id: org.id,
      user_id: user.id,
      role: "member",
    });
    if (error) {
      console.error("[orgs/[slug]/join public insert]", error);
      return NextResponse.json({ ok: false, error: "Failed to join" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, joined: true, role: "member" });
  }

  // Private — file a join request. The partial unique index on
  // (org_id, user_id) WHERE status='pending' prevents duplicates.
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 500) : null;

  const { data: pendingExisting } = await service
    .from("org_join_requests")
    .select("id, status, requested_at")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingExisting) {
    return NextResponse.json({ ok: true, pending: true, request: pendingExisting });
  }

  const { data: created, error: reqErr } = await service
    .from("org_join_requests")
    .insert({
      org_id: org.id,
      user_id: user.id,
      message,
    })
    .select("id, status, requested_at")
    .single();
  if (reqErr || !created) {
    console.error("[orgs/[slug]/join request insert]", reqErr);
    return NextResponse.json({ ok: false, error: "Failed to request join" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pending: true, request: created });
}

/**
 * DELETE /api/orgs/[slug]/join — self-leave the org. Owners cannot leave
 * (must transfer ownership first); blocked here for a friendly error.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id, owner_id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (org.owner_id === user.id) {
    return NextResponse.json(
      { ok: false, error: "Owners must transfer ownership before leaving" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", org.id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[orgs/[slug]/join DELETE]", error);
    return NextResponse.json({ ok: false, error: "Failed to leave" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
