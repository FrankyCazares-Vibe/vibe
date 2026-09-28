import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { officerGate } from "@/lib/orgs/hidden-gate";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * The shared front door of the officer-only club-chat routes
 * (`/api/orgs/[slug]/channels/**`): load the club and the caller's role with
 * the SERVICE role (orgs_select would hide a private club from the check
 * itself), then answer with `officerGate` (src/lib/orgs/hidden-gate.ts, the
 * one officer-route rule) — 404 for a stranger asking about a hidden club, 403
 * for a non-officer, 500 when a read failed. Optionally load one channel and
 * insist it belongs to this club.
 *
 * Replaces the two copies of `requireStaff` / `requireChannelStaff` that
 * answered a hidden club's strangers with 403 "Admin only" and ignored every
 * read error (security wave 2, A5b). The error strings are the ones those
 * routes already sent, so clients see no new wording.
 */

/** Who manages club channels: owner and admin, like the channel INSERT policy. */
export const CHANNEL_ADMIN_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

export type ClubOfficerGuard =
  | {
      ok: true;
      service: SupabaseClient;
      org: { id: string; hidden_at: string | null };
      role: OrgRole;
      channel: { id: string; org_id: string; is_private: boolean; name: string; topic: string | null } | null;
    }
  | { ok: false; status: 403 | 404 | 500; error: string };

export async function loadClubOfficer(
  slug: string,
  viewerId: string,
  opts: { channelId?: string; allowed?: readonly OrgRole[] } = {},
): Promise<ClubOfficerGuard> {
  const service = createSupabaseServiceClient();

  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[club-routes officer-guard org]", orgErr);
    return { ok: false, status: 500, error: "Request failed" };
  }
  if (!org) return { ok: false, status: 404, error: "Not found" };

  const { data: member, error: memberErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (memberErr) console.error("[club-routes officer-guard role]", memberErr);
  const value = memberErr ? null : (member as { role?: unknown } | null)?.role;
  const role: OrgRole | null = isOrgRole(value) ? value : null;

  // A failed membership read reads as "not a member": on a HIDDEN club that
  // is the stranger's 404 (a 500 would confirm the club exists); anywhere
  // else it is a 500, never a guessed "not allowed".
  const gate = officerGate({
    hidden: org.hidden_at !== null && org.hidden_at !== undefined,
    role,
    allowed: opts.allowed ?? CHANNEL_ADMIN_ROLES,
  });
  if (gate === "not_found") return { ok: false, status: 404, error: "Not found" };
  if (memberErr) return { ok: false, status: 500, error: "Request failed" };
  if (gate === "forbidden" || !role) return { ok: false, status: 403, error: "Admin only" };

  if (opts.channelId === undefined) {
    return { ok: true, service, org, role, channel: null };
  }
  // Only officers of THIS club reach here, so "Channel not found" tells
  // nobody anything new. A malformed id is a miss, not a uuid-cast 500.
  if (!isUuid(opts.channelId)) return { ok: false, status: 404, error: "Channel not found" };
  const { data: channel, error: channelErr } = await service
    .from("channels")
    .select("id, org_id, is_private, name, topic")
    .eq("id", opts.channelId)
    .maybeSingle();
  if (channelErr) {
    console.error("[club-routes officer-guard channel]", channelErr);
    return { ok: false, status: 500, error: "Request failed" };
  }
  if (!channel || channel.org_id !== org.id) {
    return { ok: false, status: 404, error: "Channel not found" };
  }
  return {
    ok: true,
    service,
    org,
    role,
    channel: channel as { id: string; org_id: string; is_private: boolean; name: string; topic: string | null },
  };
}
