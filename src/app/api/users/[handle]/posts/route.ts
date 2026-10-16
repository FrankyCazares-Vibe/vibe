import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { getActiveRestriction } from "@/lib/moderation/access";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { anonReadLimit, anonReadRefusal } from "@/lib/security/anon-read-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Signed out, a grid answers this many posts at most (rate limits and upload
 * caps, Oct 15, B1.3). A share link still opens on a full screen of someone's
 * posts; a script walking every handle gets 24 each instead of 500. One more
 * row is read so the answer can say `more: true`, and the page can say "Sign
 * in to see all of their posts" instead of passing 24 off as all of them.
 * Signed in, the limits above are unchanged.
 *
 * KNOWN GAP, accepted for now: the desktop profile pins a post only when its
 * card is in the grid (`_restorePinIfPossible`, profile.html), so a pinned
 * post older than someone's 24 newest doesn't show as pinned to a signed-out
 * visitor. Nobody has 24 posts yet; when the signed-out caps come (Wave 2),
 * answer the pinned row alongside the 24.
 */
const SIGNED_OUT_POST_CAP = 24;

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
 * filter — `posts` RLS is authenticated-only, same as profile bootstrap —
 * so that branch restates the rules RLS would apply: a restricted author
 * 404s and club posts are left out (S67 security wave 2, A1). That branch
 * also stops at `SIGNED_OUT_POST_CAP` posts and says whether more exist.
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

  // SIGNED OUT, counted for the caller's network before the handle is looked
  // up (limits plan Wave 2, B2.3; anon-read-limit.ts says how). Grids have a
  // pot of their own, so opening a profile is one view here, one in the
  // bootstrap's pot and one in the pages'. A handle that exists and one that
  // doesn't get the same 429. Signed in, nothing is counted.
  if (!user) {
    const verdict = await anonReadLimit(req, "grid");
    if (!verdict.allowed) return anonReadRefusal(verdict);
  }

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

  // SIGNED OUT, the reads below use the service role, so no RLS stands
  // behind them (S67 security wave 2, A1; report #6). A suspended or banned
  // student's grid answers the same 404 an unknown handle gets, word for word,
  // exactly as the profile bootstrap does; a failed restriction read is 500,
  // never "not restricted". Signed in, users/posts RLS (user_visible) already
  // hides a restricted author.
  if (!user) {
    const restriction = await getActiveRestriction(target.id);
    if (!restriction.ok) {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (restriction.restriction) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
  }

  // Blocks in either direction hide the grid, matching the bootstrap
  // route's "Profile unavailable" branch. Without this a blocked user could
  // still read every post through this endpoint directly. The one block-pair
  // module (fails closed): a refused read is 500, not "not blocked".
  if (user && user.id !== target.id) {
    const pair = await loadPairBlock(supabase, user.id, target.id);
    if (!pair.ok) {
      console.error("[users/:handle/posts blocks]", pair.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (pair.blocked) {
      return NextResponse.json({ ok: true, posts: [], blocked: true });
    }
  }

  const url = new URL(req.url);
  // A whole number, or the default. PostgREST ignores a limit that isn't
  // one (`limit=23.5` reads up to its 1,000-row ceiling), so a fraction
  // passed through would undo both caps, signed in and out.
  const wanted = Math.floor(Number(url.searchParams.get("limit")));
  const asked = Math.min(MAX_LIMIT, wanted > 0 ? wanted : DEFAULT_LIMIT);
  // Signed out, never past the cap. Only a caller who asked for at least the
  // cap gets the extra row read: that row is the one thing that can say the
  // cap, and not the caller's own smaller limit, held posts back.
  const limit = user ? asked : Math.min(asked, SIGNED_OUT_POST_CAP);
  const probeMore = !user && asked >= SIGNED_OUT_POST_CAP;

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
    // Signed out: no club posts at all. That IS the database's own rule
    // (org_content_visible() is false for the anon role for every club), and
    // this service-role read is the one place it has to be restated, or a
    // hidden club's posts reach a stranger through its officer's grid.
    if (!user) q = q.is("org_id", null);
    return q.order("created_at", { ascending: false }).limit(probeMore ? limit + 1 : limit);
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
  const read = (data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
  const more = probeMore && read.length > limit;
  const rows = more ? read.slice(0, limit) : read;
  return NextResponse.json({
    ok: true,
    posts: rows.map((p) => withPostMediaUrls(p)),
    // Signed out only, and only ever about the cap. A signed-in answer keeps
    // the shape it always had.
    ...(user ? {} : { more }),
  });
}
