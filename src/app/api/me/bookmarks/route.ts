import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Returns posts the signed-in user has saved (bookmarks), newest-saved
 * first. Used to hydrate the Saved tab on the profile (P1-015 follow-on).
 *
 * Joins the post + author so the grid can paint without a second roundtrip.
 * Bookmarks are author-agnostic — you can save anyone's post — so the
 * embed has to walk bookmarks → posts → users explicitly via FK names
 * (PostgREST otherwise ambiguates between the bookmark's user_id and the
 * post's user_id).
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

  const { data, error } = await supabase
    .from("bookmarks")
    .select(
      "id,created_at," +
        "post:posts!bookmarks_post_id_fkey!inner(" +
          "id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at," +
          "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)" +
        ")",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[me/bookmarks GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Flatten — callers want a list of posts with a `saved_at` timestamp,
  // not a list of bookmark rows. Supabase's generated types for embedded
  // resources are a union that includes error shapes; cast through unknown.
  type Row = { id: string; created_at: string; post: Record<string, unknown> | null };
  const rows = (data ?? []) as unknown as Row[];
  const posts = rows
    .filter((r) => r.post != null)
    .map((r) => ({ ...r.post, saved_at: r.created_at }));

  return NextResponse.json({ ok: true, posts });
}
