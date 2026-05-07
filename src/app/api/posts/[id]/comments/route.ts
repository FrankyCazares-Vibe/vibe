import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT = 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ id: string }> };
type CommentBody = { content?: unknown; parent_comment_id?: unknown };

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

/**
 * Comments thread for a post. Returns top-level comments (parent_comment_id
 * IS NULL) with their direct replies nested under `replies`. Each comment
 * carries `like_count` and `viewer_liked` so the client can render the
 * heart UI without a second roundtrip.
 *
 * Threading is one level deep — replies of replies are flattened into the
 * same parent's reply list. Matches Instagram/Twitter conventions.
 */
export async function GET(req: Request, ctx: RouteContext) {
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

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // Fetch ALL comments for the post in one query (top-level + replies),
  // then build the tree client-side. Cheaper than two queries when threads
  // are small (<200 comments per post is the v1 working assumption).
  const { data, error } = await supabase
    .from("post_comments")
    .select(
      "id,post_id,user_id,parent_comment_id,content,created_at," +
        // Explicit FK name disambiguates the post_comments→users embed.
        "author:users!post_comments_user_id_fkey!inner(id,name,handle,avatar_url)",
    )
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[posts/:id/comments GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data as unknown as CommentRow[]) ?? [];
  const commentIds = rows.map((r) => r.id);

  const counts = new Map<string, number>();
  const likedByViewer = new Set<string>();

  if (commentIds.length > 0) {
    const [likesAll, likesMine] = await Promise.all([
      supabase.from("comment_likes").select("comment_id").in("comment_id", commentIds),
      supabase
        .from("comment_likes")
        .select("comment_id")
        .in("comment_id", commentIds)
        .eq("user_id", user.id),
    ]);

    // Stale deploys: tables may not exist yet — degrade silently.
    if (!likesAll.error) {
      for (const row of likesAll.data ?? []) {
        const cid = (row as { comment_id: string }).comment_id;
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
    }
    if (!likesMine.error) {
      for (const row of likesMine.data ?? []) {
        likedByViewer.add((row as { comment_id: string }).comment_id);
      }
    }
  }

  const decorate = (row: CommentRow) => ({
    ...row,
    like_count: counts.get(row.id) ?? 0,
    viewer_liked: likedByViewer.has(row.id),
  });

  // Walk rows in chronological order; top-level (parent_comment_id null)
  // become roots, others get attached as replies under whichever existing
  // root is their ancestor. If a reply's parent points at another reply
  // (deeper than one level), we still attach it to the top-level ancestor
  // so the wire shape stays flat.
  const rootById = new Map<string, ReturnType<typeof decorate> & { replies: ReturnType<typeof decorate>[] }>();
  const parentToRoot = new Map<string, string>();

  for (const r of rows) {
    if (r.parent_comment_id === null) {
      const decorated = { ...decorate(r), replies: [] as ReturnType<typeof decorate>[] };
      rootById.set(r.id, decorated);
      parentToRoot.set(r.id, r.id);
    }
  }
  for (const r of rows) {
    if (r.parent_comment_id !== null) {
      const rootId = parentToRoot.get(r.parent_comment_id);
      if (!rootId) continue; // orphaned — parent was deleted
      const root = rootById.get(rootId);
      if (root) {
        root.replies.push(decorate(r));
        parentToRoot.set(r.id, rootId);
      }
    }
  }

  const comments = Array.from(rootById.values());

  return NextResponse.json({ ok: true, comments });
}

/** Insert a comment or reply. */
export async function POST(req: Request, ctx: RouteContext) {
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

  let body: CommentBody;
  try {
    body = (await req.json()) as CommentBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "Comment is empty" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json(
      { ok: false, error: `Comment exceeds ${MAX_CONTENT} characters` },
      { status: 400 },
    );
  }

  const parentId =
    typeof body.parent_comment_id === "string" && body.parent_comment_id.trim()
      ? body.parent_comment_id.trim()
      : null;

  // If a parent was passed, verify it belongs to this post and is itself
  // top-level. Replies always nest under the original commenter, even when
  // the user clicks Reply on someone else's reply (flat threading).
  let resolvedParentId: string | null = null;
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("post_comments")
      .select("id,post_id,parent_comment_id")
      .eq("id", parentId)
      .maybeSingle();
    if (parentErr || !parent) {
      return NextResponse.json(
        { ok: false, error: "Parent comment not found" },
        { status: 400 },
      );
    }
    if (parent.post_id !== id) {
      return NextResponse.json(
        { ok: false, error: "Parent comment belongs to a different post" },
        { status: 400 },
      );
    }
    resolvedParentId = parent.parent_comment_id ?? parent.id;
  }

  const { data: row, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: id,
      user_id: user.id,
      content,
      parent_comment_id: resolvedParentId,
    })
    .select(
      "id,post_id,user_id,parent_comment_id,content,created_at," +
        "author:users!post_comments_user_id_fkey!inner(id,name,handle,avatar_url)",
    )
    .single();

  if (error || !row) {
    console.error("[posts/:id/comments POST]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  const inserted = row as unknown as CommentRow;
  return NextResponse.json({
    ok: true,
    comment: { ...inserted, like_count: 0, viewer_liked: false, replies: [] },
  });
}
