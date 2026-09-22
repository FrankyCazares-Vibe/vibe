import { NextResponse } from "next/server";

import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const postNotFound = () =>
  NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

/**
 * Save (bookmark) a post for the current viewer. Writes to the existing
 * `bookmarks` table with collection_id=NULL — that matches the IG-style
 * Save action which doesn't ask which collection up front. Idempotent via
 * the UNIQUE(user_id, post_id) constraint.
 *
 * Only a post the caller can see: published or their own, and not a hidden
 * club's post they may not see (postAccessForCaller). Anything else is 404
 * "Post not found" with no row written, the same answer as a post that
 * doesn't exist (the insert's foreign key error is mapped to it too), so a
 * save can't confirm a hidden post exists. Unsaving (DELETE) is never
 * checked: taking your own bookmark back always works.
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

  const access = await postAccessForCaller(supabase, id, user.id, "[posts/:id/save POST post check]");
  if (!access.ok) {
    return access.reason === "error"
      ? NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 })
      : postNotFound();
  }

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

/** Unsave. Idempotent — deletes 0 rows is success. */
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
