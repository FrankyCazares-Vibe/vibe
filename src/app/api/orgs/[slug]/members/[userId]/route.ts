import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; userId: string }> };
type PatchBody = { role?: unknown };

const VALID_ROLES = ["admin", "mod", "member"] as const;

async function requireStaff(slug: string, viewerId: string) {
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, owner_id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) return { error: "Not found", status: 404 } as const;

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", viewerId)
    .maybeSingle();
  const role = viewer?.role ?? null;
  if (!role || !["owner", "admin"].includes(role)) {
    return { error: "Admin only", status: 403 } as const;
  }
  return { org, viewerRole: role as "owner" | "admin", service } as const;
}

/**
 * PATCH /api/orgs/[slug]/members/[userId] — change a member's role.
 * Body: { role: 'admin' | 'mod' | 'member' }
 *
 * Permissions:
 *  - Admin/owner only.
 *  - Cannot change the owner's row (transfer-ownership flow not in v1).
 *  - Admins cannot demote/promote each other; only the owner can manage admins.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { ok: false, error: "Role must be admin, mod, or member" },
      { status: 400 }
    );
  }

  // Target row.
  const { data: target } = await guard.service
    .from("org_members")
    .select("role")
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { ok: false, error: "Owner role can't be changed here" },
      { status: 400 }
    );
  }
  if (target.role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can demote admins" },
      { status: 403 }
    );
  }
  if (role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can promote to admin" },
      { status: 403 }
    );
  }

  const { error } = await guard.service
    .from("org_members")
    .update({ role })
    .eq("org_id", guard.org.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[orgs/[slug]/members/[userId] PATCH]", error);
    return NextResponse.json({ ok: false, error: "Failed to update role" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/orgs/[slug]/members/[userId] — remove a member.
 * Permissions: admin/owner. Owner row is non-removable.
 * Admins cannot remove other admins (only owner can).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { data: target } = await guard.service
    .from("org_members")
    .select("role")
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { ok: false, error: "The owner can't be removed" },
      { status: 400 }
    );
  }
  if (target.role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can remove admins" },
      { status: 403 }
    );
  }

  const { error } = await guard.service
    .from("org_members")
    .delete()
    .eq("org_id", guard.org.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[orgs/[slug]/members/[userId] DELETE]", error);
    return NextResponse.json({ ok: false, error: "Failed to remove" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
