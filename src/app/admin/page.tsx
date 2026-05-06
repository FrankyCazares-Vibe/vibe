import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { AdminOrgsClient, type AdminOrgRow } from "./admin-orgs-client";

export const metadata = {
  title: "Admin · Vibe",
  description: "Platform administration.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/admin");

  const service = createSupabaseServiceClient();
  const { data: viewerRow } = await service
    .from("users")
    .select("is_platform_admin, name, handle")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewerRow?.is_platform_admin) {
    // Soft 404 for non-admins — don't expose the page exists.
    redirect("/campus");
  }

  const { data: orgsData } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, is_public, verified, last_activity_at, created_at, members:org_members(count)"
    )
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(500);

  const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;
  // Server-side dormancy comparison; intentional per-request evaluation.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
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
    members?: Array<{ count: number }> | null;
  };
  const orgs: AdminOrgRow[] = (orgsData as Row[] | null ?? []).map((o) => {
    const { members, ...rest } = o;
    const lastMs = o.last_activity_at ? Date.parse(o.last_activity_at) : null;
    const dormant = !o.verified && lastMs !== null && now - lastMs > DORMANT_MS;
    return {
      ...rest,
      member_count: members?.[0]?.count ?? 0,
      dormant,
    };
  });

  return (
    <AdminOrgsClient
      initialOrgs={orgs}
      adminName={viewerRow.name || viewerRow.handle || "admin"}
    />
  );
}
