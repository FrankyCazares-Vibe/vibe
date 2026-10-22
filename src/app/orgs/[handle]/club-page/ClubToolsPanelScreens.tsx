"use client";

import type { JSX } from "react";

import { FollowersScreen } from "@/components/orgs/tools/FollowersScreen";
import { MembersScreen } from "@/components/orgs/tools/MembersScreen";
import { RequestsScreen } from "@/components/orgs/tools/RequestsScreen";
import { SettingsScreen } from "@/components/orgs/tools/SettingsScreen";
import { ToolsIndex, type ToolsIndexTarget } from "@/components/orgs/tools/ToolsIndex";

import { SetupScreen } from "../setup/SetupScreen";
import type { PanelEntry } from "./club-tools-panel";
import type { PanelHost } from "./ClubToolsPanel";
import { useRoster } from "./ClubToolsLauncherCards";
import { clubPageUrl } from "./share-page";

/**
 * What the tools panel shows (Oct 22, 2026; ClubToolsPanel.tsx): the phone's
 * own Club tools screens, unchanged, from the same officer-only routes. They
 * read for themselves and keep their own sheets; the panel only gives them
 * the club (`ToolsClub`, built by the launcher from the page's props) and
 * the ways out: All Club tools' rows open their screen on top, Edit the page
 * and Past events close everything and act on the club page, and Club
 * settings' Leave and Delete close it before the page is read again or left.
 * Club settings' Edit page (PLAN-5, Oct 22, 2026) is the same way out as
 * Edit the page: the panel closes and the dialog opens.
 */
export function PanelScreenBody({ entry, host }: { entry: PanelEntry; host: PanelHost }): JSX.Element {
  const { club } = host;
  switch (entry.screen) {
    case "index":
      return <IndexScreen host={host} />;
    case "requests":
      return <RequestsScreen club={club} />;
    case "members":
      return <MembersScreen club={club} mode="members" />;
    case "officers":
      return <MembersScreen club={club} mode="officers" />;
    case "followers":
      return <FollowersScreen club={club} />;
    case "settings":
      return <SettingsScreen club={club} onEditPage={host.onEditPage} onLeft={host.onLeft} onDeleted={host.onDeleted} />;
    case "setup":
      return (
        <SetupScreen
          club={{
            id: club.id,
            handle: club.handle,
            name: club.name,
            verified: club.verified,
            hidden: club.hidden,
            joinPolicy: club.joinPolicy,
            audience: club.audience,
            hasLogo: host.setup?.hasLogo ?? false,
            hasBanner: host.setup?.hasBanner ?? false,
          }}
          role={club.role}
          setup={host.setup?.view ?? null}
          embedded
          initialStep={entry.step}
          onClose={host.onClose}
        />
      );
  }
}

/**
 * All Club tools. The page passes no officers count, so it comes from the
 * arc's roster read (the Members and Officers cards share it): no number
 * until it lands, none if it fails, never a wrong one.
 */
function IndexScreen({ host }: { host: PanelHost }): JSX.Element {
  const { club, counts, rosterRef } = host;
  const { rows } = useRoster(club.handle, rosterRef);
  const officers = rows ? rows.filter((m) => m.role === "owner" || m.role === "admin").length : null;
  // The page under the panel is the club page: its own address is the one
  // to share. The panel only ever draws in the browser (a portal after
  // hydration), so `window` is there.
  const clubUrl = clubPageUrl(club.handle, window.location.origin);

  const open = (target: ToolsIndexTarget) => {
    if (target === "edit") host.onEditPage();
    else if (target === "events") host.onPastEvents();
    else if (target === "members_link") host.onOpen({ screen: "setup", step: "members_link" });
    else host.onOpen({ screen: target });
  };

  return <ToolsIndex club={club} counts={{ ...counts, officers }} clubUrl={clubUrl} onOpen={open} />;
}
