import { NextResponse } from "next/server";

import { isSchoolSystem, legacyLabel, type SchoolSystem } from "@/lib/iu/campuses";
import { resolveScopeV2, scopeCampusIds } from "@/lib/iu/campus-scope";
import {
  campusScopeError,
  feedLaneFor,
  feedLaneOrFilter,
  homeCampusIdFor,
  postInFeedLane,
  scoreFeedRow,
} from "@/lib/iu/community-scope";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadHonestViewRows, tallyViews } from "@/lib/posts/honest-views";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type AuthorEmbed = {
  id: string;
  name: string | null;
  handle: string | null;
  /** Legacy label, dual-written until M3. Display only — never scoping. */
  school: string | null;
  campus_id: string | null;
  school_system: string | null;
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
  type: "post";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  view_count: number | null;
  created_at: string;
  /** Stamped by the `posts_stamp_campus` trigger (M1); null on legacy rows. */
  campus_id: string | null;
  /** Same trigger. Lets campus-less legacy posts be scoped by university. */
  school_system: string | null;
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
 * Campus feed — the viewer's campus lane (see THE CAMPUS LANE below), ranked.
 *
 * Clips (`type='clip'`) are backlogged — the query filters to `type='post'`
 * only. Existing clip rows stay in the table; see DOCS/BACKLOG_CLIPS.md.
 *
 * Each row carries denormalized engagement counts and the viewer's own
 * like/repost state, so the client can render the engagement bar without a
 * second roundtrip per card.
 *
 * THE CAMPUS LANE (plan §2.4, Franky's Q2, critic A7). This is no longer a
 * global feed. It carries, all on `campus_id` — never a label, so shared
 * Indianapolis is ONE community for IU and Purdue students:
 *
 *   - posts on the viewer's home campus;
 *   - campus-less posts: the legacy rows that belong to the viewer's
 *     university (critic A7 — otherwise those 10 rows stay visible to every
 *     university forever) plus any post stamped with no university at all,
 *     which the trigger pins forever and which would otherwise reach nobody,
 *     its own author included;
 *   - posts by people the viewer follows, wherever they are, because follows
 *     are global.
 *
 * `?campus=<id>` switches to another campus in the viewer's allowed set (403
 * `campus_not_in_system` otherwise, 400 for an id that isn't a campus at
 * all); that browse view is that campus only. A viewer with no home campus
 * sees their whole university, and one with no university at all still sees
 * everything — an empty app is the worse failure. The ×1.35 ranking boost
 * floats the home campus inside whatever the lane contains.
 *
 * Still relevance, not secrecy: `posts_select_authenticated` is
 * `status = 'published' OR mine`, so any signed-in user can read another
 * campus's rows directly (plan §2.4 honesty note).
 *
 * The response keeps `viewerSchool` (raw stored string) and `viewerCampus`
 * (canonical label, now derived from `campus_id`) for existing clients, and
 * adds `viewerCampusId`, `viewerSystem` and `feedScope`.
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

  // The viewer's campus, the people they shouldn't see (blocked either way,
  // muted right now) and who they follow load together. The follow set is
  // needed EARLY now — it's part of the lane filter below, not just the
  // ranking pass — so it moved into this round trip.
  const [meRes, hiddenRes, followingRes] = await Promise.all([
    // `maybeSingle`, not `single`: a viewer whose `public.users` row is
    // missing gets the same feed they get today (no campus, no university →
    // the global lane below), not a hard 500 on the app's home screen. A
    // genuine read error still fails closed — the lane depends on this row,
    // so a silent null would quietly widen the feed to every university.
    supabase.from("users").select("school,campus_id,school_system").eq("id", user.id).maybeSingle(),
    loadHiddenUsers(supabase, user.id),
    loadViewerFollowings(supabase, user.id),
  ]);
  const { data: me, error: meErr } = meRes;
  if (meErr) {
    console.error("[feed me]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  // Fail closed: a feed that quietly shows someone the viewer blocked is
  // worse than one that asks them to try again.
  if (!hiddenRes.ok) {
    console.error("[feed hidden-users]", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  // Same rule for the follow set, which now decides VISIBILITY and not just
  // ranking: it is half the lane filter. Swallowing the error would drop
  // every followed friend's off-campus post while still answering ok:true —
  // an empty-looking feed with nothing but a console line to explain it.
  if (!followingRes.ok) {
    console.error("[feed followings]", followingRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const viewerFollowingIds = followingRes.ids;
  const hiddenIds = hiddenRes.hidden.ids;
  // Mute doesn't unfollow, so a muted (or not-yet-torn-down blocked) person
  // can still be in this set. Drop them so their posts never ride into the
  // lane on the follow clause, their repost never surfaces as "X reposted
  // this", and they never get the follow boost.
  for (const id of hiddenIds) viewerFollowingIds.delete(id);

  const school = (me?.school ?? "").trim();
  const viewer = {
    campusId: (me?.campus_id as string | null) ?? null,
    system: isSchoolSystem(me?.school_system) ? (me.school_system as SchoolSystem) : null,
  };
  // The home campus, validated against the viewer's university (a campus
  // outside it could only come from a trigger bypass). Null makes the
  // home-campus boost inert.
  const homeCampusId = homeCampusIdFor(viewer);
  // Legacy field: the canonical label, now derived from `campus_id` instead
  // of the `school` string. Same value for every backfilled row, and finally
  // correct for a Purdue student ("Purdue Indianapolis", not "IU …").
  const viewerCampus = legacyLabel(homeCampusId, viewer.system) || null;

  const scope = resolveScopeV2(url.searchParams.get("campus"), viewer);
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }
  const lane = feedLaneFor(scope, viewer);
  const laneFilter = feedLaneOrFilter(lane, Array.from(viewerFollowingIds));

  // Name the FK constraint explicitly (`posts_user_id_fkey`) — the implicit
  // form ambiguates in PostgREST when more than one relationship exists. The
  // `!inner` modifier upgrades the LEFT JOIN to an INNER JOIN.
  let postsQuery = supabase
    .from("posts")
    .select(
      "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        "campus_id,school_system," +
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,campus_id,school_system,major,year,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)",
    )
    .eq("type", "post")
    .order("created_at", { ascending: false })
    .limit(candidatePoolSize);

  // The campus lane (see the route docblock). Applied before the limit, so a
  // post from another university never costs a slot on the page. Null means
  // "nothing to scope to" — a viewer with no verified university.
  if (laneFilter) {
    postsQuery = postsQuery.or(laneFilter);
  }
  if (tagFilter) {
    postsQuery = postsQuery.contains("tags", [tagFilter]);
  }
  // Blocked and muted authors are excluded in the query itself — before the
  // limit and the ranking pass — so they never take a slot on the page.
  // Keyed on the posting user, so it covers posts they made for an org too.
  if (hiddenIds.length > 0) {
    postsQuery = postsQuery.notIn("user_id", hiddenIds);
  }

  // Reposts (global for now). The embedded `post` carries its own
  // author/org joins so the client can render the original card exactly the
  // same way it would as a top-level post.
  let repostsQuery = supabase
    .from("post_reposts")
    .select(
      "post_id,user_id,comment,created_at," +
        "reposter:users!post_reposts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)," +
        "post:posts!inner(" +
        "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)" +
        ")",
    )
    // Clips are backlogged — a repost of a clip must not leak into the feed
    // through the embedded post join.
    .eq("post.type", "post")
    .order("created_at", { ascending: false })
    .limit(limit);
  // Same exclusion for reposts: drop one when the reposter OR the original
  // post's author is hidden. `post` is an !inner embed, so the embedded
  // filter removes the whole repost row, not just its `post`.
  if (hiddenIds.length > 0) {
    repostsQuery = repostsQuery
      .notIn("user_id", hiddenIds)
      .notIn("post.user_id", hiddenIds);
  }

  // Reposts are hydration-only (see `void repostRows` below) — they emit no
  // feed row, so they take no lane filter. `school` is still returned in the
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

  // Belt and braces: the query already applied the lane, and this drops
  // anything that got past the filter grammar anyway. A mistake here should
  // show fewer posts, never another university's.
  const postRows = ((postsRes.data as unknown as PostRow[]) ?? []).filter((p) =>
    postInFeedLane(p, lane, viewerFollowingIds),
  );
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

  // The view number on a card is counted from the `post_views` ledger with
  // the post author's own views dropped. `posts.view_count` counts an author
  // refreshing their own post — `record_post_view` had no self-view guard
  // until 20260912100500 — and on the live DB 71 of 149 ledger rows were
  // self-views. Only the posts we actually render need this: reposts no
  // longer emit their own feed rows (see `void repostRows` below).
  const authorByPostId = new Map(postRows.map((p) => [p.id, p.user_id]));
  const renderedPostIds = Array.from(authorByPostId.keys());

  const [engagement, viewRows] = await Promise.all([
    loadEngagement(supabase, Array.from(allPostIds), user.id),
    loadHonestViewRows(renderedPostIds, authorByPostId),
  ]);

  // A per-card view count is a secondary metric on a page whose job is the
  // posts themselves, so if the ledger can't be read we keep showing the
  // stored counter — the number that has shipped for months — rather than
  // failing the whole feed or printing a 0 the data doesn't support. The
  // helper has already logged why. The metrics screen makes the opposite
  // call: there the number IS the product, so creator-stats fails loudly.
  const honestViews = viewRows === null ? null : tallyViews(viewRows, renderedPostIds);

  // `viewerFollowingIds` loaded with the viewer's row above (it gates the
  // lane), and muted/blocked people are already out of it.

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
    return {
      // Proxy URLs for media, plus `media_kind` so the client picks the
      // right player without re-parsing the proxy URL. A post carries video
      // when its stored media_url is an R2 key under `clips/` (legacy
      // naming — it backs regular video posts, not clips).
      ...withPostMediaUrls(row),
      // `honestViews === null` means the ledger was unreadable, not that
      // nobody looked — hence the stored-counter fallback noted above.
      view_count: honestViews ? (honestViews.get(row.id) ?? 0) : (row.view_count ?? 0),
      like_count: e.like_count,
      comment_count: e.comment_count,
      repost_count: e.repost_count,
      viewer_liked: engagement.likedByViewer.has(row.id),
      viewer_reposted: engagement.repostedByViewer.has(row.id),
      viewer_saved: engagement.savedByViewer.has(row.id),
      friend_reposters: fr.samples,
      friend_reposter_count: fr.totalFriends,
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
  // active we keep the original chronological order — `sort=recent` is a
  // pure chronological escape hatch with no campus RANKING. (The lane still
  // applies: it decides what is in the feed at all, not what floats.)
  const now = Date.now();
  const sorted = useRanking
    ? postRowsOut
        .map((entry) => ({
          entry,
          score: scoreFeedRow(entry.post, now, viewerFollowingIds, homeCampusId),
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
    // Canonical campus label (null when unset/unknown). `viewerSchool` is
    // the raw stored string and stays for existing clients; new clients
    // should label the feed off `viewerCampusId`.
    viewerCampus,
    // The campus model: the ids wave-3 clients label the lane with.
    viewerCampusId: homeCampusId,
    viewerSystem: viewer.system,
    feedScope: {
      kind: scope.kind,
      campusIds: scopeCampusIds(scope),
      /** True when `?campus=` asked for this scope rather than defaulting. */
      explicit: !!(url.searchParams.get("campus") || "").trim(),
    },
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
 * Single fetch of who-the-viewer-follows — used by the LANE (a followed
 * author's post rides into the feed from any campus), the ranking pass and
 * loadFriendReposters. Returns a Set for O(1) membership checks.
 *
 * Reports failure instead of degrading to an empty set: this set gates who
 * the viewer can see now, so an unreadable `connections` table has to fail
 * the request, the way the hidden-users read already does.
 */
async function loadViewerFollowings(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  viewerId: string,
): Promise<{ ok: true; ids: Set<string> } | { ok: false; error: unknown }> {
  const { data, error } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", viewerId);
  if (error) return { ok: false, error };
  return {
    ok: true,
    ids: new Set((data ?? []).map((r) => (r as { following_id: string }).following_id)),
  };
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
