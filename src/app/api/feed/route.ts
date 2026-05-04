import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Campus feed — posts from users at the same school as the viewer, newest
 * first. Returns each row joined with the author's identity so the existing
 * campus.html render shape (avatar, name, role) can be reproduced without
 * a second roundtrip per post.
 *
 * If the viewer has no `school` set (incomplete onboarding), returns their
 * own posts only — better than a blank feed during dev.
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

  // Resolve viewer's school first — drives the scope filter.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("school")
    .eq("id", user.id)
    .single();
  if (meErr) {
    console.error("[feed me]", meErr);
    return NextResponse.json({ ok: false, error: meErr.message }, { status: 500 });
  }

  const school = (me?.school ?? "").trim();

  // Name the FK constraint explicitly (`posts_user_id_fkey`) — the
  // implicit `users!inner(...)` form ambiguates in PostgREST when more
  // than one relationship path exists between posts and users in the
  // relationship graph (the public.users.id ← auth.users.id link counts).
  // The `!inner` modifier upgrades the LEFT JOIN to an INNER JOIN so
  // `eq("author.school", school)` actually filters posts. Falls back to
  // viewer-only when school is empty so the dev flow doesn't serve a
  // blank page mid-onboarding.
  let query = supabase
    .from("posts")
    .select(
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at," +
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)",
    )
    .eq("type", "post")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (school) {
    query = query.eq("author.school", school);
  } else {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[feed posts]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, posts: data ?? [], viewerSchool: school });
}
