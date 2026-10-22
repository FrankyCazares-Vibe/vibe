import type { Metadata } from "next";

import { MembersScreen } from "@/components/orgs/tools/MembersScreen";
import { ToolsHeader } from "@/components/orgs/tools/tools-ui";

import { ToolsFailed, ToolsPage } from "../frame";
import { loadOfficerClub, toolsPath } from "../load-officer-club";

/**
 * `/orgs/<handle>/tools/members`: everyone in the club, with titles, roles
 * (the owner's) and Remove (Club tools, the club's view wave 2, C10). The
 * owner and officers only (`loadOfficerClub`).
 */
export const metadata: Metadata = {
  title: "Members · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

export default async function ClubMembersPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle, "members");
  if (loaded.status !== "ok") return <ToolsFailed />;
  const { club } = loaded;

  return (
    <ToolsPage viewerId={loaded.userId}>
      <ToolsHeader backHref={toolsPath(club.handle)} backLabel="Club tools" title="Members." club={club} sub="Tap someone for their title and more" />
      <MembersScreen club={club} mode="members" />
    </ToolsPage>
  );
}
