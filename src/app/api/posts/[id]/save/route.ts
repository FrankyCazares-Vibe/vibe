import { NextResponse } from "next/server";

import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * One limiter bucket, `save:<user>`, for saves and unsaves, the way likes share
 * `like:<user>`. It fails open: it is cost control, and a bookmark notifies
 * nobody. No Terms gate: every campus screen already runs it, and a 403 here
 * would quietly undo the save on the card.
 */
const SAVE_LIMIT = { limit: 120, windowSec: 600 };
const SAVE_TOO_FAST = "You're saving too fast. Try again in a few minutes.";

const postNotFound = () =>
  NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

/**
 * Is the caller in a block pair with the post's author, either way round? Run
 * only after postAccessForCaller has passed. That check reads `user_id` but
 * doesn't hand it back, so the author costs one more primary-key read under
 * the caller's own RLS. A block answers exactly what a missing post answers,
 * as the like route does, so the blocked person is never told they were
 * blocked. A failed read fails closed.
 */
async function authorBlockCheck(
  supabase: ServerClient,
  postId: string,
  userId: string,
  logTag: string,
): Promise<"ok" | "not_found" | "error"> {
  const { data, error } = await supabase
    .from("posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();
  if (error) {
    console.error(logTag, error);
    return "error";
  }
  const authorId = (data as { user_id?: unknown } | null)?.user_id;
  // Deleted since the access check (or no author at all): a missing post.
  if (typeof authorId !== "string" || !authorId) return "not_found";
  // Your own post never reads `blocks` (loadPairBlock skips yourself).
  const pair = await loadPairBlock(supabase, userId, authorId);
  if (!pair.ok) {
    console.error(logTag, pair.error);
    return "error";
  }
  return pair.blocked ? "not_found" : "ok";
}

/**
 * Save (bookmark) a post for the current viewer. Writes to the existing
 * `bookmarks` table with collection_id=NULL — that matches the IG-style
 * Save action which doesn't ask which collection up front. Idempotent via
 * the UNIQUE(user_id, post_id) constraint.
 *
 * Only a post the caller can see: published or their own, and not a hidden
 * club's post they may not see (postAccessForCaller), and not by someone in a
 * block pair with them. Anything else is 404 "Post not found" with no row
 * written, the same answer as a post that doesn't exist (the insert's foreign
 * key error is mapped to it too), so a save can't confirm a hidden post exists
 * or tell anyone they were blocked. Unsaving (DELETE) is never checked:
 * taking your own bookmark back always works.
 */
export async function POST(_req: Request, ctx: RouteContext) {
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

  const rl = await rateLimit(`save:${user.id}`, SAVE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, SAVE_TOO_FAST);

  const access = await postAccessForCaller(supabase, id, user.id, "[posts/:id/save POST post check]");
  if (!access.ok) {
    return access.reason === "error"
      ? NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 })
      : postNotFound();
  }

  const block = await authorBlockCheck(supabase, id, user.id, "[posts/:id/save POST block-check]");
  if (block === "error") {
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (block === "not_found") return postNotFound();

  const { error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, post_id: id, collection_id: null });

  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    // The post was deleted after the check: a missing post, answered as one.
    if (error.code === "23503" && /post_id_fkey/.test(error.message ?? "")) {
      return postNotFound();
    }
    console.error("[posts/:id/save POST]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Unsave. Idempotent — deletes 0 rows is success. Shares the save bucket, so
 *  tapping save on and off can't run the limiter around. No post or block
 *  check: your own bookmark always comes back out. */
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

  const rl = await rateLimit(`save:${user.id}`, SAVE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, SAVE_TOO_FAST);

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("post_id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[posts/:id/save DELETE]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
