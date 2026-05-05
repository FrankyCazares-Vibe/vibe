import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ handle: string }> };

/**
 * Public posts for a visited user, newest first. Returns both type='post'
 * and type='clip' rows so the viewer's profile All-feed and Clips/Posts
 * tabs can hydrate.
 *
 * Auth-gated. Uses RLS (`posts_select_authenticated` allows any signed-in
 * user to SELECT) so we don't need to special-case visibility here.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Resolve handle → id first (one indexed lookup) so the posts query
  // can use the FK directly. Cheaper than a join+filter.
  const { data: target, error: tErr } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (tErr) {
    console.error("[users/:handle/posts target]", tErr);
    return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const { data, error } = await supabase
    .from("posts")
    .select("id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at")
    .eq("user_id", target.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[users/:handle/posts]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, posts: data ?? [] });
}
