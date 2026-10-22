import type { Metadata } from "next";

import { RequestsScreen } from "@/components/orgs/tools/RequestsScreen";
import { ToolsHeader } from "@/components/orgs/tools/tools-ui";

import { ToolsFailed, ToolsPage } from "../frame";
import { loadOfficerClub, toolsPath } from "../load-officer-club";

/**
 * `/orgs/<handle>/tools/requests`: the club's join requests, to approve or
 * deny (Club tools, the club's view wave 2, C10). The owner and officers
 * only (`loadOfficerClub`); the list itself comes from the officer-only
 * route, so names and photos never reach anyone else.
 */
export const metadata: Metadata = {
  title: "Join requests · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

export default async function ClubRequestsPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle, "requests");
  if (loaded.status !== "ok") return <ToolsFailed />;
  const { club } = loaded;

  return (
    <ToolsPage viewerId={loaded.userId}>
      <ToolsHeader
        backHref={toolsPath(club.handle)}
        backLabel="Club tools"
        title="Join requests."
        club={club}
        sub="Approve or deny each one"
      />
      <RequestsScreen club={club} />
    </ToolsPage>
  );
}
