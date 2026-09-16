import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/orgs — list ALL orgs for the platform-admin dashboard.
 * Includes verified flag, member count, last activity, and computed dormant
 * status. Gated on `users.is_platform_admin = true`.
 *
 * HIDDEN ORGS STAY LISTED HERE, and only here (spec §3.4, §4.2). Hiding
 * removes an org from Discover, search, the map, event lists and suggestions
 * — /admin is the one screen that has to keep showing it, because /admin is
 * where it gets unhidden. Each row carries `hidden` (and `hidden_at`, the
 * moment it happened, which no other route returns) so the dashboard can
 * badge it and offer Hide / Unhide.
 *
 * `join_policy` and `audience` ride along so the dashboard says what an org
 * actually is — "Private" alone stopped being the whole story once an org
 * could be invite-only or open to one university.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();

  const { data: viewerRow } = await service
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewerRow?.is_platform_admin) {
    return NextResponse.json(
      { ok: false, error: "Platform admin only", code: "platform_admin_only" },
      { status: 403 }
    );
  }

  const { data, error } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, is_public, verified, last_activity_at, created_at, join_policy, audience, hidden_at, members:org_members(count)"
    )
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) {
    console.error("[admin/orgs GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load", code: "load_failed" },
      { status: 500 },
    );
  }

  type Row = {
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    is_public: boolean;
    verified: boolean;
    last_activity_at: string | null;
    created_at: string;
    join_policy: string | null;
    audience: string | null;
    hidden_at: string | null;
    members?: Array<{ count: number }> | null;
  };

  const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const orgs = (data as Row[] | null ?? []).map((o) => {
    const { members, ...rest } = o;
    const lastMs = o.last_activity_at ? Date.parse(o.last_activity_at) : null;
    const dormant = !o.verified && lastMs !== null && now - lastMs > DORMANT_MS;
    return {
      ...rest,
      join_policy: o.join_policy ?? "open",
      audience: o.audience ?? "both",
      hidden: !!o.hidden_at,
      member_count: members?.[0]?.count ?? 0,
      dormant,
    };
  });

  return NextResponse.json({ ok: true, orgs });
}
