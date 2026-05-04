import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Single post fetch for the viewer modal (P1-015). Returns the post + author
 * + counts (likes, comments) + viewer-relative state (liked, saved). One
 * roundtrip on modal open instead of three.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("posts")
    .select(
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at," +
        "author:users!inner(id,name,handle,school,major,year,avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[posts/:id GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }

  // Counts + viewer state in parallel — small queries, cheap to fan out.
  const [likeCountRes, commentCountRes, viewerLikeRes, viewerSaveRes] = await Promise.all([
    supabase
      .from("post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", id),
    supabase
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id),
    supabase
      .from("post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("user_id", user.id),
    supabase
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("user_id", user.id),
  ]);

  return NextResponse.json({
    ok: true,
    post: row,
    counts: {
      likes:    likeCountRes.count ?? 0,
      comments: commentCountRes.count ?? 0,
    },
    viewer: {
      liked: (viewerLikeRes.count ?? 0) > 0,
      saved: (viewerSaveRes.count ?? 0) > 0,
    },
  });
}
