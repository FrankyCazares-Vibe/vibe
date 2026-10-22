import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ToolsIndex, type ToolsCounts } from "@/components/orgs/tools/ToolsIndex";
import { getSiteUrl } from "@/lib/auth/site-url";
import { loadFollowerCount } from "@/lib/orgs/following";
import { loadOfficerCounts } from "@/lib/orgs/officer-counts";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ToolsFailed, ToolsPage } from "./frame";
import { loadOfficerClub } from "./load-officer-club";

/**
 * `/orgs/<handle>/tools`: Club tools, "only officers see this" (the club's
 * view, wave 2, C10; the B_Board_Tools drawing). The phone's way into
 * everything an officer runs: bring people in, the people lists, and the
 * club's own page and settings. The desktop `/campus?manage=<handle>`
 * window stays as it is.
 *
 * The counts are read here with the service client and shown exact
 * (officers see the real numbers, even under 5). A count that couldn't be
 * read shows nothing, never a zero. Join requests leave out the officer's
 * block pairs, as the requests list does (`loadOfficerCounts`); when the
 * blocks can't be read that count shows nothing, so it can never say that
 * someone who blocked this officer asked to join.
 */
export const metadata: Metadata = {
  title: "Club tools · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ handle: string }> };

/** A head count of one query, or null when it failed. */
async function headCount(q: PromiseLike<{ count: number | null; error: { code?: string } | null }>, what: string) {
  const { count, error } = await q;
  if (error) {
    console.error(`[orgs/[handle]/tools] ${what} count`, error.code);
    return null;
  }
  return typeof count === "number" ? count : null;
}

async function pendingRequests(service: SupabaseClient, orgId: string, viewerId: string): Promise<number | null> {
  const hidden = await loadHiddenUsers(await createSupabaseServerClient(), viewerId);
  if (!hidden.ok) return null;
  return (await loadOfficerCounts(service, orgId, Date.now(), hidden.hidden.blocked)).pendingRequests;
}

async function loadCounts(service: SupabaseClient, orgId: string, viewerId: string): Promise<ToolsCounts> {
  const [requests, members, followers, officers] = await Promise.all([
    pendingRequests(service, orgId, viewerId),
    headCount(service.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId), "members"),
    loadFollowerCount(service, orgId),
    headCount(
      service.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId).in("role", ["owner", "admin"]),
      "officers",
    ),
  ]);
  return { requests, members, followers, officers };
}

export default async function ClubToolsPage({ params }: Props) {
  const { handle } = await params;
  const loaded = await loadOfficerClub(handle);
  if (loaded.status !== "ok") return <ToolsFailed />;

  const counts = await loadCounts(loaded.service, loaded.club.id, loaded.userId);
  const clubUrl = `${getSiteUrl()}/orgs/${encodeURIComponent(loaded.club.handle)}`;

  return (
    <ToolsPage viewerId={loaded.userId}>
      <ToolsIndex club={loaded.club} counts={counts} clubUrl={clubUrl} />
    </ToolsPage>
  );
}
