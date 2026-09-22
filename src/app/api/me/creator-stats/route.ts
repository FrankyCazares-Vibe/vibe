import { NextResponse } from "next/server";

import { loadPostSaveRows } from "@/lib/metrics/post-audience";
import { loadPostEngagementCounts, type PostEngagement } from "@/lib/posts/engagement-counts";
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
 * Computed live on each call (no materialized rollup table yet). Comments
 * are head-only COUNT(*) queries with index hits. Likes and reposts come from
 * the `post_engagement_counts` RPC (T1), once per window: once T1's policy
 * file lands, `post_likes` and `post_reposts` return only the caller's own
 * rows, so a direct count would read only the author's own likes. The RPC
 * returns numbers only, never who liked. A failed call is a 500, like views
 * and saves below. Views
 * are NOT a count — the helper reads the ledger rows so it can drop the
 * author's own, which means it pages (PostgREST truncates a big response
 * without erroring) and returns null rather than a short number if the scan
 * runs away. For a founder account with ~hundreds of posts both halves are
 * cheap. If a creator ever has 10k+ posts, the views half is the one that
 * wants a grouped RPC or a nightly rollup first; not a v1 concern.
 *
 * SAVES ARE COUNTED THE SAME WAY VIEWS ARE. `bookmarks` RLS is
 * `bookmarks_all_own` — owner of the BOOKMARK — so a cookie-client read of
 * other people's saves of your posts comes back empty with no error, the same
 * silent zero `post_views` used to produce. The rows therefore come through
 * src/lib/metrics/post-audience.ts with the service role, paged (PostgREST
 * truncates at 1000 without erroring), and with the author's own bookmarks
 * dropped: "12 saves" has to mean twelve other people, or it is the same lie
 * the self-view guard removed. A read that fails is a 500 here, never a 0 —
 * on this screen the numbers ARE the product.
 *
 * The top-post score is deliberately NOT changed to weigh saves. Adding a term
 * would silently reorder a list people have already seen; if saves should
 * count, that is a decision to take on purpose.
 *
 * Returns:
 *   {
 *     totals: { posts, views, likes, comments, reposts, saves },
 *     by_window: {
 *       seven_days:  { views, likes, comments, reposts, saves },
 *       thirty_days: { views, likes, comments, reposts, saves },
 *     },
 *     top_posts: [{ id, content, view_count, like_count, comment_count, repost_count, save_count, created_at }]
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
    // Opaque on purpose: the raw Postgres message used to ship to the client
    // here, which is a free schema tour for anyone who can make this fail.
    console.error("[creator-stats posts]", postsRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
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
      totals: { posts: 0, views: 0, likes: 0, comments: 0, reposts: 0, saves: 0 },
      by_window: {
        seven_days: { views: 0, likes: 0, comments: 0, reposts: 0, saves: 0 },
        thirty_days: { views: 0, likes: 0, comments: 0, reposts: 0, saves: 0 },
      },
      top_posts: [],
    });
  }

  // 2. Engagement totals + per-window. Three head-only comment counts, three
  //    like/repost RPC calls (all-time, 7d, 30d: the same ISO boundaries the
  //    comment counts use), plus two row reads — the view ledger and the
  //    bookmarks table. The all-time RPC map, the ledger and the bookmarks
  //    also feed the per-post numbers in the top-posts list below.
  //    Every id in `postIds` is the caller's own post, drafts included, and
  //    the RPC counts drafts for their author, so no total moves.
  const [
    engagementAll,
    engagement7,
    engagement30,
    commentsAllRes,
    comments7Res,
    comments30Res,
    viewRows,
    saveRows,
  ] = await Promise.all([
    loadPostEngagementCounts(supabase, postIds),
    loadPostEngagementCounts(supabase, postIds, sevenAgo),
    loadPostEngagementCounts(supabase, postIds, thirtyAgo),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", sevenAgo),
    supabase.from("post_comments").select("post_id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", thirtyAgo),
    // Views come from the dedupe ledger (per-user-per-day rows) with the
    // caller's own views on their own posts left out — this screen has to
    // answer "how many people looked", not "how many times did I reload".
    // `post_views` has RLS on with NO SELECT policy
    // (20260508110000_post_views.sql), so the helper reads it with the
    // service role; every id in `postIds` belongs to the caller, and only
    // counts ever leave this route — never a viewer's identity.
    loadHonestViewRows(postIds, new Map(postIds.map((id) => [id, user.id]))),
    // Saves come back as ROWS, not three counts, for the same reason views do:
    // the author's own bookmarks have to be dropped, and the per-post tally
    // for the top-posts list needs the rows anyway. One service-role read
    // feeds all-time, 7d, 30d and per-post.
    loadPostSaveRows(postIds, new Map(postIds.map((id) => [id, user.id]))),
  ]);

  // `null` means the ledger could not be read — which is not the same as
  // "nobody looked". Fail the block instead of painting zeros: on this
  // screen the numbers ARE the product, and the client already shows one
  // honest line ("Couldn't load your post stats.") for this whole half.
  if (viewRows === null) {
    console.error("[creator-stats views] post_views ledger unavailable");
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Same rule for saves: unreadable is not zero, and a 0 save tile beside a
  // real view tile is a claim about the product that nothing supports.
  if (saveRows === null) {
    console.error("[creator-stats saves] bookmarks unreadable");
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // And for likes and reposts: `null` from the RPC helper means "we do not
  // know" (it has logged why), never "no likes".
  if (engagementAll === null || engagement7 === null || engagement30 === null) {
    console.error("[creator-stats engagement]");
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const sumEngagement = (m: Map<string, PostEngagement>) => {
    let likes = 0;
    let reposts = 0;
    for (const e of m.values()) {
      likes += e.likes;
      reposts += e.reposts;
    }
    return { likes, reposts };
  };
  const engagementTotalAll = sumEngagement(engagementAll);
  const engagementTotal7 = sumEngagement(engagement7);
  const engagementTotal30 = sumEngagement(engagement30);

  const viewsByPost = tallyViews(viewRows, postIds);
  const allTimeViews = viewRows.length;
  const views7 = viewRows.filter((r) => r.viewed_on >= sevenAgoDate).length;
  const views30 = viewRows.filter((r) => r.viewed_on >= thirtyAgoDate).length;

  // `bookmarks.created_at` is a real timestamptz, so the windows are compared
  // as instants — NOT as strings against `sevenAgo`, because PostgREST returns
  // `+00:00` where `toISOString()` writes `Z` and the two sort differently.
  // The boundaries are the same now-minus-N-days the like/comment/repost
  // counts use, so every 7d tile on the screen means the same seven days.
  const sevenAgoMs = now.getTime() - 7 * 86400000;
  const thirtyAgoMs = now.getTime() - 30 * 86400000;
  const savedAtMs = (iso: string) => new Date(iso).getTime();
  const savesByPost = new Map<string, number>();
  for (const id of postIds) savesByPost.set(id, 0);
  for (const r of saveRows) savesByPost.set(r.post_id, (savesByPost.get(r.post_id) ?? 0) + 1);
  const allTimeSaves = saveRows.length;
  const saves7 = saveRows.filter((r) => savedAtMs(r.created_at) >= sevenAgoMs).length;
  const saves30 = saveRows.filter((r) => savedAtMs(r.created_at) >= thirtyAgoMs).length;

  // 3. Per-post engagement counts for the "top 5" list. Likes and reposts
  //    come from the all-time RPC map above; comments still fetch the raw
  //    post_id array and aggregate in JS.
  const commentRowsRes = await supabase
    .from("post_comments")
    .select("post_id")
    .in("post_id", postIds);
  type IdRow = { post_id: string };
  const tally = (rows: IdRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1);
    return m;
  };
  const likesByPost = new Map<string, number>();
  const repostsByPost = new Map<string, number>();
  for (const [postId, e] of engagementAll) {
    likesByPost.set(postId, e.likes);
    repostsByPost.set(postId, e.reposts);
  }
  const commentsByPost = tally((commentRowsRes.data ?? []) as IdRow[]);

  // Sort posts by an engagement score (views + 4*likes + 6*comments + 8*reposts)
  // so the "top posts" list isn't dominated by raw view counts. Saves ship as
  // a number on each row but are deliberately NOT in the score — adding a term
  // would quietly reshuffle a list people have already read.
  const scored = posts.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    view_count: viewsByPost.get(p.id) ?? 0,
    like_count: likesByPost.get(p.id) ?? 0,
    comment_count: commentsByPost.get(p.id) ?? 0,
    repost_count: repostsByPost.get(p.id) ?? 0,
    save_count: savesByPost.get(p.id) ?? 0,
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
      likes: engagementTotalAll.likes,
      comments: commentsAllRes.count ?? 0,
      reposts: engagementTotalAll.reposts,
      saves: allTimeSaves,
    },
    by_window: {
      seven_days: {
        views: views7,
        likes: engagementTotal7.likes,
        comments: comments7Res.count ?? 0,
        reposts: engagementTotal7.reposts,
        saves: saves7,
      },
      thirty_days: {
        views: views30,
        likes: engagementTotal30.likes,
        comments: comments30Res.count ?? 0,
        reposts: engagementTotal30.reposts,
        saves: saves30,
      },
    },
    top_posts: top,
  });
}
