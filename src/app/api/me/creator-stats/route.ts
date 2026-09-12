import { NextResponse } from "next/server";

import { loadHonestViewRows, tallyViews } from "@/lib/posts/honest-views";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/creator-stats — aggregate engagement across the viewer's
 * own posts. Three buckets per metric: last 7 days, last 30 days,
 * all-time.
 *
 * EVERY VIEW NUMBER HERE EXCLUDES THE AUTHOR'S OWN VIEWS, and none of them
 * comes from `posts.view_count`. The stored counter counts the author
 * refreshing their own post (`record_post_view` had no self-guard until
 * 20260912100500), which is why this route used to report 74 views for an
 * account whose real figure was 20. Views are counted from the `post_views`
 * ledger instead — see src/lib/posts/honest-views.ts. The stored counter is
 * deliberately left untouched, so any surface still reading it will show a
 * bigger number than this route until it is backfilled.
 *
 * Computed live on each call (no materialized rollup table yet). Likes,
 * comments and reposts are head-only COUNT(*) queries with index hits. Views
 * are NOT a count — the helper reads the ledger rows so it can drop the
 * author's own, which means it pages (PostgREST truncates a big response
 * without erroring) and returns null rather than a short number if the scan
 * runs away. For a founder account with ~hundreds of posts both halves are
 * cheap. If a creator ever has 10k+ posts, the views half is the one that
 * wants a grouped RPC or a nightly rollup first; not a v1 concern.
 *
 * Returns:
 *   {
 *     totals: { posts, views, likes, comments, reposts },
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

  // 1. All of the viewer's posts. `view_count` is deliberately NOT selected —
  //    nothing in this route may read the inflated stored counter. Clips are
  //    backlogged, so `type='post'` is the only creator surface today.
  //    Newest-first is just a stable fetch order; the list that ships is
  //    re-sorted by the engagement score below.
  const postsRes = await supabase
    .from("posts")
    .select("id,type,content,created_at")
    .eq("user_id", user.id)
    .eq("type", "post")
    .order("created_at", { ascending: false });

  if (postsRes.error) {
    console.error("[creator-stats posts]", postsRes.error);
    return NextResponse.json({ ok: false, error: postsRes.error.message }, { status: 500 });
  }

  type PostRow = {
    id: string;
    type: string;
    content: string | null;
    created_at: string;
  };
  const posts = (postsRes.data ?? []) as PostRow[];
  const postIds = posts.map((p) => p.id);
  const postCount = posts.length;

  if (postIds.length === 0) {
    return NextResponse.json({
      ok: true,
      totals: { posts: 0, views: 0, likes: 0, comments: 0, reposts: 0 },
      by_window: {
        seven_days: { views: 0, likes: 0, comments: 0, reposts: 0 },
        thirty_days: { views: 0, likes: 0, comments: 0, reposts: 0 },
      },
      top_posts: [],
    });
  }

  // 2. Engagement totals + per-window. Nine small head-only counts plus one
  //    read of the view ledger, which feeds all-time, 7d, 30d AND the
  //    per-post view numbers in the top-posts list below.
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
    viewRows,
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
    // Views come from the dedupe ledger (per-user-per-day rows) with the
    // caller's own views on their own posts left out — this screen has to
    // answer "how many people looked", not "how many times did I reload".
    // `post_views` has RLS on with NO SELECT policy
    // (20260508110000_post_views.sql), so the helper reads it with the
    // service role; every id in `postIds` belongs to the caller, and only
    // counts ever leave this route — never a viewer's identity.
    loadHonestViewRows(postIds, new Map(postIds.map((id) => [id, user.id]))),
  ]);

  // `null` means the ledger could not be read — which is not the same as
  // "nobody looked". Fail the block instead of painting zeros: on this
  // screen the numbers ARE the product, and the client already shows one
  // honest line ("Couldn't load your post stats.") for this whole half.
  if (viewRows === null) {
    console.error("[creator-stats views] post_views ledger unavailable");
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const viewsByPost = tallyViews(viewRows, postIds);
  const allTimeViews = viewRows.length;
  const views7 = viewRows.filter((r) => r.viewed_on >= sevenAgoDate).length;
  const views30 = viewRows.filter((r) => r.viewed_on >= thirtyAgoDate).length;

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
    view_count: viewsByPost.get(p.id) ?? 0,
    like_count: likesByPost.get(p.id) ?? 0,
    comment_count: commentsByPost.get(p.id) ?? 0,
    repost_count: repostsByPost.get(p.id) ?? 0,
    created_at: p.created_at,
    score:
      (viewsByPost.get(p.id) ?? 0) +
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
      views: allTimeViews,
      likes: likesAllRes.count ?? 0,
      comments: commentsAllRes.count ?? 0,
      reposts: repostsAllRes.count ?? 0,
    },
    by_window: {
      seven_days: {
        views: views7,
        likes: likes7Res.count ?? 0,
        comments: comments7Res.count ?? 0,
        reposts: reposts7Res.count ?? 0,
      },
      thirty_days: {
        views: views30,
        likes: likes30Res.count ?? 0,
        comments: comments30Res.count ?? 0,
        reposts: reposts30Res.count ?? 0,
      },
    },
    top_posts: top,
  });
}
