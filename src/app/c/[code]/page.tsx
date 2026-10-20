import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KineticWordmark } from "@/components/brand/KineticWordmark";
import { CookieNotice } from "@/components/legal/CookieNotice";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { clubLinkPath } from "@/lib/club-links/code";
import { clubSetupPath } from "@/lib/club-links/redeem";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isSignupOpen } from "@/lib/waitlist/signup-open";

import { SignupForm } from "../../auth/signup/signup-form";
import { ClubLinkAction } from "../club-link-action";
import { ClubLinkHeader, ClubTile, CheckedBadge, LinkGone } from "../club-link-parts";
import { clubInitials, loadClubLinkView } from "../club-link-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * A club link (the club's view, wave 1): `/c/<code>`, from a founder's setup
 * link (QR, handed over in person) or a club's members' link.
 *
 * - Signed out: the sign-up form under the club's name. The code rides along
 *   for the sign-up gate, which lets a school address in through a live link
 *   while sign-up is closed; when onboarding finishes, the club is made (setup)
 *   or the person is asked to join it (members). "Already on Vibe? Sign in"
 *   comes back here.
 * - Signed in: one button, "Make me the owner" or "Join <club>", once the
 *   account has finished setting up (enforceCampusAccess sends it through its
 *   steps and back).
 * - A link that no longer works says so, and why, and never which account
 *   used it.
 *
 * Opening the page uses nothing up: a place on the link is only taken by a
 * sign-up or a button.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const view = await loadClubLinkView(code);
  // A members' link is made to be shared, so its preview names the club. A
  // setup link's doesn't: it is handed to one person.
  const title =
    view?.link.kind === "members" && view.state === "live" ? `Join ${view.club.name} on Vibe` : "A club on Vibe";
  return {
    title,
    description: "Vibe is the social app for your campus, built around its clubs.",
    robots: { index: false, follow: false },
  };
}

export default async function ClubLinkPage({ params }: Props) {
  const { code: raw } = await params;
  const view = await loadClubLinkView(raw);
  if (!view) {
    return <LinkGone title="This link doesn't work" body="Check that you have the whole link, or ask whoever shared it for a new one." />;
  }
  const { code, link, state, club } = view;
  const path = clubLinkPath(code);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Terms, the school email, onboarding: an account that hasn't finished
    // goes through its steps and comes back to this page.
    await enforceCampusAccess(path);
    const service = createSupabaseServiceClient();

    if (link.kind === "setup" && link.used_by === user.id && club.handle) {
      redirect(clubSetupPath(club.handle));
    }
    if (link.kind === "members" && club.handle) {
      const { data: member } = await service
        .from("org_members")
        .select("role")
        .eq("org_id", link.org_id ?? "")
        .eq("user_id", user.id)
        .maybeSingle();
      if (member) redirect(`/orgs/${encodeURIComponent(club.handle)}`);
    }
    if (state !== "live") return <Gone state={state} kind={link.kind} />;

    return (
      <div className="vibe-auth-page">
        <div className="vibe-auth-card">
          <div className="vibe-auth-brand vibe-auth-brand--kinetic">
            <KineticWordmark dotClassName="vibe-auth-dot" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <ClubTile initials={clubInitials(club.name)} logoUrl={club.logoUrl} />
            <h1 className="vibe-auth-headline" style={{ overflowWrap: "anywhere" }}>
              {link.kind === "setup" ? `Set up ${club.name}` : `Join ${club.name}`}
              <span className="vibe-auth-dot">.</span>
            </h1>
            {club.checked ? <CheckedBadge /> : null}
            <p className="vibe-auth-sub">
              {link.kind === "setup"
                ? "You'll own the club's page and add your officers next. The link works once."
                : `The club's officers shared this link. You'll be a member of ${club.name}, and its Board and events show up for you.`}
            </p>
          </div>
          <ClubLinkAction code={code} label={link.kind === "setup" ? "Make me the owner" : `Join ${club.name}`} />
        </div>
      </div>
    );
  }

  if (state !== "live") return <Gone state={state} kind={link.kind} />;

  return (
    <>
      <SignupForm
        signupOpen={await isSignupOpen(null)}
        initialAccessCode=""
        probe={false}
        club={{ code, kind: link.kind, name: club.name }}
        signInHref={`/auth/login?next=${encodeURIComponent(path)}`}
        header={
          <ClubLinkHeader
            kind={link.kind}
            name={club.name}
            initials={clubInitials(club.name)}
            logoUrl={club.logoUrl}
            checked={club.checked}
            signInHref={`/auth/login?next=${encodeURIComponent(path)}`}
          />
        }
      />
      <CookieNotice />
    </>
  );
}

function Gone({ state, kind }: { state: string; kind: "setup" | "members" }) {
  if (state === "used") {
    return <LinkGone title="This setup link has been used" body="It works once, and its club is set up. If that wasn't you, ask Vibe for a new link." />;
  }
  if (state === "expired") {
    return (
      <LinkGone
        title="This link has ended"
        body={kind === "setup" ? "Setup links work for 7 days. Ask Vibe for a new one." : "Ask the club for a new way in."}
      />
    );
  }
  return <LinkGone title="This link is turned off" body="Ask whoever shared it for a new one." />;
}
