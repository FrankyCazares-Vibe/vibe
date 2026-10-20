import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KineticWordmark } from "@/components/brand/KineticWordmark";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { findClubLinkById, pendingClubLink } from "@/lib/club-links/store";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { ClubLinkAction } from "../club-link-action";
import { ClubTile, CheckedBadge } from "../club-link-parts";
import { clubInitials } from "../club-link-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your club · Vibe", robots: { index: false, follow: false } };

/**
 * Where a sign-up a club link let in lands when onboarding finishes (POST
 * /api/me/onboarding-complete), for a members' link: "Join <club>?" with Join
 * and Not now. A setup link's club is usually made before this page, so it
 * only shows here when making it failed: one button tries again, and the
 * route's words say why it can't. Nothing waiting: Campus.
 */
export default async function ClubLinkWelcomePage() {
  const { userId } = await enforceCampusAccess("/c/welcome");
  const service = createSupabaseServiceClient();
  const pending = await pendingClubLink(service, userId);
  if (!pending) redirect("/campus?welcome=1");
  const link = await findClubLinkById(service, pending.linkId);
  if (!link) redirect("/campus?welcome=1");

  let name = link.club_name ?? "your club";
  let logoUrl: string | null = null;
  let checked = link.checked;
  if (link.org_id) {
    const { data: org } = await service
      .from("orgs")
      .select("name, handle, logo_url, verified, hidden_at")
      .eq("id", link.org_id)
      .maybeSingle();
    if (!org || org.hidden_at) redirect("/campus?welcome=1");
    name = org.name;
    logoUrl = orgAssetProxyUrl(org.handle, org.logo_url, "logo");
    checked = org.verified === true;
  }

  const setup = link.kind === "setup";
  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand vibe-auth-brand--kinetic">
          <KineticWordmark dotClassName="vibe-auth-dot" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <ClubTile initials={clubInitials(name)} logoUrl={logoUrl} />
          <h1 className="vibe-auth-headline" style={{ overflowWrap: "anywhere" }}>
            {setup ? `Set up ${name}` : `Join ${name}?`}
          </h1>
          {checked ? <CheckedBadge /> : null}
          <p className="vibe-auth-sub">
            {setup
              ? "You're on Vibe. One more tap and the club's page is yours."
              : `You came in through ${name}'s link. Join to see its Board and events.`}
          </p>
        </div>
        <ClubLinkAction
          code={null}
          label={setup ? "Make me the owner" : `Join ${name}`}
          declineLabel={setup ? undefined : "Not now"}
        />
      </div>
    </div>
  );
}
