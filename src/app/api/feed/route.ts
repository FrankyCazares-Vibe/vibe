import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSchoolSystem, legacyLabel, type SchoolSystem } from "@/lib/iu/campuses";
import { resolveScopeV2, scopeCampusIds } from "@/lib/iu/campus-scope";
import {
  FOLLOWED_ORG_FILTER_CAP,
  campusScopeError,
  feedDiversityKey,
  feedLaneFor,
  feedLaneOrFilter,
  homeCampusIdFor,
  postInFeedLane,
  scoreFeedRow,
} from "@/lib/iu/community-scope";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  loadViewerFollowedOrgIds,
  loadVisibleOrgCards,
  type OrgCard,
} from "@/lib/orgs/following";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadPostEngagementCounts } from "@/lib/posts/engagement-counts";
import { loadHonestViewRows, tallyViews } from "@/lib/posts/honest-views";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/**
 * How many of the viewer's club follows are read, newest first (critic M-6).
 * Hidden clubs are dropped from these with one `.in("id", …)` read, so this
 * bounds that URL; the lane filter then keeps `FOLLOWED_ORG_FILTER_CAP`.
 */
const FOLLOWED_ORG_READ_LIMIT = 200;
/**
 * What the moderation migration adds to `posts`. Production does not have them
 * yet, so every select that asks for them is built twice: once with, and — for
 * a 42703 naming one of these two and nothing else — once without.
 */
const MODERATION_POST_COLUMNS = ["removed_at", "removed_reason"] as const;

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
  /**
   * Set by the `posts_stamp_edited` trigger when a published post's content
   * changes; null on a post that was never edited. Clients show "Edited".
   */
  edited_at?: string | null;
  /** Stamped by the `posts_stamp_campus` trigger (M1); null on legacy rows. */
  campus_id: string | null;
  /** Same trigger. Lets campus-less legacy posts be scoped by university. */
  school_system: string | null;
  /**
   * Set when a moderator took the post down. Only its author is ever served a
   * removed row (`posts_select_authenticated` is `… removed_at is null … OR
   * user_id = auth.uid()`), so these two reach the one person whose card turns
   * into "Removed by Vibe moderators" and nobody else. Optional: a deploy
   * without the moderation migration answers without them.
   */
  removed_at?: string | null;
  removed_reason?: string | null;
  author: AuthorEmbed | null;
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
 *     are global;
 *   - posts made as a club the viewer follows, wherever the club is (wave
 *     plan F4). Hidden clubs never ride in on a follow, and a blocked or
 *     muted officer's club posts stay out through the `user_id` exclusion.
 *     A viewer with no verified university gets the global lane, so the
 *     club clause adds nothing there, but a followed club still ranks up.
 *
 * CLUB NAMES come from the SERVICE client (`loadVisibleOrgCards`), never an
 * `orgs` embed under the user client: `orgs_select` hides a club from its
 * non-members, which made the embed null for exactly the followers this
 * feed now serves. A HIDDEN club's post reaches only its author, the club's
 * members and platform admins, the same people `GET /api/posts/[id]` opens it
 * for (rulings H7), and goes out to them as the author's own, with
 * `org: null` and `org_id: null` (critic Low 3). Everyone else never sees it,
 * so a card in the feed never opens to a 404. This replaces open question
 * Q4's default, which showed it to everyone as the author's own post.
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
  // muted right now), who they follow and which clubs they follow load
  // together. Both follow sets are needed EARLY — they're part of the lane
  // filter below, not just the ranking pass — so they're in this round trip.
  const [meRes, hiddenRes, followingRes, followedOrgsRes] = await Promise.all([
    // `maybeSingle`, not `single`: a viewer whose `public.users` row is
    // missing gets the same feed they get today (no campus, no university →
    // the global lane below), not a hard 500 on the app's home screen. A
    // genuine read error still fails closed — the lane depends on this row,
    // so a silent null would quietly widen the feed to every university.
    supabase.from("users").select("school,campus_id,school_system").eq("id", user.id).maybeSingle(),
    loadHiddenUsers(supabase, user.id),
    loadViewerFollowings(supabase, user.id),
    // The viewer's own follow rows, so the user client is enough. Newest
    // first and bounded (critic M-6); hidden clubs are dropped below.
    loadViewerFollowedOrgIds(supabase, user.id, { limit: FOLLOWED_ORG_READ_LIMIT }),
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
  // Same rule again for club follows: they decide which club posts reach the
  // viewer from off campus.
  if (!followedOrgsRes.ok) {
    console.error("[feed followed-orgs]", followedOrgsRes.error);
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

  // Club names and hidden-club checks go through the service client (see the
  // route docblock). Created on first use, so a feed with no club follows and
  // no club posts never needs it.
  let serviceClient: ReturnType<typeof createSupabaseServiceClient> | null = null;
  const service = () => (serviceClient ??= createSupabaseServiceClient());

  // Followed clubs that still exist and aren't hidden, newest follow first.
  // A hidden club must never pull its posts in through a follow, so this set
  // (not the raw follow rows) feeds the lane filter, the lane check and the
  // ranking boost. Failing closed matches the reads above. It runs after the
  // campus check, so a bad `?campus=` gets its 400/403 without a service read.
  let followedOrgIds: string[] = [];
  if (followedOrgsRes.ids.length > 0) {
    const visible = await loadVisibleOrgCards(service(), followedOrgsRes.ids);
    if (!visible.ok) {
      console.error("[feed followed-org cards]", visible.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    followedOrgIds = followedOrgsRes.ids.filter((id) => visible.byId.has(id));
    if (
      followedOrgsRes.ids.length === FOLLOWED_ORG_READ_LIMIT ||
      followedOrgIds.length > FOLLOWED_ORG_FILTER_CAP
    ) {
      // Only the newest FOLLOWED_ORG_FILTER_CAP ride in the lane filter. The
      // rest of what was read still reaches the viewer by campus and still
      // gets the boost; follows past the read limit get neither.
      console.warn("[feed] followed orgs truncated", {
        count: followedOrgIds.length,
        readLimitHit: followedOrgsRes.ids.length === FOLLOWED_ORG_READ_LIMIT,
      });
    }
  }
  const followedOrgSet: ReadonlySet<string> = new Set(followedOrgIds);

  const lane = feedLaneFor(scope, viewer);
  const laneFilter = feedLaneOrFilter(lane, Array.from(viewerFollowingIds), followedOrgIds);

  // Name the FK constraint explicitly (`posts_user_id_fkey`) — the implicit
  // form ambiguates in PostgREST when more than one relationship exists. The
  // `!inner` modifier upgrades the LEFT JOIN to an INNER JOIN. No `orgs`
  // embed: club names come from the service client below.
  //
  // `removed_at` / `removed_reason` ride along so the author of a post a
  // moderator took down reads the notice instead of an ordinary card. RLS is
  // what keeps that private: the removed row reaches its author and nobody
  // else, so the moderator's words go to the person they were written for.
  // Built as a function because the two columns only exist where the
  // moderation migration has been applied (see MODERATION_POST_COLUMNS).
  const buildPostsQuery = (moderation: boolean) => {
    let q = supabase
      .from("posts")
      .select(
        "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at,edited_at," +
          "campus_id,school_system," +
          (moderation ? "removed_at,removed_reason," : "") +
          "author:users!posts_user_id_fkey!inner(id,name,handle,school,campus_id,school_system,major,year,avatar_url)",
      )
      .eq("type", "post")
      .order("created_at", { ascending: false })
      .limit(candidatePoolSize);

    // The campus lane (see the route docblock). Applied before the limit, so a
    // post from another university never costs a slot on the page. Null means
    // "nothing to scope to" — a viewer with no verified university.
    if (laneFilter) {
      q = q.or(laneFilter);
    }
    if (tagFilter) {
      q = q.contains("tags", [tagFilter]);
    }
    // Blocked and muted authors are excluded in the query itself — before the
    // limit and the ranking pass — so they never take a slot on the page.
    // Keyed on the posting user, so it covers posts they made for an org too.
    if (hiddenIds.length > 0) {
      q = q.notIn("user_id", hiddenIds);
    }
    return q;
  };

  // Reposts emit no feed row (Instagram-style: the act of reposting lives on
  // the reposter's profile, plus the "X reposted this" pill on the original),
  // so the feed reads no repost rows of its own. A global read of everyone's
  // reposts used to run here only to add their originals to the count pass,
  // and nothing it returned was ever rendered; T1 closes `post_reposts` to
  // own rows, so it is gone. `school` is still returned in the response
  // payload (`viewerSchool`) for clients that surface it.
  let postsRes = await buildPostsQuery(true);
  if (postsRes.error && isMissingColumnError(postsRes.error, MODERATION_POST_COLUMNS)) {
    // A deploy without the moderation migration: the feed is exactly what it
    // was before, minus the notice nothing there can have earned yet.
    postsRes = await buildPostsQuery(false);
  }

  if (postsRes.error) {
    console.error("[feed posts]", postsRes.error);
    return NextResponse.json({ ok: false, error: postsRes.error.message }, { status: 500 });
  }

  // Belt and braces: the query already applied the lane, and this drops
  // anything that got past the filter grammar anyway. A mistake here should
  // show fewer posts, never another university's.
  const postRows = ((postsRes.data as unknown as PostRow[]) ?? []).filter((p) =>
    postInFeedLane(p, lane, viewerFollowingIds, followedOrgSet),
  );

  // The view number on a card is counted from the `post_views` ledger with
  // the post author's own views dropped. `posts.view_count` counts an author
  // refreshing their own post — `record_post_view` had no self-view guard
  // until 20260912100500 — and on the live DB 71 of 149 ledger rows were
  // self-views. The rendered posts are the only ones that need counts, views
  // or friend reposters. (A hidden club's post dropped below has its counts
  // read in the same batch and thrown away; they never leave the route.)
  const authorByPostId = new Map(postRows.map((p) => [p.id, p.user_id]));
  const renderedPostIds = Array.from(authorByPostId.keys());

  // Club attribution for the posts we render, read with the service client
  // (see the route docblock). Only visible clubs come back; a hidden club's
  // post is dropped or kept just below. A failed read fails the feed rather
  // than quietly stripping every club name (the same call as
  // `events/route.ts` makes for its hidden-org read). 0 club posts live
  // today, so this read almost never runs.
  const attrIds = Array.from(
    new Set(postRows.map((p) => p.org_id).filter((id): id is string => typeof id === "string")),
  );
  const [engagement, viewRows, attribution] = await Promise.all([
    loadEngagement(supabase, renderedPostIds, user.id),
    loadHonestViewRows(renderedPostIds, authorByPostId),
    attrIds.length > 0
      ? loadVisibleOrgCards(service(), attrIds)
      : Promise.resolve({ ok: true as const, byId: new Map<string, OrgCard>() }),
  ]);
  if (!attribution.ok) {
    console.error("[feed org attribution]", attribution.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // A HIDDEN CLUB'S POST (rulings H7). A club post whose card didn't come back
  // belongs to a hidden club. It reaches only the people `GET /api/posts/[id]`
  // opens it for: its author, the club's members and platform admins.
  // Everyone else never gets the card, so no card in the feed opens to a 404.
  // Runs only when the page holds such a post. Fails closed like the reads
  // above.
  const hiddenClubIds = attrIds.filter((id) => !attribution.byId.has(id));
  let seenHiddenClubs: ReadonlySet<string> = new Set();
  if (hiddenClubIds.length > 0) {
    const access = await loadHiddenClubAccess(service(), user.id, hiddenClubIds);
    if (!access.ok) {
      console.error("[feed hidden-club access]", access.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    seenHiddenClubs = access.orgIds;
  }
  const shownRows = postRows.filter(
    (p) =>
      !p.org_id ||
      attribution.byId.has(p.org_id) ||
      p.user_id === user.id ||
      seenHiddenClubs.has(p.org_id),
  );
  const shownPostIds = shownRows.map((p) => p.id);

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
  // Other people's repost rows need the service role (T1 closes
  // `post_reposts` to own rows). Without it the pill is skipped, never the
  // feed (rulings M13). The club reads above still need the key and fail
  // closed without it: skipping them would show club posts as personal ones.
  let friendReposters: FriendReposters = new Map();
  if (!isSupabaseServiceConfigured()) {
    console.error("[feed.loadFriendReposters] service role not configured");
  } else {
    friendReposters = await loadFriendReposters(
      supabase,
      service(),
      shownPostIds,
      viewerFollowingIds,
    );
  }

  const renderPost = (row: PostRow) => {
    const e = engagement.counts.get(row.id) ?? {
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
    };
    const fr = friendReposters.get(row.id) ?? { samples: [], totalFriends: 0 };
    const card = row.org_id ? (attribution.byId.get(row.org_id) ?? null) : null;
    return {
      // Proxy URLs for media, plus `media_kind` so the client picks the
      // right player without re-parsing the proxy URL. A post carries video
      // when its stored media_url is an R2 key under `clips/` (legacy
      // naming — it backs regular video posts, not clips).
      ...withPostMediaUrls(row),
      // A hidden club's card never goes out, even to its members, so its id
      // doesn't either (critic Low 3). `edited_at` rides the spread, and so do
      // `removed_at` / `removed_reason` on the author's own removed post.
      org_id: card ? row.org_id : null,
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
      // Keys stay `{id,handle,name,logo_url,verified,is_public}`; `hidden_at`
      // is never selected, so it can't be sent.
      org: card
        ? { ...card, logo_url: orgAssetProxyUrl(card.handle, card.logo_url, "logo") }
        : null,
    };
  };

  const postRowsOut = shownRows.map((p) => ({
    kind: "post" as const,
    sort_at: p.created_at,
    post: renderPost(p),
  }));

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
          score: scoreFeedRow(entry.post, now, viewerFollowingIds, homeCampusId, followedOrgSet),
        }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.entry)
    : postRowsOut.sort((a, b) =>
        a.sort_at < b.sort_at ? 1 : a.sort_at > b.sort_at ? -1 : 0,
      );

  // Diversity cap: no single author can dominate a page. Walk the
  // ranked list in order, skip a post once we've already seen 3 in the
  // same bucket. `feedDiversityKey` buckets a post made as a club on the
  // CLUB (two officers posting for one club share its cap) and a personal
  // post on its author. It reads the rendered `org_id`, which is already
  // null for a hidden club, so that post counts as its author's own. Never
  // key on `org_id` alone: most posts have none.
  const MAX_PER_AUTHOR = 3;
  const perAuthorCount = new Map<string, number>();
  const capped: typeof sorted = [];
  for (const entry of sorted) {
    const key = feedDiversityKey(entry.post);
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

  // Counts + viewer-state queries, in parallel. Likes and reposts come from
  // the `post_engagement_counts` RPC (T1): once T1's policy file lands,
  // `post_likes` and `post_reposts` return only the viewer's own rows, so
  // counting rows would read 0 or 1. The RPC returns numbers only, never who.
  const [likesAndReposts, commentsAll, likesMine, repostsMine, savesMine] = await Promise.all([
    loadPostEngagementCounts(supabase, postIds),
    supabase.from("post_comments").select("post_id").in("post_id", postIds),
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

  // `null` means the RPC failed (the helper logged why). Cards then show 0
  // likes and 0 reposts, what a failed count showed before; the feed itself
  // still loads.
  if (likesAndReposts === null) {
    console.error("[feed engagement counts]");
  } else {
    for (const [postId, e] of likesAndReposts) {
      const entry = ensure(postId);
      entry.like_count = e.likes;
      entry.repost_count = e.reposts;
    }
  }
  for (const row of commentsAll.data ?? []) {
    ensure((row as { post_id: string }).post_id).comment_count += 1;
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

/**
 * Which of these HIDDEN clubs may the viewer see? Their own memberships, or
 * every one of them for a platform admin: the rule `orgContentAccess` and
 * `viewerMaySeeHiddenOrg` apply (src/lib/orgs/hidden-org-access.ts), read for
 * a batch of clubs at once.
 *
 * Service role, filtered to the viewer's own id: `users.is_platform_admin`
 * is readable only with the service role. Selects only the club ids and the
 * one flag. A read error is `{ ok: false }`; the caller fails closed.
 */
async function loadHiddenClubAccess(
  service: SupabaseClient,
  viewerId: string,
  orgIds: string[],
): Promise<{ ok: true; orgIds: Set<string> } | { ok: false; error: unknown }> {
  const [memberRes, viewerRes] = await Promise.all([
    service
      .from("org_members")
      .select("org_id")
      .eq("user_id", viewerId)
      .in("org_id", orgIds),
    service
      .from("users")
      .select("is_platform_admin")
      .eq("id", viewerId)
      .maybeSingle(),
  ]);
  if (memberRes.error) return { ok: false, error: memberRes.error };
  if (viewerRes.error) return { ok: false, error: viewerRes.error };
  if ((viewerRes.data as { is_platform_admin?: unknown } | null)?.is_platform_admin === true) {
    return { ok: true, orgIds: new Set(orgIds) };
  }
  return {
    ok: true,
    orgIds: new Set((memberRes.data ?? []).map((r) => (r as { org_id: string }).org_id)),
  };
}

type FriendReposterSample = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type FriendReposters = Map<string, { samples: FriendReposterSample[]; totalFriends: number }>;

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
 *
 * Step 2 reads OTHER people's repost rows, which T1 closes to own rows, so it
 * runs on the SERVICE client. It is safe because both filters are ids this
 * route already authorized: `friendIds` are the viewer's own follow edges
 * with blocked and muted people removed, and `postIds` are posts the viewer's
 * RLS returned. It selects ids and a timestamp only. The `users` read in step
 * 3 stays on the viewer's client.
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
  service: SupabaseClient,
  postIds: string[],
  viewerFollowingIds: Set<string>,
): Promise<FriendReposters> {
  const out: FriendReposters = new Map();
  if (postIds.length === 0) return out;

  const friendIds = Array.from(viewerFollowingIds);
  if (friendIds.length === 0) return out;

  const { data: friendRepostRows, error: rrErr } = await service
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
