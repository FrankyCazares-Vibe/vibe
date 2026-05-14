import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Returns the signed-in user's own posts + clips, newest first, so profile
 * surfaces (P1-011 grid + P1-015/016 viewers) can hydrate from Supabase
 * instead of localStorage. Read-only — no joins needed since the viewer
 * already has their own identity in vibe_user_v1.
 */
export async function GET(req: Request) {
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

  // Drafts stay out of the profile grid — they live exclusively in the
  // composer's Drafts box. Owners can still see their own drafts there
  // via /api/me/clip-drafts.
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,edit_metadata,created_at",
    )
    .eq("user_id", user.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[me/posts]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, posts: data ?? [] });
}
