import type { Metadata } from "next";

import { MembersScreen } from "@/components/orgs/tools/MembersScreen";
import { ToolsHeader } from "@/components/orgs/tools/tools-ui";

import { ToolsFailed, ToolsPage } from "../frame";
import { loadOfficerClub, toolsPath } from "../load-officer-club";

/**
 * `/orgs/<handle>/tools/officers`: the owner and officers with their titles
 * (Club tools, the club's view wave 2, C10). The owner adds an officer from
 * the members and makes one a member again; anyone edits the titles the
 * members route lets them. The owner and officers only (`loadOfficerClub`).
 */
export const metadata: Metadata = {
  title: "Officers and titles · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

export default async function ClubOfficersPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle, "officers");
  if (loaded.status !== "ok") return <ToolsFailed />;
  const { club } = loaded;

  return (
    <ToolsPage>
      <ToolsHeader backHref={toolsPath(club.handle)} backLabel="Club tools" title="Officers and titles." club={club} />
      <MembersScreen club={club} mode="officers" />
    </ToolsPage>
  );
}
