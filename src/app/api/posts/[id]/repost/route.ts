import { NextResponse } from "next/server";

import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_COMMENT = 500;

const requestFailed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
const postNotFound = () =>
  NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

type RouteContext = { params: Promise<{ id: string }> };
type RepostBody = { comment?: unknown };

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

function readComment(body: RepostBody): { ok: true; comment: string | null } | { ok: false; res: NextResponse } {
  if (!("comment" in body) || body.comment === undefined || body.comment === null) {
    return { ok: true, comment: null };
  }
  if (typeof body.comment !== "string") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Comment must be a string" }, { status: 400 }),
    };
  }
  const trimmed = body.comment.trim();
  if (!trimmed) return { ok: true, comment: null };
  if (trimmed.length > MAX_COMMENT) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: `Comment exceeds ${MAX_COMMENT} characters` },
        { status: 400 },
      ),
    };
  }
  // The quote renders in the feed exactly like a post caption, so it is held
  // to the same word filter a post is — otherwise the refusal on a post is
  // one quote-repost away from being pointless. Both POST and PATCH come
  // through here, so editing a quote is checked too.
  if (!checkText(trimmed).ok) {
    return { ok: false, res: contentBlockedResponse("comment") };
  }
  return { ok: true, comment: trimmed };
}

/**
 * Is the caller in a block pair with the post's author, either way round? Run
 * only after postAccessForCaller has passed. That check reads `user_id` but
 * doesn't hand it back, so the author costs one more primary-key read under
 * the caller's own RLS. For a club post the author is the officer who posted,
 * the same person the feed hides on. A failed read fails closed.
 */
async function authorBlockCheck(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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
 * Is this a post the caller may repost, or edit the quote on? Published or
 * their own, not a hidden club's post they may not see (postAccessForCaller),
 * and not by someone in a block pair with them. `null` means go ahead;
 * otherwise the response to send: 404 "Post not found" for anything not
 * visible or across a block, the same as a post that doesn't exist, so a
 * repost can't confirm a hidden post exists, can't carry a blocked person's
 * post to the reposter's followers, and never tells anyone they were blocked
 * (the like route's rule).
 */
async function gatePost(
  auth: { userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> },
  id: string,
  logTag: string,
): Promise<NextResponse | null> {
  const access = await postAccessForCaller(auth.supabase, id, auth.userId, logTag);
  if (!access.ok) return access.reason === "error" ? requestFailed() : postNotFound();
  const block = await authorBlockCheck(auth.supabase, id, auth.userId, `${logTag} block-check`);
  if (block === "ok") return null;
  return block === "error" ? requestFailed() : postNotFound();
}

/**
 * Repost (with optional quote comment). Idempotent on (post_id, user_id):
 * a second POST overwrites the comment. To remove the repost, call DELETE.
 * Only on a post the caller can see (gatePost); a post deleted mid-request is
 * the same 404.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  // Reposting puts someone else's post in front of your followers, so it is
  // a publishing surface: Terms, a verified school email, no restriction in
  // force. Same place the Terms gate held.
  const publishGate = await requireCanPublish(auth.userId);
  if (publishGate) return publishGate;

  const gate = await gatePost(auth, id, "[posts/:id/repost POST post check]");
  if (gate) return gate;

  let body: RepostBody = {};
  try {
    body = (await req.json()) as RepostBody;
  } catch {
    // Empty body is fine — plain boost.
  }
  const parsed = readComment(body);
  if (!parsed.ok) return parsed.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .upsert(
      { post_id: id, user_id: auth.userId, comment: parsed.comment },
      { onConflict: "post_id,user_id" },
    );

  if (error) {
    // The post was deleted after the check: a missing post, answered as one.
    if (error.code === "23503" && /post_id_fkey/.test(error.message ?? "")) {
      return postNotFound();
    }
    console.error("[posts/:id/repost POST]", error);
    return requestFailed();
  }
  return NextResponse.json({ ok: true });
}

/** Edit your existing quote comment without changing the timestamp. Same
 *  post check as POST, so a hidden or missing post is 404 here too. */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  const publishGate = await requireCanPublish(auth.userId);
  if (publishGate) return publishGate;

  const gate = await gatePost(auth, id, "[posts/:id/repost PATCH post check]");
  if (gate) return gate;

  let body: RepostBody;
  try {
    body = (await req.json()) as RepostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = readComment(body);
  if (!parsed.ok) return parsed.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .update({ comment: parsed.comment })
    .eq("post_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[posts/:id/repost PATCH]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Un-repost. Idempotent — deleting zero rows is success. Never checks the
 *  post, like unlike and unsave: taking your own repost back always works,
 *  even on a club that has since been hidden. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .delete()
    .eq("post_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[posts/:id/repost DELETE]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
