import { NextResponse } from "next/server";

import { canSeeFollowers, loadFollowerCount, loadOrgRole } from "@/lib/orgs/following";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; userId: string }> };

/** Removing followers one tap at a time, not clearing the list by script. */
const REMOVE_LIMIT = { limit: 30, windowSec: 600 };

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
 * A MUTE, NOT A BAN (open question Q1). The student can follow again, and
 * `org_follow_firsts` is left alone, so they come back with their original
 * first-follow date rather than looking like somebody new. The student isn't
 * notified.
 *
 * MEMBERS AREN'T REMOVABLE HERE (409 `member_follows`), the officer themself
 * and the owner included: a member follows because they're a member, so the
 * way to stop that is removing them from the club.
 *
 * RESPONSES
 *   200 {ok, removed, follower_count}   removed:false when they didn't follow
 *   400 invalid_user_id · 401 unauthorized · 403 officers_only ·
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
    return fail(403, "officers_only", "Only owners and admins can remove followers.");
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

  const { error: deleteErr, count } = await service
    .from("org_followers")
    .delete({ count: "exact" })
    .eq("org_id", org.id)
    .eq("user_id", userId);
  if (deleteErr) {
    console.error("[orgs/[slug]/followers/[userId] delete]", deleteErr);
    return fail(500, "remove_failed", "Couldn't remove this follower. Try again.");
  }

  const follower_count = await loadFollowerCount(service, org.id);
  return NextResponse.json({ ok: true, removed: (count ?? 0) > 0, follower_count });
}
