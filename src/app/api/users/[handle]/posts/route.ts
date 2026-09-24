import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * What the moderation migration adds to `posts`. Production does not have them
 * yet, so the grid select is built twice — once with, and, for a 42703 naming
 * one of these two and nothing else, once without.
 */
const MODERATION_POST_COLUMNS = ["removed_at", "removed_reason"] as const;

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
  //
  // REMOVED POSTS ARE DROPPED HERE, IN THE QUERY, for anyone who is not their
  // author. Every other read route leans on RLS for that, and this one cannot:
  // a logged-out visit reads with the SERVICE role (see `reader` above), which
  // no policy applies to — so without this `.is("removed_at", null)` the one
  // route that bypasses RLS would be the one that hands a stranger a post a
  // moderator took down, with the moderator's private reason attached. The
  // author's own grid keeps them, and carries the reason, because that notice
  // is written to them.
  const viewerIsAuthor = !!user && user.id === target.id;
  const readGrid = (moderation: boolean) => {
    let q = reader
      .from("posts")
      .select(
        // `edited_at` (null = never edited) drives the "Edited" marker.
        "id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at,edited_at" +
          (moderation ? ",removed_at,removed_reason" : ""),
      )
      .eq("user_id", target.id)
      .eq("type", "post")
      .eq("status", "published");
    if (moderation && !viewerIsAuthor) q = q.is("removed_at", null);
    return q.order("created_at", { ascending: false }).limit(limit);
  };

  let { data, error } = await readGrid(true);
  if (error && isMissingColumnError(error, MODERATION_POST_COLUMNS)) {
    // A deploy without the moderation migration: nothing can be removed there,
    // so the grid is exactly what it was before.
    ({ data, error } = await readGrid(false));
  }

  if (error) {
    console.error("[users/:handle/posts]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Raw R2 keys become proxy URLs — as an <img src> a bare key 404s. The
  // built select string defeats Supabase's row typing (GenericStringError),
  // the same cast /api/feed and GET /api/posts/[id] make.
  const rows = (data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
  return NextResponse.json({
    ok: true,
    posts: rows.map((p) => withPostMediaUrls(p)),
  });
}
