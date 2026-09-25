import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { orgContentAccess } from "@/lib/orgs/hidden-org-access";
import { isUuid } from "@/lib/pgrest";
import { kickPushDrain } from "@/lib/push/dispatch";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Likes are written ONLY here and in /api/comments/[id]/like (T2 B). Students
 * can't insert or delete `post_likes` rows over REST (migration
 * 20260922120000), so the limit and the Terms gate below can't be skipped.
 * The write uses the service role, which skips RLS: `user_id` always comes
 * from the session, never from the request.
 *
 * One limiter bucket, `like:<user>`, is shared by post likes, post unlikes,
 * comment likes and comment unlikes. It fails open, like follow and comment:
 * it is cost control here, and the one-notification-per-pair rule in
 * notify_on_like_insert is the abuse control.
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
 * Like a post. Idempotent — duplicate POST returns 200 with `already: true`.
 *
 * The post must be one the caller can see: published or their own (read
 * under their RLS), not by someone in a block pair with them, and not in a
 * hidden club they may not see (rulings M14). Each of those is the same 404
 * as a missing post, so a like can't confirm a post exists or notify across a
 * block.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  if (!isUuid(id)) return notFound();

  const rl = await rateLimit(`like:${auth.userId}`, LIKE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, LIKE_TOO_FAST);

  const termsGate = await requireTermsAccepted(auth.userId);
  if (termsGate) return termsGate;

  const { data: post, error: postErr } = await auth.supabase
    .from("posts")
    .select("id, user_id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (postErr) {
    console.error("[posts/:id/like POST visibility]", postErr);
    return requestFailed();
  }
  if (!post) return notFound();

  if (!isSupabaseServiceConfigured()) {
    console.error("[posts/:id/like POST] service role not configured");
    return requestFailed();
  }
  const service = createSupabaseServiceClient();

  const authorId = typeof post.user_id === "string" ? post.user_id : null;
  if (authorId !== auth.userId) {
    if (!authorId) return notFound();
    const pair = await loadPairBlock(auth.supabase, auth.userId, authorId);
    if (!pair.ok) {
      console.error("[posts/:id/like POST block-check]", pair.error);
      return requestFailed();
    }
    if (pair.blocked) return notFound();

    if (typeof post.org_id === "string" && post.org_id) {
      const access = await orgContentAccess(service, post.org_id, "[posts/:id/like POST org check]");
      if (!access.allowed) return notFound();
    }
  }

  const { error } = await service
    .from("post_likes")
    .insert({ post_id: id, user_id: auth.userId });

  if (error) {
    if (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[posts/:id/like POST]", error);
    return requestFailed();
  }
  // trg_notify_on_like writes the like notification (once per liker and post,
  // never on your own post), and the notifications trigger queues its push;
  // drain it after the response. Returns at once and never throws.
  kickPushDrain();
  return NextResponse.json({ ok: true });
}

/** Unlike. Idempotent — deleting zero rows is success. No Terms gate, the same
 *  as the repost route's DELETE: taking something back is always allowed. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  if (!isUuid(id)) return notFound();

  const rl = await rateLimit(`like:${auth.userId}`, LIKE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, LIKE_TOO_FAST);

  if (!isSupabaseServiceConfigured()) {
    console.error("[posts/:id/like DELETE] service role not configured");
    return requestFailed();
  }

  const { error } = await createSupabaseServiceClient()
    .from("post_likes")
    .delete()
    .eq("post_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[posts/:id/like DELETE]", error);
    return requestFailed();
  }
  return NextResponse.json({ ok: true });
}
