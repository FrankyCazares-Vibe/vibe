"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type JSX, type ReactNode, type RefObject } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest, type VibeResult } from "@/lib/feedback/request";
import { ORG_COPY, WHO_CAN_JOIN_OPTIONS, openToOptions } from "@/lib/orgs/join-copy";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

import {
  arcTool,
  memberPreview,
  membersSub,
  officerLines,
  type ArcCounts,
  type ArcMember,
} from "./club-tools-arc";
import type { PanelEntry } from "./club-tools-panel";
import { ARC_ICON, ArcCardFrame, ArcGlyph, ArcNote, ArcPageLink, ArcPersonRow, ArcRise, ArcSkeleton, metaStyle, nameStyle } from "./ClubToolsLauncherParts";
import { shareClubPage } from "./share-page";

/**
 * The Arc's quieter cards (Oct 22, 2026; ClubToolsLauncher.tsx): Invite and
 * share, Members, Officers and titles, Past events and Club settings. Each
 * shows what the tool is about from real reads or the club's own settings,
 * and ends with the way to the tool's whole page. Join requests and
 * Followers, which act on people, have their own files.
 *
 * Since Oct 22, 2026 that way opens the tool in place when the launcher can
 * (`onPanel`): the planet grows into the tools panel (ClubToolsPanel.tsx)
 * and the whole page stays a cmd-click away. Past events still goes to the
 * club page's Events tab, which is the page under the arc.
 */

/** The club and who is looking, as the page passes them in. */
export type ArcClub = {
  handle: string;
  orgId: string;
  name: string;
  verified: boolean;
  hidden: boolean;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  /** The viewer, so a card can say "you". Null when the page didn't say. */
  viewerId: string | null;
};

/** What every card gets from the launcher. */
export type ArcCardProps = {
  club: ArcClub;
  counts: ArcCounts;
  /** × or Escape: the card goes, the arc stays. */
  onClose: () => void;
  /** A link out of the launcher was followed: it closes. */
  onLeave: (href: string) => void;
  /** Opens a tool in the panel, in place; absent, the links go to the tool's page. */
  onPanel?: (entry: PanelEntry) => void;
};

/** The footer link's in-place opener for a screen, when the launcher has a panel. */
export function panelOpener(onPanel: ArcCardProps["onPanel"], entry: PanelEntry): (() => void) | undefined {
  return onPanel ? () => onPanel(entry) : undefined;
}

/** One read of the roster per opening, shared by Members and Officers (cleared when the arc opens again). */
export type RosterRead = Promise<VibeResult<{ members?: ArcMember[] }>>;
export type RosterCache = RefObject<RosterRead | null>;

const ROSTER_LINE = "Couldn't load members.";

/** The roster, read once per opening (`cacheRef`), for the Members and Officers cards and the panel's All Club tools. */
export function useRoster(handle: string, cacheRef: RosterCache): { rows: ArcMember[] | null; failure: LoadFailure | null; retry: () => void } {
  const [state, setState] = useState<{ rows: ArcMember[] | null; failure: LoadFailure | null }>({ rows: null, failure: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const read =
      cacheRef.current ??
      vibeRequest<{ members?: ArcMember[] }>(`/api/orgs/${encodeURIComponent(handle)}/members`, {
        cache: "no-store",
        quiet: true,
        failure: ROSTER_LINE,
      });
    cacheRef.current = read;
    void read.then((r) => {
      const good = r.ok && Array.isArray(r.data.members);
      // A failed read isn't kept, even when no card is left to show it (the
      // card closed while it ran): Retry, or the next card, asks again.
      if (!good && cacheRef.current === read) cacheRef.current = null;
      if (!live) return;
      if (r.ok && good) {
        setState({ rows: r.data.members ?? [], failure: null });
        return;
      }
      setState({ rows: null, failure: asLoadFailure(r, ROSTER_LINE) });
    });
    return () => {
      live = false;
    };
  }, [handle, cacheRef, tick]);
  return {
    ...state,
    retry: () => {
      setState({ rows: null, failure: null });
      setTick((t) => t + 1);
    },
  };
}

const toolsPath = (handle: string, page = "") => `/orgs/${encodeURIComponent(handle)}/tools${page ? `/${page}` : ""}`;

export function MembersCard({ club, counts, onClose, onLeave, onPanel, rosterRef }: ArcCardProps & { rosterRef: RosterCache }): JSX.Element {
  const { rows, failure, retry } = useRoster(club.handle, rosterRef);
  let body: ReactNode;
  if (failure) body = <LoadFailed failure={failure} tone="dark" compact onRetry={retry} />;
  else if (!rows) body = <ArcSkeleton rows={4} />;
  else if (rows.length === 0) body = <ArcNote>No members yet.</ArcNote>;
  else body = memberPreview(rows, club.viewerId, 5).map((p, i) => <ArcPersonRow key={p.id} person={p} index={i} />);
  return (
    <ArcCardFrame
      tool={arcTool("members")}
      title="Members"
      sub={membersSub(counts.members ?? rows?.length ?? null)}
      onClose={onClose}
      footer={
        <ArcPageLink
          href={toolsPath(club.handle, "members")}
          label="See all members"
          onLeave={onLeave}
          onOpen={panelOpener(onPanel, { screen: "members" })}
        />
      }
    >
      {body}
    </ArcCardFrame>
  );
}

export function OfficersCard({ club, onClose, onLeave, onPanel, rosterRef }: ArcCardProps & { rosterRef: RosterCache }): JSX.Element {
  const { rows, failure, retry } = useRoster(club.handle, rosterRef);
  let body: ReactNode;
  if (failure) body = <LoadFailed failure={failure} tone="dark" compact onRetry={retry} />;
  else if (!rows) body = <ArcSkeleton rows={3} />;
  else body = officerLines(rows, club.viewerId).map((p, i) => <ArcPersonRow key={p.id} person={p} index={i} />);
  return (
    <ArcCardFrame
      tool={arcTool("officers")}
      title="Officers and titles"
      sub="Who runs the club"
      onClose={onClose}
      footer={
        <ArcPageLink
          href={toolsPath(club.handle, "officers")}
          label="Change roles and titles"
          onLeave={onLeave}
          onOpen={panelOpener(onPanel, { screen: "officers" })}
        />
      }
    >
      {body}
    </ArcCardFrame>
  );
}

export function EventsCard({ club, onClose, onLeave }: ArcCardProps): JSX.Element {
  const href = `/orgs/${encodeURIComponent(club.handle)}?tab=events`;
  return (
    <ArcCardFrame
      tool={arcTool("events")}
      title="Past events"
      sub="And who came to each"
      onClose={onClose}
      footer={<ArcPageLink href={href} label="Open past events and who came" onLeave={onLeave} />}
    >
      <ArcRise index={1}>
        <ArcNote>
          Every event {club.name} has held is on the club page&rsquo;s Events tab, with who checked in at the door.
        </ArcNote>
      </ArcRise>
    </ArcCardFrame>
  );
}

/** Who can join and who it's open to, in Edit page's own words (join-copy.ts). */
export function SettingsCard({ club, onClose, onLeave, onPanel }: ArcCardProps): JSX.Element {
  const policy = WHO_CAN_JOIN_OPTIONS.find((o) => o.value === club.joinPolicy);
  const openTo = openToOptions(null).find((o) => o.value === club.audience);
  const rows: { icon: string; name: string; meta: string }[] = [
    { icon: ARC_ICON.lock, name: "Who can join", meta: policy ? `${policy.label}: ${policy.sub.toLowerCase()}` : "Not set" },
    { icon: ARC_ICON.campus, name: "Open to", meta: openTo?.label ?? "IU and Purdue students" },
  ];
  if (club.hidden) rows.push({ icon: ARC_ICON.eye, name: "Hidden", meta: ORG_COPY.subs.hidden });
  rows.push({ icon: ARC_ICON.exit, name: "Leave or delete the club", meta: "In Club settings" });
  return (
    <ArcCardFrame
      tool={arcTool("settings")}
      title="Club settings"
      sub="Only officers can change these"
      onClose={onClose}
      footer={
        <ArcPageLink
          href={toolsPath(club.handle, "settings")}
          label="Open Club settings"
          onLeave={onLeave}
          onOpen={panelOpener(onPanel, { screen: "settings" })}
        />
      }
    >
      {rows.map((r, i) => (
        <ArcRise key={r.name} index={i + 1}>
          <ThingLine icon={r.icon} name={r.name} meta={r.meta} />
        </ArcRise>
      ))}
    </ArcCardFrame>
  );
}

/**
 * Bring people in: share the page, invite in Vibe (the Invite people sheet,
 * over the arc: `onInvite`), and the members' link for a verified club. A
 * hidden club takes nobody new, so it says that instead (ToolsIndex.tsx).
 */
export function InviteCard({ club, onClose, onLeave, onPanel, onInvite }: ArcCardProps & { onInvite: () => void }): JSX.Element {
  const h = encodeURIComponent(club.handle);
  return (
    <ArcCardFrame
      tool={arcTool("invite")}
      title="Invite and share"
      sub="Bring people in"
      onClose={onClose}
      footer={
        <ArcPageLink href={toolsPath(club.handle)} label="All Club tools" onLeave={onLeave} onOpen={panelOpener(onPanel, { screen: "index" })} />
      }
    >
      {club.hidden ? (
        <ArcRise index={1}>
          <ArcNote>This club is hidden, so nobody new can join it.</ArcNote>
        </ArcRise>
      ) : (
        <>
          <ArcRise index={1}>
            <button
              type="button"
              className="vibe-arc-row"
              onClick={() => void shareClubPage({ handle: club.handle, name: club.name })}
              style={thingButtonStyle}
            >
              <ThingLine icon={ARC_ICON.share} name="Share the club page" meta="Copy the link or send it" />
            </button>
          </ArcRise>
          <ArcRise index={2}>
            <button type="button" className="vibe-arc-row" aria-haspopup="dialog" data-arc-invite="" onClick={onInvite} style={thingButtonStyle}>
              <ThingLine icon={ARC_ICON.requests} name="Invite members" meta="Send an invite in Vibe" />
            </button>
          </ArcRise>
          {club.verified ? (
            <ArcRise index={3}>
              <Link
                href={`/orgs/${h}/setup#members-link`}
                className="vibe-arc-row"
                onNavigate={(e) => {
                  if (onPanel) {
                    e.preventDefault();
                    onPanel({ screen: "setup", step: "members_link" });
                  } else onLeave(`/orgs/${h}/setup`);
                }}
                style={thingButtonStyle}
              >
                <ThingLine icon={ARC_ICON.link} name="Members' link" meta="A link that lets people join" />
              </Link>
            </ArcRise>
          ) : null}
        </>
      )}
    </ArcCardFrame>
  );
}

/** A setting or an action in a card: a round glyph, a name, a grey line. */
function ThingLine({ icon, name, meta }: { icon: string; name: string; meta: string }): JSX.Element {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, width: "100%" }}>
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.08)",
          color: "var(--charcoal)",
        }}
      >
        <ArcGlyph d={icon} size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={nameStyle}>{name}</span>
        <span style={{ ...metaStyle, whiteSpace: "normal" }}>{meta}</span>
      </span>
    </span>
  );
}

const thingButtonStyle: CSSProperties = {
  display: "flex",
  width: "calc(100% + 20px)",
  boxSizing: "border-box",
  margin: "0 -10px",
  padding: "4px 10px",
  border: "none",
  borderRadius: 14,
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
