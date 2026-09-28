import { NextResponse } from "next/server";

import { assertPostOwner, countPostSavers } from "@/lib/metrics/post-audience";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/posts/[id]/savers — HOW MANY people saved one of your own posts.
 * A count, never a list, on every tier.
 *
 * SAVES ARE PRIVATE (security report 2026-09-27, register #15). The Saved tab
 * tells every student "Only you can see your saves", so no answer from this
 * route may carry a saver's name, handle, avatar or id — not free, not Vibe+.
 * Vibe+ keeps "who saw this" (./viewers) and profile views; it does not sell
 * saves. The response has no `users` key and no paging, so there is nothing
 * for any client to leak. Owner-gated like ./viewers: same cookie-client
 * ownership check before any service-role read, same 404 for both "no such
 * post" and "not yours", same "a refused read is a 500, never a zero", same
 * `post-audience:<uid>` rate-limit budget.
 *
 * WHY THE SERVICE ROLE HERE TOO. `bookmarks` RLS is `bookmarks_all_own` —
 * owner of the BOOKMARK, not of the post — so an author counting saves on
 * their own post with their cookie client gets a silent zero. The read runs
 * with the service role in src/lib/metrics/post-audience.ts, which is why the
 * ownership check above it is the only thing standing between a post id and
 * someone else's saves. The ids it reads never leave this function.
 *
 * The author's own bookmark is excluded, so "12 people saved this" means
 * twelve other people — the same honesty rule the view ledger got in b3f23df.
 *
 * EVERYONE COUNTS, WHOEVER YOU MUTED (security report 2026-09-27 #18).
 * `total` is distinct PEOPLE minus the author's own save, and nobody else is
 * taken out: not people the author blocked, not people they muted. It used to
 * be taken after the block/mute filter, and that made it an oracle: mute a
 * suspect, re-read the number, and a drop of one says they saved it. Muting is
 * silent and unlimited, so bisecting named every saver. Now the number never
 * moves when you mute someone, and it equals `counts.saves` from
 * `GET /api/posts/[id]` (which also drops only the author). There is no list
 * to filter, so this route no longer reads the block/mute set at all.
 *
 *   everyone → { ok, viewer_identities: "private", total }
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`post-audience:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl);

  const owner = await assertPostOwner(supabase, user.id, id);
  if (!owner.ok) {
    return owner.reason === "error"
      ? NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 })
      : NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }

  // No hasPlus() here on purpose: the tier changes nothing about a save. No
  // loadHiddenUsers() either: a count is everyone (see #18 above).
  const saves = await countPostSavers({
    postId: owner.postId,
    authorId: owner.authorId,
  });
  if (!saves.ok) {
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Ids were read only to drop the author; they never leave post-audience.ts,
  // whatever the caller's plan.
  return NextResponse.json({
    ok: true,
    viewer_identities: "private",
    total: saves.total,
  });
}
