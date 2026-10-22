import type { Metadata } from "next";

import { SettingsScreen } from "@/components/orgs/tools/SettingsScreen";
import { ToolsHeader } from "@/components/orgs/tools/tools-ui";

import { ToolsFailed, ToolsPage } from "../frame";
import { loadOfficerClub, toolsPath } from "../load-officer-club";

/**
 * `/orgs/<handle>/tools/settings`: the Board switch, and leaving or
 * deleting the club (Club tools, the club's view wave 2, C10). The owner
 * and officers only (`loadOfficerClub`); who can join and the page's own
 * words live in Edit page.
 */
export const metadata: Metadata = {
  title: "Club settings · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

export default async function ClubSettingsPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle, "settings");
  if (loaded.status !== "ok") return <ToolsFailed />;
  const { club } = loaded;

  return (
    <ToolsPage viewerId={loaded.userId}>
      <ToolsHeader backHref={toolsPath(club.handle)} backLabel="Club tools" title="Club settings." club={club} />
      <SettingsScreen club={club} />
    </ToolsPage>
  );
}
