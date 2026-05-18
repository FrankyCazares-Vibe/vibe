import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type AuthorEmbed = {
  id: string;
  name: string | null;
  handle: string | null;
  school: string | null;
  major: string | null;
  year: number | null;
  avatar_url: string | null;
};

type OrgEmbed = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
} | null;

type PostRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  type: "post" | "clip";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  view_count: number | null;
  created_at: string;
  author: AuthorEmbed | null;
  org: OrgEmbed;
};

type RepostRow = {
  post_id: string;
  user_id: string;
  comment: string | null;
  created_at: string;
  reposter: AuthorEmbed | null;
  post: PostRow | null;
};

type EngagementCounts = {
  like_count: number;
  comment_count: number;
  repost_count: number;
};

/**
 * Campus feed — posts + clips from every user (global), newest first.
 *
 * Each row carries denormalized engagement counts and the viewer's own
 * like/repost state, so the client can render the engagement bar without a
 * second roundtrip per card.
 *
 * The school-scoped query path is preserved below but currently unused —
 * `users.school` isn't populated yet, so the campus feed is global. Once
 * onboarding starts setting `school`, flip the gate to opt back into the
 * per-school filter.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  // Optional hashtag filter — used by the "trending" click-through. Strip
  // leading # and lowercase to match how publish-post normalizes tags.
  const tagFilter = (url.searchParams.get("tag") || "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "");
  // Optional sort override. `recent` skips the ranking pass and returns
  // strictly newest-first (useful for the legacy clients + the "Latest"
  // tab when we add one). Default is the engagement-weighted ranking.
  const sortMode = (url.searchParams.get("sort") || "ranked").toLowerCase();
  const useRanking = sortMode !== "recent" && !tagFilter;
  // Pull a wider candidate pool when we're going to re-rank so the
  // ranking has room to lift older-but-popular posts above the
  // strict-recency cut. Capped to stay within MAX_LIMIT.
  const candidatePoolSize = useRanking
    ? Math.min(MAX_LIMIT, Math.max(limit * 4, 80))
    : limit;

  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("school")
    .eq("id", user.id)
    .single();
  if (meErr) {
    console.error("[feed me]", meErr);
    return NextResponse.json({ ok: false, error: meErr.message }, { status: 500 });
  }

  const school = (me?.school ?? "").trim();

  // Name the FK constraint explicitly (`posts_user_id_fkey`) — the implicit
  // form ambiguates in PostgREST when more than one relationship exists. The
  // `!inner` modifier upgrades the LEFT JOIN to an INNER JOIN so the
  // `eq("author.school", school)` clause actually filters posts.
  let postsQuery = supabase
    .from("posts")
    .select(
      "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,edit_metadata,view_count,created_at," +
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)",
    )
    .in("type", ["post", "clip"])
    .order("created_at", { ascending: false })
    .limit(candidatePoolSize);

  // Global feed for now — no school filter. See the route docblock above.
  if (tagFilter) {
    postsQuery = postsQuery.contains("tags", [tagFilter]);
  }

  // Reposts (global for now). The embedded `post` carries its own
  // author/org joins so the client can render the original card exactly the
  // same way it would as a top-level post.
  const repostsQuery = supabase
    .from("post_reposts")
    .select(
      "post_id,user_id,comment,created_at," +
        "reposter:users!post_reposts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)," +
        "post:posts!inner(" +
        "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,edit_metadata,view_count,created_at," +
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)" +
        ")",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  // Global feed for now — see above. `school` is still returned in the
  // response payload (`viewerSchool`) for clients that surface it.

  // Tag filter focuses the view on original posts with that hashtag. We
  // skip reposts in that mode — surfacing every reshare of every #foo
  // post would dilute the signal users came here for.
  const [postsRes, repostsRes] = tagFilter
    ? [await postsQuery, { data: [] as unknown[], error: null as { message: string } | null }]
    : await Promise.all([postsQuery, repostsQuery]);

  if (postsRes.error) {
    console.error("[feed posts]", postsRes.error);
    return NextResponse.json({ ok: false, error: postsRes.error.message }, { status: 500 });
  }
  // Reposts table may not exist yet on a stale deploy — degrade gracefully.
  if (repostsRes.error) {
    console.error("[feed reposts]", repostsRes.error);
  }

  const postRows = (postsRes.data as unknown as PostRow[]) ?? [];
  const repostRows =
    !repostsRes.error && Array.isArray(repostsRes.data)
      ? ((repostsRes.data as unknown) as RepostRow[])
      : [];

  // Collect every post id that needs engagement counts — both top-level
  // posts and the embedded originals inside reposts.
  const allPostIds = new Set<string>();
  for (const p of postRows) allPostIds.add(p.id);
  for (const r of repostRows) {
    if (r.post?.id) allPostIds.add(r.post.id);
  }

  const engagement = await loadEngagement(supabase, Array.from(allPostIds), user.id);

  // Viewer's outgoing followings — used both for the friend-repost
  // social-proof query AND for the ranking pass below (posts by people
  // you follow get a meaningful score boost).
  const viewerFollowingIds = await loadViewerFollowings(supabase, user.id);

  // Social-proof signal: for each post in this batch, find up to 3
  // reposters who are FOLLOWED BY the viewer (Instagram-style "X and N
  // others reposted this"). We don't surface generic reposter counts
  // here — the value is the friend signal, not raw popularity.
  const friendReposters = await loadFriendReposters(
    supabase,
    Array.from(allPostIds),
    viewerFollowingIds,
  );

  const renderPost = (row: PostRow) => {
    const e = engagement.counts.get(row.id) ?? {
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
    };
    const fr = friendReposters.get(row.id) ?? { samples: [], totalFriends: 0 };
    const org = row.org ?? null;
    // `media_kind` lets the client pick the right player without re-parsing
    // the proxy URL. Clips are always video. Posts can carry a video too
    // (X-style horizontal video posts) when their stored media_url is an
    // R2 object key under `clips/` rather than a public image URL.
    const rawMedia = row.media_url ?? "";
    const isVideo =
      row.type === "clip" || rawMedia.startsWith("clips/");
    const mediaKind: "video" | "image" | null = rawMedia
      ? isVideo
        ? "video"
        : "image"
      : null;
    return {
      ...row,
      view_count: row.view_count ?? 0,
      like_count: e.like_count,
      comment_count: e.comment_count,
      repost_count: e.repost_count,
      viewer_liked: engagement.likedByViewer.has(row.id),
      viewer_reposted: engagement.repostedByViewer.has(row.id),
      viewer_saved: engagement.savedByViewer.has(row.id),
      friend_reposters: fr.samples,
      friend_reposter_count: fr.totalFriends,
      media_url: postMediaProxyUrl(row.id, row.media_url, "media"),
      media_thumbnail_url: postMediaProxyUrl(row.id, row.media_thumbnail_url, "thumbnail"),
      media_kind: mediaKind,
      org: org
        ? { ...org, logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo") }
        : null,
    };
  };

  const postRowsOut = postRows.map((p) => ({
    kind: "post" as const,
    sort_at: p.created_at,
    post: renderPost(p),
  }));

  // Reposts no longer surface as their own feed entries (Instagram-style
  // model: the act of reposting is private to the user's profile, plus a
  // social-proof signal on the original post). We still consume the
  // repostRows above for engagement-count hydration; we just don't emit
  // a separate "repost"-kind row into the feed.
  void repostRows;

  // Tier-1 ranking pass. We pulled `candidatePoolSize` candidates above
  // (≥ 4× the requested page) so this can lift older-but-popular and
  // friend-of-friend posts above the strict recency cut. See
  // scoreFeedRow for the formula. When `sort=recent` or a tag filter is
  // active we keep the original chronological order.
  const now = Date.now();
  const sorted = useRanking
    ? postRowsOut
        .map((entry) => ({
          entry,
          score: scoreFeedRow(entry.post, now, viewerFollowingIds),
        }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.entry)
    : postRowsOut.sort((a, b) =>
        a.sort_at < b.sort_at ? 1 : a.sort_at > b.sort_at ? -1 : 0,
      );

  // Diversity cap: no single author can dominate a page. Walk the
  // ranked list in order, skip a post once we've already seen 3 from
  // the same author. Org posts use org_id as the bucket so a single
  // org account doesn't carpet the feed either.
  const MAX_PER_AUTHOR = 3;
  const perAuthorCount = new Map<string, number>();
  const capped: typeof sorted = [];
  for (const entry of sorted) {
    const key = entry.post.org?.id ?? entry.post.user_id;
    const c = perAuthorCount.get(key) ?? 0;
    if (c >= MAX_PER_AUTHOR) continue;
    perAuthorCount.set(key, c + 1);
    capped.push(entry);
    if (capped.length >= limit) break;
  }
  const feed = capped;

  // Legacy `posts` field — flat list, no reposts. The legacy public/html
  // campus prototype reads this; new code should consume `feed` instead.
  // We pre-filter to what survived the ranking + cap so legacy clients
  // see the same shape, just newer-first sort isn't preserved here.
  const legacyPosts = feed.map((entry) => entry.post);

  return NextResponse.json({
    ok: true,
    feed,
    posts: legacyPosts,
    viewerSchool: school,
    // Echo the viewer's id so the client can gate per-row owner-only
    // affordances (delete menu, etc.) without a separate roundtrip.
    viewerId: user.id,
  });
}

async function loadEngagement(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postIds: string[],
  viewerId: string,
): Promise<{
  counts: Map<string, EngagementCounts>;
  likedByViewer: Set<string>;
  repostedByViewer: Set<string>;
  savedByViewer: Set<string>;
}> {
  const counts = new Map<string, EngagementCounts>();
  const likedByViewer = new Set<string>();
  const repostedByViewer = new Set<string>();
  const savedByViewer = new Set<string>();

  if (postIds.length === 0) {
    return { counts, likedByViewer, repostedByViewer, savedByViewer };
  }

  const ensure = (id: string): EngagementCounts => {
    let entry = counts.get(id);
    if (!entry) {
      entry = { like_count: 0, comment_count: 0, repost_count: 0 };
      counts.set(id, entry);
    }
    return entry;
  };

  // Three independent count queries + viewer-state queries, in parallel.
  const [likesAll, commentsAll, repostsAll, likesMine, repostsMine, savesMine] = await Promise.all([
    supabase.from("post_likes").select("post_id").in("post_id", postIds),
    supabase.from("post_comments").select("post_id").in("post_id", postIds),
    supabase.from("post_reposts").select("post_id").in("post_id", postIds),
    supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", postIds)
      .eq("user_id", viewerId),
    supabase
      .from("post_reposts")
      .select("post_id")
      .in("post_id", postIds)
      .eq("user_id", viewerId),
    supabase
      .from("bookmarks")
      .select("post_id")
      .in("post_id", postIds)
      .eq("user_id", viewerId),
  ]);

  for (const row of likesAll.data ?? []) {
    ensure((row as { post_id: string }).post_id).like_count += 1;
  }
  for (const row of commentsAll.data ?? []) {
    ensure((row as { post_id: string }).post_id).comment_count += 1;
  }
  // post_reposts may not exist yet on stale deploys — skip silently.
  if (!repostsAll.error) {
    for (const row of repostsAll.data ?? []) {
      ensure((row as { post_id: string }).post_id).repost_count += 1;
    }
  }
  for (const row of likesMine.data ?? []) {
    likedByViewer.add((row as { post_id: string }).post_id);
  }
  if (!repostsMine.error) {
    for (const row of repostsMine.data ?? []) {
      repostedByViewer.add((row as { post_id: string }).post_id);
    }
  }
  // bookmarks table may not exist on stale deploys — degrade silently.
  if (!savesMine.error) {
    for (const row of savesMine.data ?? []) {
      savedByViewer.add((row as { post_id: string }).post_id);
    }
  }

  return { counts, likedByViewer, repostedByViewer, savedByViewer };
}

type FriendReposterSample = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

/**
 * For each post in `postIds`, return up to 3 most-recent friend reposters
 * plus the total count of friends who reposted. "Friends" = users the
 * viewer follows in `connections`. Drives the "X and N others reposted
 * this" social-proof pill on FeedCard.
 *
 * Three batched queries:
 *   1. Viewer's followings → list of friend ids.
 *   2. post_reposts WHERE user_id IN friends AND post_id IN postIds.
 *   3. users for the (up to 3 × N) reposter ids we'll actually surface.
 */
/**
 * Tier-1 feed ranking score. Hand-tuned heuristic — no ML. The shape
 * is the same Hacker-News-style decay, plus additive boosts from the
 * viewer's social graph:
 *
 *     engagement = 1 + likes + 2*reposts + comments
 *     base       = engagement / (age_hours + 2)^1.5
 *     score      = base
 *                  * (1.6  if the viewer follows the author, else 1.0)
 *                  + 3 * friend_reposter_count
 *
 * Why these numbers (subject to tuning once we have engagement data):
 *   - Baseline +1 keeps brand-new no-engagement posts from scoring 0
 *     and dropping out of the candidate pool entirely.
 *   - Reposts > comments > likes — reposts spend "social capital" and
 *     show up on someone's profile, so they're the strongest signal.
 *   - Decay exponent 1.5 is gentler than HN's 1.8 so good content can
 *     live ~24h on the feed before being aged out.
 *   - Follow boost is multiplicative so a stale post from a friend
 *     doesn't beat a fresh popular one purely from the additive +5
 *     trap. Friend-repost boost is additive and per-reposter (max 3)
 *     since each fresh reposter is a separate endorsement.
 *
 * @param post A post already rendered by `renderPost` — carries
 *   like/comment/repost counts, friend_reposter_count, etc.
 * @param nowMs Date.now() snapshot for the whole batch (consistency).
 * @param viewerFollowingIds The viewer's outgoing follows set.
 */
function scoreFeedRow(
  post: {
    user_id: string;
    created_at: string;
    like_count: number;
    comment_count: number;
    repost_count: number;
    friend_reposter_count?: number;
  },
  nowMs: number,
  viewerFollowingIds: Set<string>,
): number {
  const ageHours = Math.max(
    0,
    (nowMs - new Date(post.created_at).getTime()) / 3_600_000,
  );
  const engagement =
    1 +
    (post.like_count ?? 0) +
    2 * (post.repost_count ?? 0) +
    (post.comment_count ?? 0);
  let score = engagement / Math.pow(ageHours + 2, 1.5);
  if (viewerFollowingIds.has(post.user_id)) score *= 1.6;
  score += 3 * (post.friend_reposter_count ?? 0);
  return score;
}

/** Single fetch of who-the-viewer-follows — used by both
 *  loadFriendReposters and the ranking pass. Returns a Set for O(1)
 *  membership checks. */
async function loadViewerFollowings(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  viewerId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", viewerId);
  if (error) {
    console.error("[feed.loadViewerFollowings]", error);
    return new Set();
  }
  return new Set(
    (data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
}

async function loadFriendReposters(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postIds: string[],
  viewerFollowingIds: Set<string>,
): Promise<Map<string, { samples: FriendReposterSample[]; totalFriends: number }>> {
  const out = new Map<
    string,
    { samples: FriendReposterSample[]; totalFriends: number }
  >();
  if (postIds.length === 0) return out;

  const friendIds = Array.from(viewerFollowingIds);
  if (friendIds.length === 0) return out;

  const { data: friendRepostRows, error: rrErr } = await supabase
    .from("post_reposts")
    .select("post_id, user_id, created_at")
    .in("post_id", postIds)
    .in("user_id", friendIds)
    .order("created_at", { ascending: false });
  if (rrErr || !friendRepostRows || friendRepostRows.length === 0) {
    if (rrErr) console.error("[feed.loadFriendReposters reposts]", rrErr);
    return out;
  }

  type Row = { post_id: string; user_id: string; created_at: string };
  const byPost = new Map<string, Row[]>();
  for (const row of friendRepostRows as Row[]) {
    const list = byPost.get(row.post_id) ?? [];
    list.push(row);
    byPost.set(row.post_id, list);
  }

  // Resolve the unique user_ids we need for the SAMPLE slice (max 3 per
  // post). Don't hydrate names for the long tail beyond the top 3.
  const sampleUserIds = new Set<string>();
  for (const [, rows] of byPost) {
    rows.slice(0, 3).forEach((r) => sampleUserIds.add(r.user_id));
  }
  const { data: userRows, error: usersErr } = await supabase
    .from("users")
    .select("id,name,handle,avatar_url")
    .in("id", Array.from(sampleUserIds));
  if (usersErr) {
    console.error("[feed.loadFriendReposters users]", usersErr);
  }
  const userById = new Map<string, FriendReposterSample>();
  for (const u of userRows ?? []) {
    const r = u as FriendReposterSample;
    userById.set(r.id, r);
  }

  for (const [postId, rows] of byPost) {
    const samples = rows
      .slice(0, 3)
      .map((r) => userById.get(r.user_id))
      .filter((u): u is FriendReposterSample => !!u);
    out.set(postId, { samples, totalFriends: rows.length });
  }
  return out;
}
