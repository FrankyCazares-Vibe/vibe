import { requirePlatformAdminPage } from "@/lib/auth/require-platform-admin";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { AdminOrgsClient, type AdminOrgRow } from "./admin-orgs-client";
import { AdminShell, type AdminTab } from "./admin-shell";
import { LogClient } from "./log-client";
import { ReportsClient } from "./reports-client";
import { UsersClient } from "./users-client";

export const metadata = {
  title: "Admin · Vibe",
  description: "Platform administration.",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The moderation desk. Reports first, because that is the queue someone is
 * here to work; clubs, users and the log behind it.
 *
 * THE GATE IS THE SHARED ONE. `requirePlatformAdminPage` sends a signed-out
 * admin to login with `next`, and answers `notFound()` for everyone else — the
 * same answer /the-map gives, and the same one every /api/admin route's 403
 * implies. This page used to run its own inline flag read and
 * `redirect("/campus")`, which quietly told a curious student the page exists.
 *
 * THE SERVER READS ONLY CLUBS. The reports, users and log tabs fetch their own
 * data from the admin API, which is deliberately narrow: GET /api/admin/users
 * selects `id, handle, name, school_verified, created_at` and returns no email
 * at all. A service-role `users` read here to "save a round trip" is exactly
 * how an address reaches the browser, so there isn't one.
 */
export default async function AdminPage({ searchParams }: Props) {
  const adminId = await requirePlatformAdminPage("/admin");

  const service = createSupabaseServiceClient();
  // The admin's OWN row, for the name in the header. Not a student's.
  const { data: me } = await service
    .from("users")
    .select("name, handle")
    .eq("id", adminId)
    .maybeSingle();
  const adminName = me?.name || me?.handle || "admin";

  const raw = (await searchParams).tab;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  const tab: AdminTab =
    asked === "clubs" || asked === "users" || asked === "log" ? asked : "reports";

  return (
    <AdminShell tab={tab} adminName={adminName}>
      {tab === "clubs" ? <AdminOrgsClient initialOrgs={await loadOrgs()} /> : null}
      {tab === "reports" ? <ReportsClient /> : null}
      {tab === "users" ? <UsersClient /> : null}
      {tab === "log" ? <LogClient /> : null}
    </AdminShell>
  );
}

/**
 * `hidden_at` rides along so the list can show a Hidden badge and an Unhide
 * button. It is the only place a club's hidden state is readable — `orgs_select`
 * has no admin exemption, so an ordinary client sees nothing — and the same
 * derivation GET /api/admin/orgs uses (`hidden: !!o.hidden_at`).
 */
async function loadOrgs(): Promise<AdminOrgRow[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, is_public, verified, hidden_at, last_activity_at, created_at, members:org_members(count)"
    )
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(500);

  const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;
  // Server-side dormancy comparison; intentional per-request evaluation.
  const now = Date.now();
  type Row = {
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    is_public: boolean;
    verified: boolean;
    hidden_at: string | null;
    last_activity_at: string | null;
    created_at: string;
    members?: Array<{ count: number }> | null;
  };
  return (data as Row[] | null ?? []).map((o) => {
    const { members, hidden_at, ...rest } = o;
    const lastMs = o.last_activity_at ? Date.parse(o.last_activity_at) : null;
    const dormant = !o.verified && lastMs !== null && now - lastMs > DORMANT_MS;
    return {
      ...rest,
      hidden: !!hidden_at,
      member_count: members?.[0]?.count ?? 0,
      dormant,
    };
  });
}
