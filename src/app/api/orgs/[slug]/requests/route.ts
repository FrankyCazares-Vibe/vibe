import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/orgs/[slug]/requests — list pending join requests for staff
 * (owner/admin/mod) of a private org. Includes the requesting user's profile.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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

  const { data, error } = await service
    .from("org_join_requests")
    .select(
      "id, user_id, status, message, requested_at, users:user_id(id, name, handle, avatar_url, school_verified)"
    )
    .eq("org_id", org.id)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) {
    console.error("[orgs/[slug]/requests GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to load requests" }, { status: 500 });
  }

  const requests = (data || []).map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      status: r.status as string,
      message: r.message as string | null,
      requested_at: r.requested_at as string,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
    };
  });

  return NextResponse.json({ ok: true, requests });
}
