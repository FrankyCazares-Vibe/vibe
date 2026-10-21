import { NextResponse } from "next/server";

import { requireNotRestricted } from "@/lib/moderation/access";
import { canSeeFollowers, loadFollowerCount, loadOrgRole } from "@/lib/orgs/following";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; userId: string }> };

/** Removing followers one tap at a time, not clearing the list by script. */
const REMOVE_LIMIT = { limit: 30, windowSec: 600 };

/** Who may not read a club's Board until they join (migration 20261017100000). */
const BOARD_BARS_TABLE = "org_board_bars";

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * DELETE /api/orgs/[slug]/followers/[userId] — an owner or admin removes a
 * follower (critic C4; wave plan §4.2, batch F1).
 *
 * THE BOUNDARY IS THIS FILE. `authenticated` has no DELETE grant or policy on
 * `org_followers` on purpose (migration `20260916120000`, OFFICER REMOVAL):
 * a policy would be a second way in that skips this rate limit and the hidden
 * check. So the route authorises against the officer's role and then deletes
 * with the service client.
 *
 * A BAR FROM THE BOARD, NOT FROM FOLLOWING (Franky, Oct 16; spec H2(a)).
 * Followers read a club's Board, so removing one also writes an
 * `org_board_bars` row: they can't read the Board again until they join
 * (joining clears it, in the database). Following itself stays open: they
 * can follow again and see the club's posts, and `org_follow_firsts` is left
 * alone, so they come back with their original first-follow date rather
 * than looking like somebody new. The student isn't notified, and nothing
 * they can read says they were barred: their Board simply isn't offered.
 * Someone who doesn't follow is not barred (`removed: false`, as before).
 *
 * MEMBERS AREN'T REMOVABLE HERE (409 `member_follows`), the officer themself
 * and the owner included: a member follows because they're a member, so the
 * way to stop that is removing them from the club.
 *
 * RESPONSES
 *   200 {ok, removed, follower_count}   removed:false when they didn't follow
 *   400 invalid_user_id · 401 unauthorized · 403 officers_only (or the
 *   Terms / restriction refusal) ·
 *   404 not_found · 409 member_follows · 429 · 500 remove_failed
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`org-follower-remove:${user.id}`, REMOVE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  if (!isUuid(userId)) return fail(400, "invalid_user_id", "Invalid user id");

  // This route writes with the service role, which skips the policies that
  // refuse a suspended or banned officer, and the proxy's 403 leans on the
  // app_metadata mirror: ask here, as the members route does (wave 2
  // security pass L5; Club tools puts this one tap away on the phone).
  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/followers/[userId] load org]", orgErr);
    return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
  }
  if (!orgRow) return fail(404, "not_found", "Not found");
  const org = orgRow as { id: string; hidden_at: string | null };

  const viewerRes = await loadOrgRole(service, org.id, user.id);
  if (!viewerRes.ok) {
    return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
  }
  if (org.hidden_at && !viewerRes.role) return fail(404, "not_found", "Not found");
  if (!canSeeFollowers(viewerRes.role)) {
    return fail(403, "officers_only", "Only the owner and officers can remove followers.");
  }

  const targetRes = await loadOrgRole(service, org.id, userId);
  if (!targetRes.ok) {
    return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
  }
  if (targetRes.role) {
    return fail(
      409,
      "member_follows",
      "Members follow their club automatically. Remove them from the club instead.",
    );
  }

  // Only someone who follows is barred: an officer can't file a bar against
  // any account id they like, and "didn't follow" keeps today's answer.
  const { data: followRow, error: followErr } = await service
    .from("org_followers")
    .select("user_id")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (followErr) {
    console.error("[orgs/[slug]/followers/[userId] read follow]", followErr.code, followErr.message);
    return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
  }

  let count: number | null = 0;
  if (followRow) {
    // THE BAR FIRST: a bar that didn't land leaves the follow in place, so
    // the officer's retry does both; never a removal they could undo by
    // following again.
    const barred = await writeBoardBar(service, org.id, userId, user.id);
    if (!barred) return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");

    const deleted = await service
      .from("org_followers")
      .delete({ count: "exact" })
      .eq("org_id", org.id)
      .eq("user_id", userId);
    if (deleted.error) {
      console.error("[orgs/[slug]/followers/[userId] delete]", deleted.error);
      return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
    }
    count = deleted.count;
  }

  const follower_count = await loadFollowerCount(service, org.id);
  return NextResponse.json({ ok: true, removed: (count ?? 0) > 0, follower_count });
}

/**
 * The Board bar (`org_board_bars`, migration 20261017100000): the removed
 * follower can't read the club's Board until they join, even if they follow
 * again. Service role only, like the table; one row per club and person, a
 * second removal refreshing who did it and when (an upsert only writes the
 * columns it sends, so `barred_at` is sent). True when the bar is in place,
 * or when this database has no such table yet: before that migration no
 * follower reads any Board, so there is nothing to bar.
 */
async function writeBoardBar(
  service: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  userId: string,
  officerId: string,
): Promise<boolean> {
  const { error } = await service
    .from(BOARD_BARS_TABLE)
    .upsert(
      { org_id: orgId, user_id: userId, barred_by: officerId, barred_at: new Date().toISOString() },
      { onConflict: "org_id,user_id" },
    );
  if (!error) return true;
  if (error.code === "42P01" || error.code === "PGRST205") {
    console.error(`[orgs/[slug]/followers/[userId] bar] ${BOARD_BARS_TABLE} is not in this database yet`);
    return true;
  }
  console.error("[orgs/[slug]/followers/[userId] bar]", error.code, error.message);
  return false;
}
