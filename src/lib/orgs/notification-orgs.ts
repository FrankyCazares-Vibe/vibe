import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";

/**
 * The club an `org_invite` / `org_request_approved` notification is about,
 * resolved for the two notification readers (`/api/me/notifications`, which
 * feeds both Otto panels, and `/api/me/otto`, the phone Otto tab).
 *
 * SERVICE ROLE, ON PURPOSE. M1c (`20260916103000_org_join_policy_invites.sql`,
 * the A4 contract paragraph) kept `orgs_select` narrow, so a student invited to
 * a private or invite-only club can't read that club's row under their own
 * client. An `orgs!notifications_org_id_fkey` embed in either reader would come
 * back null for exactly the students the invite is for. So the readers select
 * the bare `org_id` and this joins the club in TypeScript, returning only the
 * three fields a notification row renders: never `hidden_at`, owner or tags.
 *
 * A club that was hidden or deleted after the notification was sent drops the
 * row (plan Q6): tapping it would only reach a 404. A failed read keeps every
 * row with `org: null`, so the panels fall back to "a club" instead of losing
 * an invite. Nothing here throws.
 *
 * Only the two club types are looked at. Any signed-in user can insert a
 * `mention` row for someone else, `org_id` included, so a drop keyed on
 * `org_id` alone would let them point rows at a hidden club and silently
 * empty that person's panel. Every other type gets `org: null` and is never
 * dropped, whatever its `org_id` says.
 */

export type NotificationOrg = {
  handle: string;
  name: string;
  logo_url: string | null;
};

type OrgRow = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  hidden_at: string | null;
};

const CLUB_TYPES = new Set(["org_invite", "org_request_approved"]);

function isClubRow(r: { type?: string }): boolean {
  return typeof r.type === "string" && CLUB_TYPES.has(r.type);
}

export async function attachNotificationOrgs<T extends { type?: string; org_id?: string | null }>(
  service: SupabaseClient,
  rows: T[],
): Promise<Array<T & { org: NotificationOrg | null }>> {
  const withoutOrg = () => rows.map((r) => ({ ...r, org: null }));

  const ids = Array.from(
    new Set(
      rows
        .filter(isClubRow)
        .map((r) => r.org_id)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  );
  if (ids.length === 0) return withoutOrg();

  let orgs: OrgRow[];
  try {
    const { data, error } = await service
      .from("orgs")
      .select("id, handle, name, logo_url, hidden_at")
      .in("id", ids);
    if (error) {
      console.error("[orgs/notification-orgs]", error);
      return withoutOrg();
    }
    orgs = (data ?? []) as OrgRow[];
  } catch (e) {
    console.error("[orgs/notification-orgs]", e);
    return withoutOrg();
  }

  const byId = new Map<string, NotificationOrg>();
  for (const o of orgs) {
    // A hidden club stays out of the map, so its rows drop with the deleted ones.
    if (o.hidden_at != null) continue;
    byId.set(o.id, {
      handle: o.handle,
      name: o.name,
      logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
    });
  }

  const out: Array<T & { org: NotificationOrg | null }> = [];
  for (const r of rows) {
    if (!isClubRow(r) || !r.org_id) {
      out.push({ ...r, org: null });
      continue;
    }
    const org = byId.get(r.org_id);
    if (!org) continue;
    out.push({ ...r, org });
  }
  return out;
}
