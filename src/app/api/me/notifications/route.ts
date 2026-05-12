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

  // Pull the post's author handle so mention rows can route the click
  // to /profile/<authorHandle>?post=<id> — landing the mentionee on the
  // post in its actual context instead of dropping them onto their own
  // profile with the post-viewer query param.
  //
  // Try the full select first (includes message_id from the mention
  // migration). If that column isn't in the DB yet (deploy lag), fall
  // back to the older shape so the panel still renders.
  const FULL_SELECT =
    "id,type,post_id,comment_id,message_id,read_at,created_at," +
    "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
    "post:posts!notifications_post_id_fkey(id,type,content,media_thumbnail_url,author:users!posts_user_id_fkey(handle))," +
    "comment:post_comments!notifications_comment_id_fkey(id,content)";
  const FALLBACK_SELECT =
    "id,type,post_id,comment_id,read_at,created_at," +
    "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
    "post:posts!notifications_post_id_fkey(id,type,content,media_thumbnail_url,author:users!posts_user_id_fkey(handle))," +
    "comment:post_comments!notifications_comment_id_fkey(id,content)";

  let { data, error } = await supabase
    .from("notifications")
    .select(FULL_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error && /message_id|column .* does not exist/i.test(error.message ?? "")) {
    const fb = await supabase
      .from("notifications")
      .select(FALLBACK_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    data = fb.data;
    error = fb.error;
  }

  if (error) {
    console.error("[me/notifications GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notifications: data ?? [] });
}
