import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { loadVisibleOrgCards, type OrgCard } from "@/lib/orgs/following";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadHonestViewRows, tallyViews } from "@/lib/posts/honest-views";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ handle: string }> };

type EmbeddedOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
} | null;

type EmbeddedAuthor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
} | null;

type EmbeddedPost = {
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
  author: EmbeddedAuthor;
  org: EmbeddedOrg;
};

/** A repost as the service read returns it. The reposter is always the target. */
type RepostRow = {
  post_id: string;
  comment: string | null;
  created_at: string;
};

const failed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

/**
 * Reposts by a user, newest first. Each row carries the embedded original
 * post so the profile pane can render it inline (matching the campus feed
 * repost banner shape).
 *
 * WHO SEES THE LIST. Reposting is an act on your own profile, so any
 * signed-in student can see someone's reposts, EXCEPT across a block in
 * either direction: then the list is empty, the same answer as a student who
 * never reposted. A block check that can't run is a 500, never "not blocked".
 * A repost of a post by someone the viewer is blocked with either way, or has
 * muted, is left out, the same authors the feed leaves out.
 *
 * WHY THE SERVICE ROLE (T1). T1 closes `post_reposts` to each student's own
 * rows, so the viewer's client can only read their own reposts. The repost
 * rows are read with the service role, AFTER the block check, filtered to the
 * target's id, and only the post id, the quote and the time are selected. The
 * ORIGINALS are then read with the viewer's client, so the viewer's RLS still
 * drops drafts, exactly as the old `!inner` embed did. A failed read is now a
 * 500 instead of a quietly empty tab.
 *
 * HIDDEN CLUBS (rulings H7). An original made as a club carries `org`. Under
 * the viewer's client `orgs_select` answers null for a hidden club (unless the
 * viewer is in it) and ALSO for a private one the viewer isn't in, and those
 * two must be told apart: a private club's posts are public, a hidden club's
 * are not. So a null `org` is filled from `loadVisibleOrgCards` (service role,
 * hidden clubs left out), the same club card the feed shows. A repost whose
 * club is still missing after that is dropped: the club is hidden to this
 * viewer (or gone), and its post must not show up as a personal one here.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: target, error: tErr } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (tErr) {
    console.error("[users/:handle/reposts target]", tErr);
    return failed();
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // (a) Blocked either way: an empty list, before any repost row is read.
  // The viewer's own client (policy blocks_select_either); self never blocks.
  // The people whose posts the viewer shouldn't see (blocked either way,
  // muted right now) load alongside: their originals drop out in (d), the
  // same authors the feed leaves out. Both fail closed.
  const [pair, hiddenRes] = await Promise.all([
    loadPairBlock(supabase, user.id, target.id),
    loadHiddenUsers(supabase, user.id),
  ]);
  if (!pair.ok) {
    console.error("[users/:handle/reposts block]", pair.error);
    return failed();
  }
  if (pair.blocked) {
    return NextResponse.json({ ok: true, reposts: [] });
  }
  if (!hiddenRes.ok) {
    console.error("[users/:handle/reposts hidden-users]", hiddenRes.error);
    return failed();
  }
  const hiddenAuthors = new Set(hiddenRes.hidden.ids);

  if (!isSupabaseServiceConfigured()) {
    console.error("[users/:handle/reposts] service role not configured");
    return failed();
  }
  const service = createSupabaseServiceClient();

  // (b) The target's repost rows. Service role (see the docblock), filtered
  // to the target, ids and the quote only.
  const { data: repostData, error: repostErr } = await service
    .from("post_reposts")
    .select("post_id,comment,created_at")
    .eq("user_id", target.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (repostErr) {
    console.error("[users/:handle/reposts]", repostErr);
    return failed();
  }
  const repostRows = (repostData ?? []) as RepostRow[];
  if (repostRows.length === 0) {
    return NextResponse.json({ ok: true, reposts: [] });
  }

  // (c) The originals, with the VIEWER's client: RLS drops drafts. Clips are
  // backlogged — a repost of a clip must not surface here.
  const ids = Array.from(new Set(repostRows.map((r) => r.post_id)));
  const { data: postData, error: postErr } = await supabase
    .from("posts")
    .select(
      "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        "author:users!posts_user_id_fkey(id,name,handle,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)",
    )
    .in("id", ids)
    .eq("type", "post");
  if (postErr) {
    console.error("[users/:handle/reposts posts]", postErr);
    return failed();
  }
  const postById = new Map<string, EmbeddedPost>();
  for (const p of (postData as unknown as EmbeddedPost[]) ?? []) postById.set(p.id, p);

  // Club posts whose `org` came back null: private (fill in the card) or
  // hidden (drop the repost). See the docblock. Fails closed.
  const unnamedOrgIds = new Set<string>();
  for (const p of postById.values()) {
    if (p.org_id && !p.org) unnamedOrgIds.add(p.org_id);
  }
  let visibleCards = new Map<string, OrgCard>();
  if (unnamedOrgIds.size > 0) {
    const cards = await loadVisibleOrgCards(service, Array.from(unnamedOrgIds));
    if (!cards.ok) {
      console.error("[users/:handle/reposts org cards]", cards.error);
      return failed();
    }
    visibleCards = cards.byId;
  }

  // (d) Join in repost order. A repost whose original didn't come back (a
  // draft, a clip, a deleted post), whose author the viewer blocked, was
  // blocked by or muted, or whose club is hidden to this viewer is dropped.
  const rows: { repost: RepostRow; post: EmbeddedPost }[] = [];
  for (const r of repostRows) {
    const p = postById.get(r.post_id);
    if (!p || hiddenAuthors.has(p.user_id)) continue;
    const org: EmbeddedOrg = p.org ?? (p.org_id ? (visibleCards.get(p.org_id) ?? null) : null);
    if (p.org_id && !org) continue;
    rows.push({ repost: r, post: { ...p, org } });
  }

  // View counts come from the `post_views` ledger with each post author's own
  // views dropped. `posts.view_count` counts an author refreshing their own
  // post — `record_post_view` had no self-view guard until 20260912100500 —
  // so the stored number runs high (71 of 149 live ledger rows were
  // self-views). If the ledger can't be read we keep showing the stored
  // counter rather than a 0 the data doesn't support, same as the feed.
  const authorByPostId = new Map<string, string>();
  for (const { post: p } of rows) {
    authorByPostId.set(p.id, p.user_id);
  }
  const viewedPostIds = Array.from(authorByPostId.keys());
  const viewRows = await loadHonestViewRows(viewedPostIds, authorByPostId);
  const honestViews = viewRows === null ? null : tallyViews(viewRows, viewedPostIds);

  const reposts = rows.map(({ repost: r, post: p }) => {
    const org = p.org ?? null;
    return {
      post_id: r.post_id,
      comment: r.comment,
      reposted_at: r.created_at,
      post: {
        ...withPostMediaUrls(p),
        view_count: honestViews ? (honestViews.get(p.id) ?? 0) : (p.view_count ?? 0),
        org: org
          ? { ...org, logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo") }
          : null,
      },
    };
  });

  return NextResponse.json({ ok: true, reposts });
}
