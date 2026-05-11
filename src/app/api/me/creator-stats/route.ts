import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/creator-stats — aggregate engagement across the viewer's
 * own posts + clips. Three buckets per metric: last 7 days, last 30 days,
 * all-time.
 *
 * Computed live on each call (no materialized rollup table yet). For a
 * founder account with ~hundreds of posts this is fine — a few SELECT
 * COUNT(*) queries with index hits. If a creator ever has 10k+ posts we
 * can move to a nightly rollup; not a v1 concern.
 *
 * Returns:
 *   {
 *     totals: { posts, clips, views, likes, comments, reposts },
 *     by_window: {
 *       seven_days:  { views, likes, comments, reposts },
 *       thirty_days: { views, likes, comments, reposts },
 *     },
 *     top_posts: [{ id, content, view_count, like_count, comment_count, repost_count, created_at }]
 *   }
 */

const TOP_POSTS_LIMIT = 5;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sevenAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  // YYYY-MM-DD strings for the post_views date column.
  const sevenAgoDate = sevenAgo.slice(0, 10);
  const thirtyAgoDate = thirtyAgo.slice(0, 10);

  // 1. All of the viewer's posts + their denormalized view_count.
  //    type='post' vs type='clip' are the two creator surfaces today.
  const postsRes = await supabase
    .from("posts")
    .select("id,type,content,view_count,created_at")
    .eq("user_id", user.id)
    .order("view_count", { ascending: false });

  if (postsRes.error) {
    console.error("[creator-stats posts]", postsRes.error);
    return NextResponse.json({ ok: false, error: postsRes.error.message }, { status: 500 });
  }

  type PostRow = {
    id: string;
    type: string;
    content: string | null;
    view_count: number | null;
    created_at: string;
  };
  const posts = (postsRes.data ?? []) as PostRow[];
  const postIds = posts.map((p) => p.id);
  const postCount = posts.filter((p) => p.type === "post" || p.type === "post-video").length;
  const clipCount = posts.filter((p) => p.type === "clip").length;
  const allTimeViews = posts.reduce((acc, p) => acc + (p.view_count ?? 0), 0);

  if (postIds.length === 0) {
    return NextResponse.json({
      ok: true,
      totals: { posts: 0, clips: 0, views: 0, likes: 0, comments: 0, reposts: 0 },
      by_window: {
        seven_days: { views: 0, likes: 0, comments: 0, reposts: 0 },
        thirty_days: { views: 0, likes: 0, comments: 0, reposts: 0 },
      },
      top_posts: [],
    });
  }

  // 2. Engagement totals + per-window. These are six small head-only counts
  //    plus three windowed views queries against the per-day ledger.
  const [
    likesAllRes,
    likes7Res,
    likes30Res,
    commentsAllRes,
    comments7Res,
    comments30Res,
    repostsAllRes,
    reposts7Res,
    reposts30Res,
    views7Res,
    views30Res,
  ] = await Promise.all([
    supabase.from("post_likes").select("post_id", { count: "exact", head: true }).in("post_id", postIds),
    supabase.from("post_likes").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", sevenAgo),
    supabase.from("post_likes").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", thirtyAgo),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", sevenAgo),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", thirtyAgo),
    supabase.from("post_reposts").select("post_id", { count: "exact", head: true }).in("post_id", postIds),
    supabase.from("post_reposts").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", sevenAgo),
    supabase.from("post_reposts").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", thirtyAgo),
    // Windowed view counts come from the dedupe ledger (per-user-per-day rows).
    supabase.from("post_views").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("viewed_on", sevenAgoDate),
    supabase.from("post_views").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("viewed_on", thirtyAgoDate),
  ]);

  // 3. Per-post engagement counts for the "top 5" list. Reuse the all-time
  //    queries' rows so we don't refetch — fetch the raw post_id arrays and
  //    aggregate in JS.
  const [likeRowsRes, commentRowsRes, repostRowsRes] = await Promise.all([
    supabase.from("post_likes").select("post_id").in("post_id", postIds),
    supabase.from("post_comments").select("post_id").in("post_id", postIds),
    supabase.from("post_reposts").select("post_id").in("post_id", postIds),
  ]);
  type IdRow = { post_id: string };
  const tally = (rows: IdRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1);
    return m;
  };
  const likesByPost = tally((likeRowsRes.data ?? []) as IdRow[]);
  const commentsByPost = tally((commentRowsRes.data ?? []) as IdRow[]);
  const repostsByPost = tally((repostRowsRes.data ?? []) as IdRow[]);

  // Sort posts by an engagement score (views + 4*likes + 6*comments + 8*reposts)
  // so the "top posts" list isn't dominated by raw view counts.
  const scored = posts.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    view_count: p.view_count ?? 0,
    like_count: likesByPost.get(p.id) ?? 0,
    comment_count: commentsByPost.get(p.id) ?? 0,
    repost_count: repostsByPost.get(p.id) ?? 0,
    created_at: p.created_at,
    score:
      (p.view_count ?? 0) +
      4 * (likesByPost.get(p.id) ?? 0) +
      6 * (commentsByPost.get(p.id) ?? 0) +
      8 * (repostsByPost.get(p.id) ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_POSTS_LIMIT).map((r) => {
    const { score, ...rest } = r;
    void score;
    return rest;
  });

  return NextResponse.json({
    ok: true,
    totals: {
      posts: postCount,
      clips: clipCount,
      views: allTimeViews,
      likes: likesAllRes.count ?? 0,
      comments: commentsAllRes.count ?? 0,
      reposts: repostsAllRes.count ?? 0,
    },
    by_window: {
      seven_days: {
        views: views7Res.count ?? 0,
        likes: likes7Res.count ?? 0,
        comments: comments7Res.count ?? 0,
        reposts: reposts7Res.count ?? 0,
      },
      thirty_days: {
        views: views30Res.count ?? 0,
        likes: likes30Res.count ?? 0,
        comments: comments30Res.count ?? 0,
        reposts: reposts30Res.count ?? 0,
      },
    },
    top_posts: top,
  });
}
