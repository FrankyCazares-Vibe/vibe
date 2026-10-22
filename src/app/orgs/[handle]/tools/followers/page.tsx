import type { Metadata } from "next";

import { FollowersScreen } from "@/components/orgs/tools/FollowersScreen";
import { ToolsHeader } from "@/components/orgs/tools/tools-ui";

import { ToolsFailed, ToolsPage } from "../frame";
import { loadOfficerClub, toolsPath } from "../load-officer-club";

/**
 * `/orgs/<handle>/tools/followers`: who follows the club, and Remove (Club
 * tools, the club's view wave 2, C10). The owner and officers only
 * (`loadOfficerClub`); the list comes from the officer-only route.
 */
export const metadata: Metadata = {
  title: "Followers · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

export default async function ClubFollowersPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle, "followers");
  if (loaded.status !== "ok") return <ToolsFailed />;
  const { club } = loaded;

  return (
    <ToolsPage viewerId={loaded.userId}>
      <ToolsHeader backHref={toolsPath(club.handle)} backLabel="Club tools" title="Followers." club={club} />
      <FollowersScreen club={club} />
    </ToolsPage>
  );
}
