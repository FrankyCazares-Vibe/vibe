"use client";

/**
 * Club tools' first screen (the club's view, wave 2, C10; B_Board_Tools):
 * three groups of rows. Bring people in (Share the club, Invite members,
 * the members' link), People (join requests, members, followers, officers,
 * each with its exact count) and The club (Edit the page, past events,
 * Club settings). Each row opens its own page; Share and Invite act here.
 */
import { useState } from "react";

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

/** The club page's phone breakpoint (`admin-actions.tsx`): a sheet below it, a window above. */
const PHONE_QUERY = "(max-width: 720px)";

export function ToolsIndex({ club, counts, clubUrl }: { club: ToolsClub; counts: ToolsCounts; clubUrl: string }) {
  const [invite, setInvite] = useState<"sheet" | "modal" | null>(null);
  const clubPath = `/orgs/${encodeURIComponent(club.handle)}`;
  const tools = `${clubPath}/tools`;

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
      <ToolsHeader backHref={clubPath} backLabel={club.name} title="Club tools." sub={`${club.name} · only officers see this`} />

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
            onClick={() => setInvite(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal")}
          />
          {club.verified ? (
            <NavRow icon={<LinkIcon />} label="Members' link" href={`${clubPath}/setup#members-link`} />
          ) : null}
        </Group>
      )}

      <Group label="People">
        <NavRow
          icon={<InboxIcon />}
          label="Join requests"
          href={`${tools}/requests`}
          count={counts.requests}
          dot={(counts.requests ?? 0) > 0}
        />
        <NavRow icon={<PeopleIcon />} label="Members" href={`${tools}/members`} count={counts.members} />
        <NavRow icon={<EyeIcon />} label="Followers" href={`${tools}/followers`} count={counts.followers} />
        <NavRow icon={<CrownIcon />} label="Officers and titles" href={`${tools}/officers`} count={counts.officers} />
      </Group>

      <Group label="The club">
        <NavRow icon={<PencilIcon />} label="Edit the page" href={`${clubPath}?edit=1`} />
        <NavRow icon={<CalendarCheckIcon />} label="Past events and who came" href={`${clubPath}?tab=events`} />
        <NavRow
          icon={<SlidersIcon />}
          label="Club settings"
          href={`${tools}/settings`}
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
          onClose={() => setInvite(null)}
        />
      ) : null}
    </>
  );
}
