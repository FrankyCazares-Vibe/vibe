import { NextResponse } from "next/server";

import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT = 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const requestFailed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
const postNotFound = () =>
  NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

/** The insert hit `post_comments_post_id_fkey`: the post was deleted after
 *  the check. That is a missing post, and answers like one. */
const isMissingPostFk = (e: { code?: string; message?: string } | null) =>
  e?.code === "23503" && /post_id_fkey/.test(e.message ?? "");

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
 *
 * A HIDDEN CLUB'S POST HAS NO COMMENTS for anyone but its author, the club's
 * members and platform admins (postAccessForCaller). Everyone else gets
 * exactly what a missing post gets, `{ ok: true, comments: [] }`, so the
 * thread shows as empty and the answer can't confirm the post exists.
 * `post_comments_select_authenticated` lets any student read any comment, so
 * this route has to check the post itself.
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
  // The post check runs alongside it, so a personal post waits no longer
  // than it did; nothing read here is sent until the check has passed.
  const [access, { data, error }] = await Promise.all([
    postAccessForCaller(supabase, id, user.id, "[posts/:id/comments GET post check]"),
    supabase
      .from("post_comments")
      .select(
        "id,post_id,user_id,parent_comment_id,content,created_at," +
          // Explicit FK name disambiguates the post_comments→users embed.
          "author:users!post_comments_user_id_fkey!inner(id,name,handle,avatar_url)",
      )
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);

  if (!access.ok) {
    if (access.reason === "error") return requestFailed();
    // Missing, not a post id, or a hidden club's post: the missing-post answer.
    return NextResponse.json({ ok: true, comments: [] });
  }
  if (error) {
    console.error("[posts/:id/comments GET]", error);
    return requestFailed();
  }

  const rows = (data as unknown as CommentRow[]) ?? [];
  const commentIds = rows.map((r) => r.id);

  const counts = new Map<string, number>();
  const likedByViewer = new Set<string>();

  if (commentIds.length > 0) {
    // Like counts come from the `comment_like_counts` RPC (T1): once T1's
    // policy file lands, `comment_likes` returns only the viewer's own rows,
    // so counting rows would read 0 or 1. The RPC returns numbers only, never
    // who liked. At most MAX_LIMIT (500) ids, under the RPC's 1000.
    const [likesAll, likesMine] = await Promise.all([
      supabase.rpc("comment_like_counts", { p_comment_ids: commentIds }),
      supabase
        .from("comment_likes")
        .select("comment_id")
        .in("comment_id", commentIds)
        .eq("user_id", user.id),
    ]);

    // A failed count reads 0 (today's behavior); the thread still loads.
    if (likesAll.error) {
      console.error("[posts/:id/comments like counts]", likesAll.error);
    } else {
      for (const row of (likesAll.data ?? []) as { comment_id?: unknown; like_count?: unknown }[]) {
        if (typeof row?.comment_id !== "string") continue;
        const n = Number(row.like_count);
        counts.set(row.comment_id, Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0);
      }
    }
    // Stale deploys: the table may not exist yet — degrade silently.
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

  const res = NextResponse.json({ ok: true, comments });
  // Served only because the caller is in the hidden club: keep it out of
  // shared caches, as GET /api/posts/[id] and the media route do.
  if (access.hidden) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * Insert a comment or reply.
 *
 * Only on a post the caller can see: published or their own, and not a
 * hidden club's post they may not see (postAccessForCaller). Anything else,
 * including a post deleted mid-request, is 404 "Post not found", so a
 * comment can't confirm a hidden post exists or land on one.
 */
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

  const rl = await rateLimit(`comment:${user.id}`, { limit: 30, windowSec: 300 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Commenting is a publishing surface: Terms, a verified school email, no
  // restriction in force. Same place the Terms gate held, after the limiter.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  // Checked before the body and the parent lookup, so neither can answer
  // differently for a hidden post than for a missing one.
  const access = await postAccessForCaller(
    supabase,
    id,
    user.id,
    "[posts/:id/comments POST post check]",
  );
  if (!access.ok) return access.reason === "error" ? requestFailed() : postNotFound();

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
  if (!checkText(content).ok) return contentBlockedResponse("content");

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

  if (isMissingPostFk(error)) return postNotFound();
  if (error || !row) {
    console.error("[posts/:id/comments POST]", error);
    return requestFailed();
  }

  const inserted = row as unknown as CommentRow;
  return NextResponse.json({
    ok: true,
    comment: { ...inserted, like_count: 0, viewer_liked: false, replies: [] },
  });
}
