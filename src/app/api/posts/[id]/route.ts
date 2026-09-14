import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  extractMentionHandles,
  insertMentionNotifications,
  resolveMentionedUserIds,
} from "@/lib/mentions";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadHonestViewRows } from "@/lib/posts/honest-views";
import { CLIP_KEY_PREFIX, getR2S3Client, isR2Configured } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

const MAX_CONTENT_CHARS = 2000;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Single post fetch for the viewer modal (P1-015). Returns the post + author
 * + counts (likes, comments, views, reposts, saves) + viewer-relative state
 * (liked, saved) + `is_owner`. One roundtrip on modal open instead of three.
 *
 * WHY `is_owner` IS COMPUTED HERE. Both post viewers used to be told who the
 * author was by their caller — `PostViewerMobile` takes a `canDelete` prop and
 * only ProfileMobile passes it, so on the feed and on a shared link the viewer
 * did not know it was looking at its own post. An owner-only affordance ("who
 * saw this") cannot be built on a flag the caller forgets to pass, so the
 * server that already knows says so.
 *
 * WHY `counts.views` IS NOT `posts.view_count`. The stored counter includes
 * the author refreshing their own post (`record_post_view` had no self-view
 * guard until 20260912100500; 71 of 149 live ledger rows were self-views), so
 * the number here is tallied from the `post_views` ledger with the author's
 * own rows dropped — the same figure the feed card shows. See
 * src/lib/posts/honest-views.ts.
 *
 * `counts.saves` is OPTIONAL: the key is omitted, never sent as 0, when the
 * bookmarks count cannot be read. Zero saves and an unreadable count are
 * different claims and the client has to be able to tell them apart.
 *
 * `counts.saves` COUNTS OTHER PEOPLE — the author's own bookmark is excluded
 * (see loadSaveCount) so it can never disagree by one with the savers list at
 * /api/me/posts/[id]/savers, which excludes it too. `viewer.saved` below is
 * the caller's OWN bookmark and carries no such exclusion, so for the author
 * the two move independently: an owner who taps Save flips `viewer.saved` to
 * true while `counts.saves` stays where it was. That is correct — "12 saves"
 * means twelve other people — but it means a client MUST NOT optimistically
 * bump `counts.saves` on a Save tap when `is_owner` is true, or the number it
 * paints will be contradicted by the very next fetch.
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
      // `view_count` is read only as the fallback below and is stripped off
      // the post before it ships — nothing should render the inflated counter.
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        // Explicit FK name disambiguates the posts→users embed; see /api/feed for context.
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[posts/:id GET]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }

  // The concatenated select string defeats Supabase's row typing
  // (GenericStringError); cast through unknown. `view_count` comes off here so
  // the inflated stored counter never reaches a client — `counts.views` below
  // is the honest number.
  const { view_count: storedViewCount, ...postFields } = row as unknown as {
    view_count: number | null;
  } & Record<string, unknown>;
  const post = postFields as { id: string; user_id: string } & Record<string, unknown>;
  const authorId = String(post.user_id);

  // Counts + viewer state in parallel — small queries, cheap to fan out.
  const [
    likeCountRes,
    commentCountRes,
    repostCountRes,
    viewerLikeRes,
    viewerSaveRes,
    viewRows,
    saveCount,
  ] = await Promise.all([
    supabase
      .from("post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", id),
    supabase
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id),
    supabase
      .from("post_reposts")
      .select("post_id", { count: "exact", head: true })
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
    // Honest views: the ledger, with this post's author's own rows dropped.
    loadHonestViewRows([id], new Map([[id, authorId]])),
    loadSaveCount(id, authorId),
  ]);

  // `null` from the ledger means "we could not read it", not "nobody looked".
  // A single post is a secondary number on a screen whose job is the post
  // itself, so this makes the same call /api/feed:251 does and keeps showing
  // the stored counter rather than failing the fetch — which means the number
  // can fall back to one that still INCLUDES the author's own self-views. The
  // metrics screens make the opposite call (creator-stats 500s) because there
  // the number is the product.
  const views = viewRows === null ? (storedViewCount ?? 0) : viewRows.length;

  return NextResponse.json({
    ok: true,
    post: withPostMediaUrls(post),
    is_owner: authorId === user.id,
    counts: {
      likes:    likeCountRes.count ?? 0,
      comments: commentCountRes.count ?? 0,
      views,
      reposts:  repostCountRes.count ?? 0,
      // Omitted, not zeroed, when the count could not be read.
      ...(saveCount === null ? {} : { saves: saveCount }),
    },
    viewer: {
      liked: (viewerLikeRes.count ?? 0) > 0,
      saved: (viewerSaveRes.count ?? 0) > 0,
    },
  });
}

/**
 * How many people saved this post. `null` means "we could not read it", which
 * the caller turns into an ABSENT key rather than a 0.
 *
 * Service role because `bookmarks` RLS is `bookmarks_all_own` — owner of the
 * bookmark — so a cookie-client count returns 1 or 0 (the caller's own save)
 * however many people saved it. Head-only: the count crosses the wire, never a
 * row, so no identity can escape here. Who saved it is the owner-only, paid
 * surface and lives in /api/me/posts/[id]/savers.
 *
 * The author's own bookmark is excluded, exactly as the savers list and
 * creator-stats exclude it, so the count and the list can never disagree by
 * one — and so "12 saves" means twelve other people, the same rule the view
 * numbers got in b3f23df.
 */
async function loadSaveCount(postId: string, authorId: string): Promise<number | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const { count, error } = await createSupabaseServiceClient()
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .neq("user_id", authorId);
  if (error) {
    console.error("[posts/:id GET saves]", error);
    return null;
  }
  return count ?? 0;
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Best-effort R2 cleanup for any post whose media is an R2 video object.
  // The `clips/` prefix is legacy naming — it backs regular video posts.
  if (isR2Configured()) {
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

/**
 * PATCH a post — used for re-saving + publishing drafts. The author can
 * update: content, status (draft → published). Missing fields are left
 * alone.
 *
 * If the status flips from draft → published, we fan out @mention
 * notifications just like publish-post does on the initial publish.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
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

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: {
    content?: unknown;
    status?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Read the row first to confirm ownership + capture the prior status.
  const { data: prior, error: readErr } = await supabase
    .from("posts")
    .select("id,user_id,status,content")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[posts/:id PATCH read]", readErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!prior) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  if (prior.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Not your post" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.content === "string") {
    const trimmed = body.content.trim();
    if (trimmed.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Caption exceeds ${MAX_CONTENT_CHARS} characters` },
        { status: 400 },
      );
    }
    patch.content = trimmed;
  }

  let didPublish = false;
  if (typeof body.status === "string") {
    if (body.status !== "draft" && body.status !== "published") {
      return NextResponse.json(
        { ok: false, error: "Invalid status" },
        { status: 400 },
      );
    }
    patch.status = body.status;
    if (body.status === "published" && prior.status === "draft") {
      didPublish = true;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, post: prior });
  }

  const { data: row, error: upErr } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", id)
    .select(
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,status,created_at",
    )
    .single();
  if (upErr || !row) {
    console.error("[posts/:id PATCH]", upErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // First-publish mention fan-out — only fires when the draft is being
  // promoted to published this very PATCH. Subsequent edits to a
  // published post don't re-notify anyone.
  if (didPublish) {
    const finalContent =
      typeof patch.content === "string" ? (patch.content as string) : (prior.content ?? "");
    if (finalContent) {
      const handles = extractMentionHandles(finalContent);
      if (handles.length > 0) {
        try {
          const ids = await resolveMentionedUserIds(supabase, handles, user.id);
          if (ids.length > 0) {
            await insertMentionNotifications(supabase, {
              actorId: user.id,
              targetUserIds: ids,
              kind: "post",
              postId: row.id as string,
            });
          }
        } catch (e) {
          console.error("[posts/:id PATCH mentions]", e);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, post: withPostMediaUrls(row) });
}
