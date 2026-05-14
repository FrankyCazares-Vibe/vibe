import { NextResponse } from "next/server";

import { CLIP_KEY_PREFIX, getR2S3Client, isR2Configured } from "@/lib/r2";
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
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,edit_metadata,created_at," +
        // Explicit FK name disambiguates the posts→users embed; see /api/feed for context.
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)",
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

/**
 * Delete a post or clip. RLS (`posts_delete_own`) enforces author-only —
 * a non-owner DELETE returns 0 rows affected, which we treat as 404 to
 * avoid leaking existence.
 *
 * Side-effects:
 *  - post_likes / post_comments / bookmarks rows cascade automatically
 *    via ON DELETE CASCADE on their foreign keys.
 *  - Clip videos in R2 are deleted best-effort. Failures don't block the
 *    DB delete — orphaned R2 objects can be swept by a lifecycle policy
 *    later if needed.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
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

  // Read first so we can also clean up R2 storage if it's a clip. The
  // SELECT respects RLS too, so a non-owner can't even see other users'
  // posts here — but the public read policy (posts_select_authenticated)
  // means any signed-in user CAN see them, so we re-check ownership
  // explicitly before issuing the delete.
  const { data: row, error: readErr } = await supabase
    .from("posts")
    .select("id,user_id,type,media_url")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[posts/:id DELETE read]", readErr);
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Not your post" }, { status: 403 });
  }

  const { error: delErr } = await supabase.from("posts").delete().eq("id", id);
  if (delErr) {
    console.error("[posts/:id DELETE]", delErr);
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  // Best-effort R2 cleanup — only for clips, only if the key looks valid.
  if (row.type === "clip" && isR2Configured()) {
    const key = String(row.media_url || "").trim();
    if (key.startsWith(CLIP_KEY_PREFIX) && !key.includes("..")) {
      try {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const bucket = process.env.R2_BUCKET_NAME?.trim();
        if (bucket) {
          await getR2S3Client().send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          );
        }
      } catch (e) {
        // Don't fail the request — DB delete already succeeded. Log it
        // so we know if storage drifts from the DB.
        console.error("[posts/:id DELETE r2]", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
