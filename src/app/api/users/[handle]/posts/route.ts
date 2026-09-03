import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ handle: string }> };

/**
 * Public posts for a visited user, newest first. Published `type='post'`
 * rows only (clips are backlogged) so the viewer's profile grid can hydrate.
 *
 * Signed-in reads use the session client (RLS). Logged-out share-link
 * visits use the service-role client against the same published-only
 * filter — `posts` RLS is authenticated-only, same as profile bootstrap.
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
  } = await supabase.auth.getUser();

  let reader: SupabaseClient;
  try {
    reader = user ? supabase : createSupabaseServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Resolve handle → id first (one indexed lookup) so the posts query
  // can use the FK directly. Cheaper than a join+filter.
  const { data: target, error: tErr } = await reader
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (tErr) {
    console.error("[users/:handle/posts target]", tErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  // Blocks in either direction hide the grid, matching the bootstrap
  // route's "Profile unavailable" branch. Without this a blocked user could
  // still read every post through this endpoint directly.
  if (user && user.id !== target.id) {
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .in("blocker_id", [user.id, target.id])
      .in("blocked_id", [user.id, target.id]);
    if ((blockRows ?? []).length > 0) {
      return NextResponse.json({ ok: true, posts: [], blocked: true });
    }
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // Filter drafts even when viewer == target owner — drafts only appear
  // in the composer's Drafts box, never in the public-shaped grid.
  // Clips are backlogged, so only `type='post'` rows surface.
  const { data, error } = await reader
    .from("posts")
    .select(
      "id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at",
    )
    .eq("user_id", target.id)
    .eq("type", "post")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[users/:handle/posts]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, posts: data ?? [] });
}
