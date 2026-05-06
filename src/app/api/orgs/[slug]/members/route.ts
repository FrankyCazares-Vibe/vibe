import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/orgs/[slug]/members — list members with role + minimal profile.
 * Any member of the org can see the roster. Non-members get 403.
 *
 * Returns: [{ user_id, role, joined_at, name, handle, avatar_url, school_verified }]
 * sorted by role precedence (owner → admin → mod → member) then joined_at.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const service = createSupabaseServiceClient();
  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer) {
    return NextResponse.json({ ok: false, error: "Members only" }, { status: 403 });
  }

  const { data, error } = await service
    .from("org_members")
    .select(
      "user_id, role, joined_at, users:user_id(id, name, handle, avatar_url, school_verified)"
    )
    .eq("org_id", org.id);
  if (error) {
    console.error("[orgs/[slug]/members GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to load members" }, { status: 500 });
  }

  const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, mod: 2, member: 3 };
  const rows = (data || []).map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    return {
      user_id: r.user_id as string,
      role: r.role as string,
      joined_at: r.joined_at as string,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
    };
  });
  rows.sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 99;
    const rb = ROLE_RANK[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.joined_at || "").localeCompare(b.joined_at || "");
  });

  return NextResponse.json({ ok: true, members: rows });
}
