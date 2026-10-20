"use client";

/**
 * The setup list's screen (the club's view, wave 1): "Get <club> ready.", a
 * thin progress bar, six steps, and "Open <club>" once they're all done.
 * One centred column on every screen, theme tokens only (club-tool-styles).
 *
 * Every action ends in `router.refresh()`: the server page reads the list
 * again (`loadClubSetup`), so a dot fills only when the club's own data, or
 * the mark the route saved, says the step is done.
 *
 * A club no setup link made has no list (`setup` null): the page is then
 * its members' link alone.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { MembersLinkPanel } from "@/components/orgs/MembersLinkPanel";
import {
  columnStyle,
  eyebrowStyle,
  lineStyle,
  primaryButtonStyle,
  textActionStyle,
  titleStyle,
} from "@/components/orgs/club-tool-styles";
import type { SetupStep, SetupStepId } from "@/lib/club-links/setup-steps";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

import { SetupList } from "./SetupList";

export type SetupClub = {
  id: string;
  handle: string;
  name: string;
  /** Checked by Vibe: events and the members' link need it. */
  verified: boolean;
  hidden: boolean;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  hasLogo: boolean;
  hasBanner: boolean;
};

export type SetupView = { steps: SetupStep[]; done: number; total: number; complete: boolean };

/** The members' link panel's anchor (the officer bar's "Members' link" button). */
const LINK_HASH = "#members-link";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function SetupScreen({
  club,
  role,
  setup,
}: {
  club: SetupClub;
  role: "owner" | "admin";
  setup: SetupView | null;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  // The address's #members-link, read after hydration (the server has no
  // hash): it opens the members' link row and scrolls to it.
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const wantsLink = hash === LINK_HASH;
  // `undefined` until a row is tapped: the hash decides; after that, the tap.
  const [open, setOpen] = useState<SetupStepId | null | undefined>(undefined);
  const openStep: SetupStepId | null = open === undefined ? (wantsLink ? "members_link" : null) : open;

  useEffect(() => {
    if (!wantsLink) return;
    document.getElementById("members-link")?.scrollIntoView({ block: "start" });
  }, [wantsLink]);

  const clubPath = `/orgs/${encodeURIComponent(club.handle)}`;

  return (
    <div style={columnStyle}>
      <div style={eyebrowStyle}>{setup ? "Club setup" : "Club tools"}</div>
      {setup ? (
        <>
          <h1 style={titleStyle}>Get {club.name} ready.</h1>
          <Progress done={setup.done} total={setup.total} />
          <SetupList
            club={club}
            role={role}
            steps={setup.steps}
            openStep={openStep}
            onToggle={(id) => setOpen(openStep === id ? null : id)}
            onChanged={refresh}
          />
          {setup.complete ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
              <p style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 700, fontSize: 15 }}>All set.</p>
              <Link href={clubPath} className="vibe-press" style={primaryButtonStyle}>
                Open {club.name}
              </Link>
            </div>
          ) : (
            <p style={{ ...lineStyle, marginTop: 16, fontSize: 13, color: "var(--ink-muted)" }}>
              When it&rsquo;s done, this becomes the club&rsquo;s home.
            </p>
          )}
        </>
      ) : (
        <>
          <h1 style={titleStyle}>{club.name}&rsquo;s members&rsquo; link</h1>
          <div style={{ marginTop: 20 }}>
            <MembersLinkPanel handle={club.handle} clubName={club.name} />
          </div>
        </>
      )}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        <Link href={clubPath} style={textActionStyle}>
          Open the club page
        </Link>
      </div>
    </div>
  );
}

/** The thin coral bar under the title: done of total. */
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 14 }}>
      <div
        role="progressbar"
        aria-label="Setup"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} done`}
        style={{ height: 4, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.09)", overflow: "hidden" }}
      >
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--coral)", transition: "width 300ms ease" }} />
      </div>
      <p style={{ ...lineStyle, marginTop: 8, fontSize: 12.5, color: "var(--ink-muted)" }}>
        {done} of {total} done
      </p>
    </div>
  );
}
