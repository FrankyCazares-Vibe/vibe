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
    .limit(limit);

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

  // Social-proof signal: for each post in this batch, find up to 3
  // reposters who are FOLLOWED BY the viewer (Instagram-style "X and N
  // others reposted this"). We don't surface generic reposter counts
  // here — the value is the friend signal, not raw popularity.
  const friendReposters = await loadFriendReposters(
    supabase,
    Array.from(allPostIds),
    user.id,
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

  const feed = postRowsOut
    .sort((a, b) => (a.sort_at < b.sort_at ? 1 : a.sort_at > b.sort_at ? -1 : 0))
    .slice(0, limit);

  // Legacy `posts` field — flat list, no reposts. The legacy public/html
  // campus prototype reads this; new code should consume `feed` instead.
  const legacyPosts = postRowsOut.map((entry) => entry.post);

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
}> {
  const counts = new Map<string, EngagementCounts>();
  const likedByViewer = new Set<string>();
  const repostedByViewer = new Set<string>();

  if (postIds.length === 0) {
    return { counts, likedByViewer, repostedByViewer };
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
  const [likesAll, commentsAll, repostsAll, likesMine, repostsMine] = await Promise.all([
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

  return { counts, likedByViewer, repostedByViewer };
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
async function loadFriendReposters(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postIds: string[],
  viewerId: string,
): Promise<Map<string, { samples: FriendReposterSample[]; totalFriends: number }>> {
  const out = new Map<
    string,
    { samples: FriendReposterSample[]; totalFriends: number }
  >();
  if (postIds.length === 0) return out;

  const { data: followingRows, error: followingErr } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", viewerId);
  if (followingErr) {
    console.error("[feed.loadFriendReposters following]", followingErr);
    return out;
  }
  const friendIds = (followingRows ?? []).map(
    (r) => (r as { following_id: string }).following_id,
  );
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
