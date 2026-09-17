import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import {
  canSeeFollowers,
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
  isFollowSource,
  loadFollowerCount,
  loadOrgRole,
  parsePageLimit,
} from "@/lib/orgs/following";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type FollowerRow = {
  id: string;
  user_id: string;
  source: string;
  first_followed_at: string;
};

/** A paging officer, not a scraper. */
const LIST_LIMIT = { limit: 60, windowSec: 60 };

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/orgs/[slug]/followers?limit=&cursor= — who follows this club, for
 * its owner and admins only (wave plan §4.2, batch F1). Students are told
 * officers can see this next to Follow on request and invite-only clubs.
 *
 * WHO: `canSeeFollowers` (owner, admin), the same roles as the
 * `org_followers_select` policy. Mods get 403. A hidden club is 404 to anyone
 * who isn't a member.
 *
 * WHICH CLIENT: the org, the list, the roles and the count are all SERVICE
 * reads (the COUNTS RULE in migration `20260916120000`). The user client is
 * used for the session, for blocks and mutes, and for the person cards.
 *
 * BLOCKS FAIL CLOSED (critic C3). Anyone with a block either way, or muted by
 * the officer, is dropped in the query, before the limit, so a page is never
 * short for it. If the block read fails the whole list is a 500: a list that
 * quietly shows a blocked person is worse than no list.
 *
 * ORDER: `first_followed_at desc, id desc`, cursor on both (critic C5).
 * Never `created_at`, which an unfollow/refollow can re-roll to the top.
 *
 * `follower_count` is the RAW number (officers see small counts) and null
 * when the count read failed. It includes blocked followers; the list doesn't.
 *
 * RESPONSES
 *   200 {ok, followers:[{…UserCard, follows_since, org_follow_source,
 *        member_role}], next_cursor, follower_count}
 *   400 invalid_cursor · 401 unauthorized · 403 officers_only ·
 *   404 not_found · 429 · 500 request_failed
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`org-followers:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/followers load org]", orgErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (!orgRow) return fail(404, "not_found", "Not found");
  const org = orgRow as { id: string; handle: string; hidden_at: string | null };

  const roleRes = await loadOrgRole(service, org.id, user.id);
  if (!roleRes.ok) return fail(500, "request_failed", "Request failed");
  if (org.hidden_at && !roleRes.role) return fail(404, "not_found", "Not found");
  if (!canSeeFollowers(roleRes.role)) {
    return fail(403, "officers_only", "Only owners and admins can see who follows this club.");
  }

  const url = new URL(req.url);
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return fail(400, "invalid_cursor", "Invalid cursor");

  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[orgs/[slug]/followers hidden users]", hiddenRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const hiddenIds = hiddenRes.hidden.ids;

  let query = service
    .from("org_followers")
    .select("id, user_id, source, first_followed_at")
    .eq("org_id", org.id);
  if (hiddenIds.length > 0) query = query.notIn("user_id", hiddenIds);
  if (decoded.cursor) {
    query = query.or(followKeysetOrFilter("first_followed_at", decoded.cursor));
  }
  const { data: rowsData, error: rowsErr } = await query
    .order("first_followed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (rowsErr) {
    console.error("[orgs/[slug]/followers list]", rowsErr);
    return fail(500, "request_failed", "Request failed");
  }

  const rows = (rowsData ?? []) as FollowerRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor =
    rows.length > limit && last ? encodeFollowCursor(last.first_followed_at, last.id) : null;
  const pageUserIds = page.map((r) => r.user_id);

  const [cards, membersRes, follower_count] = await Promise.all([
    hydrateUserCards(supabase, user.id, pageUserIds),
    pageUserIds.length === 0
      ? Promise.resolve({ data: [] as { user_id: string; role: string }[], error: null })
      : service
          .from("org_members")
          .select("user_id, role")
          .eq("org_id", org.id)
          .in("user_id", pageUserIds),
    loadFollowerCount(service, org.id),
  ]);
  if (membersRes.error) {
    console.error("[orgs/[slug]/followers members]", membersRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  // The hydrator swallows its own read errors and drops what it couldn't
  // load, so a short result is a failed read, not a shorter page.
  if (cards.length !== pageUserIds.length) {
    console.error("[orgs/[slug]/followers cards]", {
      expected: pageUserIds.length,
      got: cards.length,
    });
    return fail(500, "request_failed", "Request failed");
  }

  const roleByUser = new Map<string, OrgRole>();
  for (const m of (membersRes.data ?? []) as { user_id: string; role: unknown }[]) {
    if (isOrgRole(m.role)) roleByUser.set(m.user_id, m.role);
  }
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const followers = page.flatMap((row) => {
    const card = cardById.get(row.user_id);
    if (!card) return [];
    return [
      {
        ...card,
        follows_since: row.first_followed_at,
        org_follow_source: isFollowSource(row.source) ? row.source : null,
        member_role: roleByUser.get(row.user_id) ?? null,
      },
    ];
  });

  return NextResponse.json({ ok: true, followers, next_cursor, follower_count });
}
