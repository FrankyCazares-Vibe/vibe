"use client";

/**
 * Club tools' first screen (the club's view, wave 2, C10; B_Board_Tools):
 * three groups of rows. Bring people in (Share the club, Invite members,
 * the members' link), People (join requests, members, followers, officers,
 * each with its exact count) and The club (Edit the page, past events,
 * Club settings). Each row opens its own page; Share and Invite act here.
 *
 * On a computer, in the club page's tools panel (ClubToolsPanel.tsx; Oct 22,
 * 2026), the host passes `onOpen`: there is no header of its own (the
 * panel's says where you are), and every row opens in place instead of
 * going to a page. Edit the page and Past events close the panel and act on
 * the club page under it.
 */
import { useRef, useState } from "react";

import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import { quietStyle } from "@/components/orgs/club-tool-styles";
import { copyText } from "@/lib/feedback/request";
import { nativeShare } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

import {
  CalendarCheckIcon,
  CrownIcon,
  EyeIcon,
  InboxIcon,
  LinkIcon,
  PencilIcon,
  PeopleIcon,
  PersonPlusIcon,
  ShareIcon,
  SlidersIcon,
} from "./icons";
import { Group, NavRow, ToolsHeader } from "./tools-ui";
import type { ToolsClub } from "./types";

/** Each null when its read failed: the row then shows no number, never a zero. */
export type ToolsCounts = {
  requests: number | null;
  members: number | null;
  followers: number | null;
  officers: number | null;
};

/** A row that opens in the computer's tools panel, rather than going to its page. */
export type ToolsIndexTarget =
  | "members_link"
  | "requests"
  | "members"
  | "followers"
  | "officers"
  | "edit"
  | "events"
  | "settings";

/** The club page's phone breakpoint (`admin-actions.tsx`): a sheet below it, a window above. */
const PHONE_QUERY = "(max-width: 720px)";

export function ToolsIndex({
  club,
  counts,
  clubUrl,
  onOpen,
}: {
  club: ToolsClub;
  counts: ToolsCounts;
  clubUrl: string;
  onOpen?: (target: ToolsIndexTarget) => void;
}) {
  const [invite, setInvite] = useState<"sheet" | "modal" | null>(null);
  // In the panel, focus goes back to Invite members when the window closes
  // (it hands none back itself, and the arc's dialog would lose it).
  const inviteFrom = useRef<HTMLElement | null>(null);
  const clubPath = `/orgs/${encodeURIComponent(club.handle)}`;
  const tools = `${clubPath}/tools`;
  // A row's way in: its page, or (in the panel) the host opening it in place.
  const go = (target: ToolsIndexTarget, href: string) => (onOpen ? { onClick: () => onOpen(target) } : { href });

  const share = async () => {
    const title = `${club.name} on Vibe`;
    // The store apps' own share sheet first (Android's web view has no
    // navigator.share), then the browser's, then Copy (MembersLinkPanel's order).
    if (appShellOnClient() !== null && (await nativeShare({ title, url: clubUrl }))) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: clubUrl });
        return;
      } catch (err) {
        // They closed the sheet: nothing to say.
        if ((err as { name?: unknown } | null)?.name === "AbortError") return;
      }
    }
    await copyText(clubUrl, { success: "Link copied." });
  };

  return (
    <>
      {onOpen ? null : (
        <ToolsHeader backHref={clubPath} backLabel={club.name} title="Club tools." sub={`${club.name} · only officers see this`} />
      )}

      {club.hidden ? (
        // A hidden club takes nobody new (the invite and join routes refuse it).
        <p style={{ ...quietStyle, margin: "0 2px 18px", fontSize: 13 }}>
          This club is hidden, so nobody new can join it.
        </p>
      ) : (
        <Group label="Bring people in">
          <NavRow icon={<ShareIcon />} label="Share the club" onClick={() => void share()} />
          <NavRow
            icon={<PersonPlusIcon />}
            label="Invite members"
            onClick={() => {
              inviteFrom.current = onOpen && document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setInvite(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal");
            }}
          />
          {club.verified ? (
            <NavRow icon={<LinkIcon />} label="Members' link" {...go("members_link", `${clubPath}/setup#members-link`)} />
          ) : null}
        </Group>
      )}

      <Group label="People">
        <NavRow
          icon={<InboxIcon />}
          label="Join requests"
          {...go("requests", `${tools}/requests`)}
          count={counts.requests}
          dot={(counts.requests ?? 0) > 0}
        />
        <NavRow icon={<PeopleIcon />} label="Members" {...go("members", `${tools}/members`)} count={counts.members} />
        <NavRow icon={<EyeIcon />} label="Followers" {...go("followers", `${tools}/followers`)} count={counts.followers} />
        <NavRow icon={<CrownIcon />} label="Officers and titles" {...go("officers", `${tools}/officers`)} count={counts.officers} />
      </Group>

      <Group label="The club">
        <NavRow icon={<PencilIcon />} label="Edit the page" {...go("edit", `${clubPath}?edit=1`)} />
        <NavRow icon={<CalendarCheckIcon />} label="Past events and who came" {...go("events", `${clubPath}?tab=events`)} />
        <NavRow
          icon={<SlidersIcon />}
          label="Club settings"
          {...go("settings", `${tools}/settings`)}
          note={club.role === "owner" ? "Board, delete" : "Board, leave"}
        />
      </Group>

      <p style={{ ...quietStyle, textAlign: "center", fontSize: 12.5 }}>
        The Board, Up next and check-in stay on the club&rsquo;s page.
      </p>

      {invite ? (
        <OrgInviteSheet
          handle={club.handle}
          orgName={club.name}
          audience={club.audience}
          presentation={invite}
          onClose={() => {
            setInvite(null);
            const back = inviteFrom.current;
            inviteFrom.current = null;
            if (back) window.requestAnimationFrame(() => back.isConnected && back.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </>
  );
}
