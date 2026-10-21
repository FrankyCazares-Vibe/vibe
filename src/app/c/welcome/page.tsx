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
 * /api/me/onboarding-complete): "Set up <club>?" with Make me the owner and
 * Not me (a setup link), or "Join <club>?" with Join and Not now (a members'
 * link). Asked, never done for them: the place on the link belongs to the
 * address that signed up, which may not be the person holding it now. Not me
 * gives that place back, so the person the link was made for can still use
 * it (a second give-back turns the link off); both no's go to Campus, with
 * the first-run tour. A refusal comes back in the route's own words.
 * Nothing waiting: Campus.
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
            {setup ? `Set up ${name}?` : `Join ${name}?`}
          </h1>
          {checked ? <CheckedBadge /> : null}
          <p className="vibe-auth-sub">
            {setup
              ? `You came in through ${name}'s setup link. If you run the club, one tap makes its page yours. If not, Not me keeps the link free for whoever it was made for.`
              : `You came in through ${name}'s link. Join to see its Board and events.`}
          </p>
        </div>
        <ClubLinkAction
          code={null}
          label={setup ? "Make me the owner" : `Join ${name}`}
          declineLabel={setup ? "Not me" : "Not now"}
        />
      </div>
    </div>
  );
}
