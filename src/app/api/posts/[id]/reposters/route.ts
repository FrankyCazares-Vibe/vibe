import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { loadPostEngagementCounts } from "@/lib/posts/engagement-counts";
import {
  followedReposterIds,
  MAX_NAMED_REPOSTERS,
  MAX_REPOST_ROWS,
  reposterIdChunks,
  shapeReposters,
  type RepostersResponse,
} from "@/lib/posts/reposters";
import { tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Every answer is about who THIS viewer follows, so none may sit in a shared
 * cache: the 401, 404 and 429 included (the post route's header, always on).
 */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const notFound = () => answer({ ok: false, error: "Post not found" }, 404);
const failed = () => answer({ ok: false, error: "Request failed" }, 500);

/**
 * GET /api/posts/[id]/reposters: the "Reposted by" list (Oct 19, 2026,
 * Franky's decision 1a). Names the people the viewer follows who reposted
 * the post, and counts everyone else: `{ followed, followed_total,
 * others_total, viewer_reposted, total }` (src/lib/posts/reposters.ts).
 *
 * WHO MAY ASK, the same rule as the post's other routes (repost, comments,
 * save, view): signed in; postAccessForCaller says yes (a uuid, a post the
 * viewer's own RLS returns, so someone else's draft, a removed post or a
 * restricted author's post reads as missing, and not a hidden club's post
 * unless they're a member; the author is never locked out); and not across a
 * block with its author either way. Since Oct 19, 2026 (review of B2) it
 * calls that shared helper instead of a hand copy, so the next change to who
 * may see a post reaches this list too. Each refusal is the same 404 as a
 * missing post, so the list can't confirm a hidden post exists or tell
 * anyone they were blocked.
 *
 * WHO GETS NAMED: the viewer's follows, minus anyone blocked either way or
 * muted right now (loadHiddenUsers), minus the viewer, as the feed's line
 * does. A muted or blocked reposter is still in the number, which is the
 * post's public repost total.
 *
 * Which client. Other people's repost rows need the service role (T1 closed
 * `post_reposts` to own rows), as /api/feed loadFriendReposters reads them.
 * That read takes ids and a timestamp only, for a post this route already
 * authorized, and is filtered down to followed people here before anything
 * leaves. Everything else stays on the viewer's own client, ON PURPOSE: the
 * post (its RLS hides drafts and removed posts), the follow check, the
 * follow-backs, the count RPC, the viewer's own repost, and above all the
 * profiles: `users_select_authenticated` hides a suspended or banned person,
 * so they are counted and never named. Every read that decides who is named
 * fails closed: a list we couldn't check is a 500, never names.
 *
 * The limiter (`repostersRead`, a day window) runs right after sign-in, so a
 * refused caller costs no read.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return answer({ ok: false, error: "Unauthorized" }, 401);

  const rl = await limitFor("repostersRead", user.id);
  if (!rl.allowed) {
    const res = tooManyRequests(rl, "You're opening these too fast. Try again later.");
    res.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return res;
  }

  // The shared gate first (it refuses a non-uuid before any read). It reads
  // the author but doesn't hand it back, so the block check costs one more
  // primary-key read under the viewer's RLS, as the repost route's does.
  const access = await postAccessForCaller(supabase, id, user.id, "[posts/:id/reposters post]");
  if (!access.ok) return access.reason === "error" ? failed() : notFound();
  const { data: post, error: postErr } = await supabase.from("posts").select("user_id").eq("id", id).maybeSingle();
  if (postErr) {
    console.error("[posts/:id/reposters author]", postErr);
    return failed();
  }
  const authorId = (post as { user_id?: unknown } | null)?.user_id;
  // Deleted since the gate: a missing post.
  if (typeof authorId !== "string" || !authorId) return notFound();
  // Your own post never reads `blocks` (loadPairBlock skips yourself).
  const pair = await loadPairBlock(supabase, user.id, authorId);
  if (!pair.ok) {
    console.error("[posts/:id/reposters block-check]", pair.error);
    return failed();
  }
  if (pair.blocked) return notFound();

  if (!isSupabaseServiceConfigured()) {
    console.error("[posts/:id/reposters] service role not configured");
    return failed();
  }

  const [hiddenRes, counts, mineRes, repostsRes] = await Promise.all([
    loadHiddenUsers(supabase, user.id),
    loadPostEngagementCounts(supabase, [id]),
    supabase
      .from("post_reposts")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("user_id", user.id),
    // Newest first, ties broken by id so the cut at MAX_REPOST_ROWS is the
    // same on every open.
    createSupabaseServiceClient()
      .from("post_reposts")
      .select("user_id, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: false })
      .order("user_id", { ascending: true })
      .limit(MAX_REPOST_ROWS),
  ]);
  if (!hiddenRes.ok || counts === null || mineRes.error || repostsRes.error) {
    console.error("[posts/:id/reposters reads]", {
      hidden: hiddenRes.ok ? null : hiddenRes.error,
      counts: counts === null ? "count rpc failed" : null,
      mine: mineRes.error ?? null,
      reposts: repostsRes.error ?? null,
    });
    return failed();
  }

  // Which of these reposters does the viewer follow? Asked about the
  // reposters themselves, at most FOLLOW_CHECK_CHUNK per ask, so the answer
  // never rests on a follow list that max_rows cut short (Oct 19, 2026).
  const follows: string[] = [];
  const asks = await Promise.all(
    reposterIdChunks(repostsRes.data, user.id).map((ids) =>
      supabase.from("connections").select("following_id").eq("follower_id", user.id).in("following_id", ids),
    ),
  );
  for (const res of asks) {
    if (res.error) {
      console.error("[posts/:id/reposters follows]", res.error);
      return failed();
    }
    for (const r of res.data ?? []) follows.push(String((r as { following_id: unknown }).following_id));
  }
  const followedIds = followedReposterIds(repostsRes.data, follows, hiddenRes.hidden.ids, user.id);
  const nameIds = followedIds.slice(0, MAX_NAMED_REPOSTERS);

  let users: unknown = [];
  const followsYou: string[] = [];
  if (nameIds.length > 0) {
    const [usersRes, backRes] = await Promise.all([
      // The viewer's client, never the service role: its RLS is what keeps a
      // suspended or banned person unnamed (reposters-route.test.ts checks).
      supabase.from("users").select("id,name,handle,avatar_url").in("id", nameIds),
      supabase.from("connections").select("follower_id").eq("following_id", user.id).in("follower_id", nameIds),
    ]);
    if (usersRes.error) {
      console.error("[posts/:id/reposters users]", usersRes.error);
      return failed();
    }
    users = usersRes.data;
    // Only the button's words hang on this (Connected ✓ or Following ✓), so a
    // failed read says Following ✓ rather than failing the list.
    if (backRes.error) console.error("[posts/:id/reposters follow-backs]", backRes.error);
    for (const r of backRes.data ?? []) followsYou.push(String((r as { follower_id: unknown }).follower_id));
  }

  const body: RepostersResponse = {
    ok: true,
    ...shapeReposters({
      repostCount: counts.get(id)?.reposts ?? 0,
      followedIds,
      users,
      followsYou,
      viewerReposted: (mineRes.count ?? 0) > 0,
    }),
  };
  return answer(body);
}
