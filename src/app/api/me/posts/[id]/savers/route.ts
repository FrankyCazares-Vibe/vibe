import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import { assertPostOwner, loadPostSavers } from "@/lib/metrics/post-audience";
import { hasPlus } from "@/lib/premium/require-plus";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/posts/[id]/savers — who saved one of your own posts.
 *
 * The sibling of ./viewers/route.ts in every respect: same free/paid split
 * (count free, names Vibe+, and the free branch carries no `users` key at
 * all), same cookie-client ownership check before any service-role read, same
 * 404 for both "no such post" and "not yours", same "a refused read is a 500,
 * never an empty list", same `post-audience:<uid>` rate-limit budget.
 *
 * WHY THE SERVICE ROLE HERE TOO. `bookmarks` RLS is `bookmarks_all_own` —
 * owner of the BOOKMARK, not of the post — so an author asking who saved their
 * own post with their cookie client gets a silent empty list. The read
 * therefore runs with the service role in src/lib/metrics/post-audience.ts,
 * which is why the ownership check above it is the only thing standing between
 * a post id and someone else's saves.
 *
 * The author's own bookmark is excluded, so "12 people saved this" means
 * twelve other people — the same honesty rule the view ledger got in b3f23df.
 *
 * PEOPLE, NOT ROWS. `total` is distinct PEOPLE, after the author's own save is
 * dropped AND after blocked or muted savers are filtered out — so it is
 * allowed to sit BELOW `counts.saves` from `GET /api/posts/[id]`, which drops
 * the author but hides nobody. A sheet opened from the saves count must read
 * its heading ("N people") off `total` and must not reuse the count it was
 * opened from. (Same distinction as /api/me/profile-views/route.ts:38-42.)
 *
 * PAGING USES `next_offset`, NOT `users.length` — see the hydration note below.
 *
 *   free   → { ok, premium: false, viewer_identities: "locked", total }
 *   Vibe+  → { ok, premium: true,  viewer_identities: "visible", users, total,
 *              has_more, next_offset }
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteContext) {
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

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const [plus, hidden] = await Promise.all([
    hasPlus(user.id),
    loadHiddenUsers(supabase, user.id),
  ]);
  if (!hidden.ok) {
    console.error("[me/posts/:id/savers] hidden users", hidden.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const audience = await loadPostSavers({
    postId: owner.postId,
    authorId: owner.authorId,
    hiddenIds: hidden.hidden.ids,
  });
  if (!audience.ok) {
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const total = audience.entries.length;

  if (!plus) {
    // Ids were read to drop the author and the hidden set; they never leave
    // this function on a free account.
    return NextResponse.json({
      ok: true,
      premium: false,
      viewer_identities: "locked",
      total,
    });
  }

  const pageEntries = audience.entries.slice(offset, offset + limit);
  const cards = await hydrateUserCards(
    supabase,
    user.id,
    pageEntries.map((e) => e.user_id),
  );
  // Same note as ./viewers: ids with no visible profile row are dropped by
  // hydration, so `total` can overcount by that many, and `users.length` is
  // NOT a safe thing for a client to page on — a fully-dropped page would pin
  // it in place forever. `has_more` counts the slice, and `next_offset` below
  // is the value to send back.
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const users = pageEntries.flatMap((e) => {
    const card = cardById.get(e.user_id);
    return card ? [{ ...card, saved_at: e.saved_at }] : [];
  });

  return NextResponse.json({
    ok: true,
    premium: true,
    viewer_identities: "visible",
    users,
    total,
    has_more: offset + pageEntries.length < total,
    // Entries asked for, not rows returned. The client pages on this.
    next_offset: offset + pageEntries.length,
  });
}
