import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Returns the signed-in user's notifications, newest first. Joins each
 * row with the actor (who did the thing) and the post excerpt (when
 * relevant) so Otto can render readable rows without follow-up fetches.
 *
 * "Recent" includes both unread and recently-read so the user can scan
 * what just happened. Marking-as-read happens via POST mark-read.
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
    .from("notifications")
    .select(
      "id,type,post_id,comment_id,read_at,created_at," +
        // Explicit FK names disambiguate the actor + post + comment embeds.
        "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
        "post:posts!notifications_post_id_fkey(id,type,content,media_thumbnail_url)," +
        // Comment text — only present on type='comment' rows. Surfaces
        // *what* they said so the user can scan replies in the panel.
        "comment:post_comments!notifications_comment_id_fkey(id,content)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[me/notifications GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notifications: data ?? [] });
}
