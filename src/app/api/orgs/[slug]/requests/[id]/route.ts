import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; id: string }> };
type Body = { action?: unknown };

/**
 * POST /api/orgs/[slug]/requests/[id] — approve or deny a pending join request.
 * Body: { action: 'approve' | 'deny' }
 * Permissions: org owner/admin/mod.
 *
 * On approve: inserts an org_members row (role='member'), flips the request
 * to status='approved'. On deny: flips status='denied'. Both record
 * resolved_by + resolved_at.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug, id: requestId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action === "approve" || body.action === "deny" ? body.action : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action must be 'approve' or 'deny'" },
      { status: 400 }
    );
  }

  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer || !["owner", "admin", "mod"].includes(viewer.role)) {
    return NextResponse.json({ ok: false, error: "Staff only" }, { status: 403 });
  }

  const { data: reqRow } = await service
    .from("org_join_requests")
    .select("id, user_id, org_id, status")
    .eq("id", requestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!reqRow) {
    return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });
  }
  if (reqRow.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "Request already resolved" },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  if (action === "approve") {
    // Idempotent member insert — if they're somehow already a member, skip.
    const { data: existing } = await service
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", reqRow.user_id)
      .maybeSingle();
    if (!existing) {
      const { error: memErr } = await service.from("org_members").insert({
        org_id: org.id,
        user_id: reqRow.user_id,
        role: "member",
      });
      if (memErr) {
        console.error("[requests/[id] POST insert member]", memErr);
        return NextResponse.json(
          { ok: false, error: "Failed to add member" },
          { status: 500 }
        );
      }
    }
  }

  const { error: updErr } = await service
    .from("org_join_requests")
    .update({
      status: action === "approve" ? "approved" : "denied",
      resolved_at: nowIso,
      resolved_by: user.id,
    })
    .eq("id", requestId);
  if (updErr) {
    console.error("[requests/[id] POST update status]", updErr);
    return NextResponse.json(
      { ok: false, error: "Failed to update request" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
