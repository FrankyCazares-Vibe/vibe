import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadHonestViewRows, tallyViews } from "@/lib/posts/honest-views";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

type RepostRow = {
  post_id: string;
  user_id: string;
  comment: string | null;
  created_at: string;
  post: EmbeddedPost | null;
};

/**
 * Reposts by a user, newest first. Each row carries the embedded original
 * post so the profile pane can render it inline (matching the campus feed
 * repost banner shape).
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const { data, error } = await supabase
    .from("post_reposts")
    .select(
      "post_id,user_id,comment,created_at," +
        "post:posts!inner(" +
        "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        "author:users!posts_user_id_fkey(id,name,handle,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)" +
        ")",
    )
    .eq("user_id", target.id)
    // Clips are backlogged — a repost of a clip must not surface here.
    .eq("post.type", "post")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Table may not exist yet on a stale deploy — degrade to empty list.
    console.error("[users/:handle/reposts]", error);
    return NextResponse.json({ ok: true, reposts: [] });
  }

  const rows = ((data as unknown as RepostRow[]) ?? []).filter((r) => r.post);

  // View counts come from the `post_views` ledger with each post author's own
  // views dropped. `posts.view_count` counts an author refreshing their own
  // post — `record_post_view` had no self-view guard until 20260912100500 —
  // so the stored number runs high (71 of 149 live ledger rows were
  // self-views). If the ledger can't be read we keep showing the stored
  // counter rather than a 0 the data doesn't support, same as the feed.
  const authorByPostId = new Map<string, string>();
  for (const r of rows) {
    const p = r.post as EmbeddedPost;
    authorByPostId.set(p.id, p.user_id);
  }
  const viewedPostIds = Array.from(authorByPostId.keys());
  const viewRows = await loadHonestViewRows(viewedPostIds, authorByPostId);
  const honestViews = viewRows === null ? null : tallyViews(viewRows, viewedPostIds);

  const reposts = rows.map((r) => {
    const p = r.post as EmbeddedPost;
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
