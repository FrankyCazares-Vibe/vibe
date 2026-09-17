import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
  isFollowSource,
  parsePageLimit,
} from "@/lib/orgs/following";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type FollowRow = { id: string; org_id: string; source: string; created_at: string };

type OrgRow = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean | null;
  join_policy: string;
  audience: string;
  campus_id: string | null;
};

const LIST_LIMIT = { limit: 60, windowSec: 60 };

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/me/followed-orgs?limit=&cursor= — the clubs I follow, newest follow
 * first (wave plan §4.2, batch F1; critic C25: rate limited and keyset-paged,
 * never the whole table).
 *
 * WHICH CLIENT. My own follow rows are read with MY client, and the
 * `user_id` filter is not optional: `org_followers_select` also returns the
 * follower rows of every club I own or admin. The clubs and my roles in them
 * are SERVICE reads, because `orgs_select` hides a private club (SAE) from a
 * student who follows it without being a member.
 *
 * ORDER: `created_at desc, id desc`. `created_at` is the right key here (my
 * own recency: a refollow moves a club back to the top); officers never see
 * this order.
 *
 * Hidden and deleted clubs are dropped AFTER paging, so a page can come back
 * short, or empty with a `next_cursor`. Clients keep paging until
 * `next_cursor` is null. There is no `join_state` here: a surface with a Join
 * button reads `/api/orgs?filter=following`.
 *
 * RESPONSES
 *   200 {ok, orgs:[{id, handle, name, logo_url, verified, join_policy,
 *        audience, campus_id, followed_at, org_follow_source, member_role}],
 *        next_cursor}
 *   400 invalid_cursor · 401 unauthorized · 429 · 500 request_failed
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`me-followed-orgs:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const url = new URL(req.url);
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return fail(400, "invalid_cursor", "Invalid cursor");

  let query = supabase
    .from("org_followers")
    .select("id, org_id, source, created_at")
    .eq("user_id", user.id);
  if (decoded.cursor) {
    query = query.or(followKeysetOrFilter("created_at", decoded.cursor));
  }
  const { data: rowsData, error: rowsErr } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (rowsErr) {
    console.error("[me/followed-orgs list]", rowsErr);
    return fail(500, "request_failed", "Request failed");
  }

  const rows = (rowsData ?? []) as FollowRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor =
    rows.length > limit && last ? encodeFollowCursor(last.created_at, last.id) : null;
  const orgIds = Array.from(new Set(page.map((r) => r.org_id)));
  if (orgIds.length === 0) {
    return NextResponse.json({ ok: true, orgs: [], next_cursor });
  }

  const service = createSupabaseServiceClient();
  const [orgsRes, rolesRes] = await Promise.all([
    service
      .from("orgs")
      .select("id, handle, name, logo_url, verified, join_policy, audience, campus_id")
      .in("id", orgIds)
      .is("hidden_at", null),
    service
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .in("org_id", orgIds),
  ]);
  if (orgsRes.error || rolesRes.error) {
    console.error("[me/followed-orgs hydrate]", orgsRes.error ?? rolesRes.error);
    return fail(500, "request_failed", "Request failed");
  }

  const orgById = new Map<string, OrgRow>();
  for (const org of (orgsRes.data ?? []) as OrgRow[]) orgById.set(org.id, org);
  const roleByOrg = new Map<string, OrgRole>();
  for (const m of (rolesRes.data ?? []) as { org_id: string; role: unknown }[]) {
    if (isOrgRole(m.role)) roleByOrg.set(m.org_id, m.role);
  }

  const orgs = page.flatMap((row) => {
    const org = orgById.get(row.org_id);
    if (!org) return [];
    return [
      {
        id: org.id,
        handle: org.handle,
        name: org.name,
        logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
        verified: org.verified === true,
        join_policy: org.join_policy,
        audience: org.audience,
        campus_id: org.campus_id,
        followed_at: row.created_at,
        org_follow_source: isFollowSource(row.source) ? row.source : null,
        member_role: roleByOrg.get(row.org_id) ?? null,
      },
    ];
  });

  return NextResponse.json({ ok: true, orgs, next_cursor });
}
