import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { columnStyle, pageStyle } from "@/components/orgs/club-tool-styles";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { clubSetupPath } from "@/lib/club-links/redeem";
import { loadClubSetup } from "@/lib/club-links/setup";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { SETTINGS_ROLES, isJoinPolicy, isOrgAudience, isOrgRole } from "@/lib/orgs/join-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { ClubAppFrame } from "../club-frame";
import { SetupScreen, type SetupClub } from "./SetupScreen";

/**
 * `/orgs/<handle>/setup`: a new club's setup list, "Get <club> ready." (the
 * club's view, wave 1; the R2_Setup board, column 4). Where a president
 * lands after their setup link made the club, and where the owner and
 * officers come back to until it's done. Six steps: photo and cover, one
 * line, who can join, officers, the first event, the members' link.
 *
 * Only a club a setup link made has the list (`loadClubSetup` answers null
 * for any other): officers of an older checked club still use this page for
 * their members' link, so it then shows that panel alone.
 *
 * Signed-in only. The owner and officers only: a hidden club is a 404 to
 * anyone outside it (as the club page is), and a member or a visitor goes
 * to the club page. On a computer it sits in the app frame (club-frame.tsx).
 */
export const metadata: Metadata = {
  title: "Set up your club · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

/** The page's frame when the club couldn't be read: the line and a Retry (a reload). */
function Failed() {
  return (
    <ClubAppFrame>
      <main className="vibe-tabbar-page" style={pageStyle}>
        <div style={columnStyle}>
          <LoadFailed failure={{ message: "Couldn't load your club. Try again." }} />
        </div>
        <MobileTabBar />
      </main>
    </ClubAppFrame>
  );
}

export default async function ClubSetupPage({ params }: Props) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle.toLowerCase();
  const { userId } = await enforceCampusAccess(clubSetupPath(handle));

  const service = createSupabaseServiceClient();
  const { data: org, error } = await service
    .from("orgs")
    .select("id, handle, name, description, logo_url, banner_url, verified, join_policy, audience, hidden_at")
    .eq("handle", handle)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[handle]/setup] club read", error.code);
    return <Failed />;
  }
  if (!org) notFound();

  const { data: me, error: meErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (meErr) {
    console.error("[orgs/[handle]/setup] role read", meErr.code);
    return <Failed />;
  }
  const role = isOrgRole(me?.role) ? me.role : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role, allowed: SETTINGS_ROLES });
  if (gate === "not_found") notFound();
  if (gate === "forbidden" || (role !== "owner" && role !== "admin")) {
    redirect(`/orgs/${encodeURIComponent(org.handle as string)}`);
  }

  const setup = await loadClubSetup(service, {
    id: org.id as string,
    logo_url: (org.logo_url as string | null) ?? null,
    banner_url: (org.banner_url as string | null) ?? null,
    description: (org.description as string | null) ?? null,
  });

  const club: SetupClub = {
    id: org.id as string,
    handle: org.handle as string,
    name: (org.name as string | null) || (org.handle as string),
    verified: org.verified === true,
    hidden: !!org.hidden_at,
    joinPolicy: isJoinPolicy(org.join_policy) ? org.join_policy : "request",
    audience: isOrgAudience(org.audience) ? org.audience : "both",
    hasLogo: !!org.logo_url,
    hasBanner: !!org.banner_url,
  };

  return (
    <ClubAppFrame>
      <main className="vibe-tabbar-page" style={pageStyle}>
        <SetupScreen
          club={club}
          role={role}
          setup={setup ? { steps: setup.steps, done: setup.done, total: setup.total, complete: setup.complete } : null}
        />
        {/* Inside <main>, so `.vibe-tabbar-page:has([aria-modal])` hides the
            bar while one of this page's inline dialogs is open. */}
        <MobileTabBar />
      </main>
    </ClubAppFrame>
  );
}
