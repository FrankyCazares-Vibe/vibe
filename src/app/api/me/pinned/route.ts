import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { post_id?: unknown };

/**
 * Set or clear the signed-in user's pinned post.
 *   { post_id: "<uuid>" } → pin that post (must be authored by viewer)
 *   { post_id: null }     → unpin
 *
 * Pinning someone else's post is intentionally rejected — the pin slot
 * on the profile is "this is what I want people to see first about me",
 * not a curated repost.
 */
export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.post_id;
  if (raw === null) {
    // Unpin
    const { error } = await supabase
      .from("users")
      .update({ pinned_post_id: null })
      .eq("id", user.id);
    if (error) {
      console.error("[me/pinned PATCH unpin]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pinned_post_id: null });
  }

  if (typeof raw !== "string" || raw.length === 0) {
    return NextResponse.json(
      { ok: false, error: "post_id must be a string or null" },
      { status: 400 },
    );
  }

  // Verify ownership before pinning — RLS doesn't gate updates to a FK
  // column by the referenced row's owner. Defensive read.
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id,user_id")
    .eq("id", raw)
    .maybeSingle();
  if (postErr) {
    console.error("[me/pinned PATCH post]", postErr);
    return NextResponse.json({ ok: false, error: postErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  if (post.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You can only pin your own posts" }, { status: 403 });
  }

  const { error: upErr } = await supabase
    .from("users")
    .update({ pinned_post_id: raw })
    .eq("id", user.id);
  if (upErr) {
    console.error("[me/pinned PATCH update]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinned_post_id: raw });
}
