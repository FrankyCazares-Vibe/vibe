import { NextResponse, type NextRequest } from "next/server";

import { loadHonestViewRows } from "@/lib/posts/honest-views";
import { countViewsSince, isStatsClubParam, statsWindow } from "@/lib/otto/stats";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * GET /api/me/otto/stats[?club=<handle>] — the number on Otto's Stats card
 * (Nov 10, 2026, the Otto build's Wave 2A): views in the last 30 days on your
 * posts, or, with `?club=`, on the posts of a club you own or are an officer
 * of. A NUMBER ONLY: no post, no viewer, no list leaves this route.
 *
 * VIEWS come from the `post_views` ledger with each post's own author left
 * out (src/lib/posts/honest-views.ts), never from `posts.view_count`, and in
 * the same 30-day window /api/me/creator-stats uses (src/lib/otto/stats.ts).
 * Both scopes count the same posts: published, `type='post'`, not removed by
 * a moderator (drafts have no views; creator-stats also counts drafts in its
 * post total, which is why "across N posts" can be smaller here).
 * The ledger is unreadable without the service role, so a ledger that can't
 * be read is a 500, never a 0.
 *
 * WHICH CLIENT. Your own posts are read with your client, as creator-stats
 * does. A club's posts are read with the service role, but only after a
 * service read of `org_members` proves you are its owner or an officer
 * (role owner/admin), scoped to that one club's published, unremoved posts.
 * Anyone else asking about a club gets the same 404 as a club that doesn't
 * exist, so the route can't be used to find out who runs what.
 *
 * RESPONSES
 *   200 {ok, views, posts, since, until, club: {name, handle} | null}
 *   400 bad_club · 401 · 404 not_found · 429 · 500 request_failed
 */

const LIMIT = { limit: 60, windowSec: 60 };
/** Posts counted at most. A club past this many has its number refused, not cut. */
const POSTS_MAX = 2000;
/** Ids per ledger read: keeps each request's URL well under the proxy's limit. */
const CHUNK = 150;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`me-otto-stats:${user.id}`, LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const raw = req.nextUrl.searchParams.get("club");
  const clubParam = raw === null || raw === "" || raw === "me" ? null : raw.trim().toLowerCase();
  if (clubParam !== null && !isStatsClubParam(clubParam)) return fail(400, "bad_club", "Bad club");
  if (!isSupabaseServiceConfigured()) return fail(500, "request_failed", "Request failed");
  const service = createSupabaseServiceClient();

  let club: { name: string; handle: string } | null = null;
  let postsRes: { data: unknown[] | null; error: unknown };
  if (clubParam === null) {
    postsRes = await supabase
      .from("posts")
      .select("id, user_id")
      .eq("user_id", user.id)
      .eq("type", "post")
      .eq("status", "published")
      .is("removed_at", null)
      .limit(POSTS_MAX + 1);
  } else {
    const orgRes = await service.from("orgs").select("id, name, handle").eq("handle", clubParam).maybeSingle();
    if (orgRes.error) {
      console.error("[me/otto/stats org]", orgRes.error);
      return fail(500, "request_failed", "Request failed");
    }
    const org = orgRes.data as { id: string; name: string; handle: string } | null;
    if (!org) return fail(404, "not_found", "Not found");
    const roleRes = await service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1);
    if (roleRes.error) {
      console.error("[me/otto/stats role]", roleRes.error);
      return fail(500, "request_failed", "Request failed");
    }
    if ((roleRes.data ?? []).length === 0) return fail(404, "not_found", "Not found");
    club = { name: org.name, handle: org.handle };
    postsRes = await service
      .from("posts")
      .select("id, user_id")
      .eq("org_id", org.id)
      .eq("type", "post")
      .eq("status", "published")
      .is("removed_at", null)
      .limit(POSTS_MAX + 1);
  }
  if (postsRes.error) {
    console.error("[me/otto/stats posts]", postsRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const posts = (postsRes.data ?? []) as Array<{ id: string; user_id: string }>;
  if (posts.length > POSTS_MAX) {
    console.error(`[me/otto/stats] more than ${POSTS_MAX} posts — refusing a partial count`);
    return fail(500, "request_failed", "Request failed");
  }

  const { since, until } = statsWindow(new Date());
  const authorByPostId = new Map(posts.map((p) => [p.id, p.user_id]));
  const ids = posts.map((p) => p.id);
  let views = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await loadHonestViewRows(chunk, authorByPostId);
    if (rows === null) return fail(500, "request_failed", "Request failed");
    views += countViewsSince(rows, since);
  }

  return NextResponse.json({ ok: true, views, posts: posts.length, since, until, club });
}
