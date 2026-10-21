/**
 * The one door into every Club tools page (the club's view, wave 2, C10).
 * The setup page's gate, word for word (`setup/page.tsx`): signed in and
 * past the campus gates, then the club read with the service client, then
 * the viewer's role. A hidden club is a 404 to anyone outside it (as the
 * club page is); a member or a visitor goes to the club page. Only the
 * owner and officers get past.
 *
 * `notFound()` and `redirect()` throw, so a caller only ever sees "ok" or
 * "failed" (a read that failed: the page shows its Failed frame with a
 * Retry, never a 404 for a club that exists).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { SETTINGS_ROLES, isJoinPolicy, isOrgAudience, isOrgRole } from "@/lib/orgs/join-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { ToolsClub } from "@/components/orgs/tools/types";

export type OfficerClub =
  | { status: "ok"; club: ToolsClub; userId: string; service: SupabaseClient }
  | { status: "failed" };

/** The page's own path under the club, for the sign-in `next` ("" for the index). */
export function toolsPath(handle: string, sub = ""): string {
  return `/orgs/${encodeURIComponent(handle)}/tools${sub ? `/${sub}` : ""}`;
}

export async function loadOfficerClub(rawHandle: string, sub = ""): Promise<OfficerClub> {
  const handle = rawHandle.toLowerCase();
  const { userId } = await enforceCampusAccess(toolsPath(handle, sub));

  const service = createSupabaseServiceClient();
  const { data: org, error } = await service
    .from("orgs")
    .select("id, handle, name, logo_url, verified, hidden_at, join_policy, audience, owner_id")
    .eq("handle", handle)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[handle]/tools] club read", error.code);
    return { status: "failed" };
  }
  if (!org) notFound();

  const { data: me, error: meErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (meErr) {
    console.error("[orgs/[handle]/tools] role read", meErr.code);
    return { status: "failed" };
  }
  const role = isOrgRole(me?.role) ? me.role : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role, allowed: SETTINGS_ROLES });
  if (gate === "not_found") notFound();
  if (gate === "forbidden" || (role !== "owner" && role !== "admin")) {
    redirect(`/orgs/${encodeURIComponent(org.handle as string)}`);
  }

  const club: ToolsClub = {
    id: org.id as string,
    handle: org.handle as string,
    name: (org.name as string | null) || (org.handle as string),
    logoUrl: (org.logo_url as string | null) ?? null,
    verified: org.verified === true,
    hidden: !!org.hidden_at,
    joinPolicy: isJoinPolicy(org.join_policy) ? org.join_policy : "request",
    audience: isOrgAudience(org.audience) ? org.audience : "both",
    ownerId: (org.owner_id as string | null) ?? null,
    role,
    viewerId: userId,
  };
  return { status: "ok", club, userId, service };
}
