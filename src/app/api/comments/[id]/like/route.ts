import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { orgContentAccess } from "@/lib/orgs/hidden-org-access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadAnyPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Comment likes are written ONLY here (T2 B). Students can't insert or delete
 * `comment_likes` rows over REST (migration 20260922120000), so the limit and
 * the Terms gate below can't be skipped. The write uses the service role,
 * which skips RLS: `user_id` always comes from the session, never from the
 * request.
 *
 * The limiter bucket `like:<user>` is the same one /api/posts/[id]/like uses:
 * one budget for every like and unlike. It fails open (cost control; comment
 * likes send no notification).
 */
const LIKE_LIMIT = { limit: 120, windowSec: 600 };
const LIKE_TOO_FAST = "You're liking too fast. Try again in a few minutes.";

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
const requestFailed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

async function authorize(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: user.id, supabase };
}

/**
 * Heart a comment. Idempotent.
 *
 * The comment must sit on a post the caller can see, the same checks as a
 * post like (rulings M14): the post is published or their own (read under
 * their RLS), neither the comment's author nor the post's author is in a
 * block pair with them, and the post is not in a hidden club they may not
 * see. Every student can read every `post_comments` row today, so reading the
 * comment alone proves nothing. Each miss is the same 404 as a missing
 * comment.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing comment id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  if (!isUuid(id)) return notFound();

  const rl = await rateLimit(`like:${auth.userId}`, LIKE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, LIKE_TOO_FAST);

  const termsGate = await requireTermsAccepted(auth.userId);
  if (termsGate) return termsGate;

  const { data: comment, error: commentErr } = await auth.supabase
    .from("post_comments")
    .select("id, user_id, post_id")
    .eq("id", id)
    .maybeSingle();
  if (commentErr) {
    console.error("[comments/:id/like POST visibility]", commentErr);
    return requestFailed();
  }
  if (!comment || typeof comment.post_id !== "string") return notFound();

  const { data: post, error: postErr } = await auth.supabase
    .from("posts")
    .select("id, user_id, org_id")
    .eq("id", comment.post_id)
    .maybeSingle();
  if (postErr) {
    console.error("[comments/:id/like POST post visibility]", postErr);
    return requestFailed();
  }
  if (!post) return notFound();

  const postAuthorId = typeof post.user_id === "string" ? post.user_id : null;
  const commentAuthorId = typeof comment.user_id === "string" ? comment.user_id : null;
  if (!postAuthorId || !commentAuthorId) return notFound();

  // One read covers both authors; the caller's own id is never a peer, and no
  // peers at all (their own comment on their own post) skips the read.
  const peers = Array.from(new Set([postAuthorId, commentAuthorId])).filter(
    (uid) => uid !== auth.userId,
  );
  const pair = await loadAnyPairBlock(auth.supabase, auth.userId, peers);
  if (!pair.ok) {
    console.error("[comments/:id/like POST block-check]", pair.error);
    return requestFailed();
  }
  if (pair.blocked) return notFound();

  if (!isSupabaseServiceConfigured()) {
    console.error("[comments/:id/like POST] service role not configured");
    return requestFailed();
  }
  const service = createSupabaseServiceClient();

  if (postAuthorId !== auth.userId && typeof post.org_id === "string" && post.org_id) {
    const access = await orgContentAccess(service, post.org_id, "[comments/:id/like POST org check]");
    if (!access.allowed) return notFound();
  }

  const { error } = await service
    .from("comment_likes")
    .insert({ comment_id: id, user_id: auth.userId });

  if (error) {
    if (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[comments/:id/like POST]", error);
    return requestFailed();
  }
  return NextResponse.json({ ok: true });
}

/** Unheart a comment. Idempotent. No Terms gate: taking a like back is always
 *  allowed. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing comment id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  if (!isUuid(id)) return notFound();

  const rl = await rateLimit(`like:${auth.userId}`, LIKE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, LIKE_TOO_FAST);

  if (!isSupabaseServiceConfigured()) {
    console.error("[comments/:id/like DELETE] service role not configured");
    return requestFailed();
  }

  const { error } = await createSupabaseServiceClient()
    .from("comment_likes")
    .delete()
    .eq("comment_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[comments/:id/like DELETE]", error);
    return requestFailed();
  }
  return NextResponse.json({ ok: true });
}
