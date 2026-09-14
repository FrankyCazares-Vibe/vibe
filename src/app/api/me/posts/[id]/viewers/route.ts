import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import {
  assertPostOwner,
  loadPostViewers,
} from "@/lib/metrics/post-audience";
import { hasPlus } from "@/lib/premium/require-plus";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/posts/[id]/viewers — who looked at one of your own posts.
 *
 * "Counts are public, identities are private" (design principle 05), priced in
 * handoffs/2026-09-12-decisions.md §1 and §4. The count is free: a free owner
 * gets `total` and nothing else, and the response contains NO `users` key at
 * all — not a blurred one, not a truncated one. A name a free account can read
 * out of the network tab is a privacy failure whatever the UI draws over it,
 * which is why the free branch never calls `hydrateUserCards` and never asks
 * the database for a name. Zero names free, no "three most recent" floor.
 *
 * NOT A 403 FOR FREE ACCOUNTS. The free tier already sees the view COUNT on
 * the post itself, so a blanket `requirePlus` would take away something real
 * (src/lib/premium/require-plus.ts:205-211 says exactly this). Same shape
 * split as /api/me/profile-views: branch on `hasPlus`, reshape, 200.
 *
 * THE OWNERSHIP CHECK IS THE SECURITY BOUNDARY. `post_views` has RLS on with
 * zero select policies, so the viewer read uses the service role and the
 * database stops enforcing anything — see src/lib/metrics/post-audience.ts.
 * The check runs with the COOKIE client, before any service-role query, and a
 * post that is missing and a post that belongs to someone else get the SAME
 * 404 so this route cannot be used to probe which post ids exist.
 *
 * A refused read is a 500, never an empty list. `users: []` to a paying owner
 * reads as "nobody looked at your post", which is a claim we cannot make when
 * the query failed.
 *
 * PEOPLE, NOT VIEWS — AND DELIBERATELY NOT `counts.views`. `total` here is
 * distinct PEOPLE, after the author's own rows are dropped AND after blocked
 * or muted viewers are filtered out. `GET /api/posts/[id]`'s `counts.views` is
 * unfiltered view ROWS — one per person per UTC day, nobody hidden. Alice
 * looking on Monday and again on Tuesday plus a muted Bob on Monday is
 * `counts.views` 3 and `total` 1, on the same post. Both numbers are correct
 * answers to different questions, so the client must NEVER substitute one for
 * the other: a sheet opened from the views chip has to say "N people" from
 * `total`, and must not reuse the chip's number as its heading. (The same
 * distinction is written up at /api/me/profile-views/route.ts:38-42.)
 *
 * PAGING USES `next_offset`, NOT `users.length`. See the note above the
 * hydration below — hydrated rows can be fewer than the ids requested, so a
 * client that advances by the rows it received re-asks for ids it already had.
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

  // Keyed on the caller, and shared with /savers: the two routes read the same
  // owner-only audience, so one person hammering either of them is one budget.
  const rl = await rateLimit(`post-audience:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Cookie client, before anything privileged happens.
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

  // Blocked/muted people come out of the LIST, so the entitlement and the
  // hidden set resolve together — both are needed before the shape is chosen,
  // because `total` counts what is left after the filter on either branch.
  const [plus, hidden] = await Promise.all([
    hasPlus(user.id),
    loadHiddenUsers(supabase, user.id),
  ]);
  if (!hidden.ok) {
    console.error("[me/posts/:id/viewers] hidden users", hidden.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const audience = await loadPostViewers({
    postId: owner.postId,
    authorId: owner.authorId,
    hiddenIds: hidden.hidden.ids,
  });
  if (!audience.ok) {
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const total = audience.entries.length;

  if (!plus) {
    // The ids were needed to dedupe per person and to drop blocked/muted
    // viewers; they stay inside this function. Only a number leaves.
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
  // `hydrateUserCards` drops ids with no visible profile row (a deleted
  // account, say), so a page can come back shorter than it was sliced. That is
  // the right behaviour — a row with no person behind it is not a row — and it
  // means `total` can overcount by the number dropped.
  //
  // THAT IS WHY `next_offset` EXISTS. `has_more` is computed from the SLICE,
  // but the server cannot make the CLIENT advance correctly: the in-repo idiom
  // is `offset = rows.length` (public/html/profile.html:9960), and with three
  // ids dropped from a page of 25 that asks for offset 22 next and re-sends
  // three rows. A page whose ids are ALL invisible returns `users: []`, so a
  // rows.length client never advances at all and "Show more" appends nothing,
  // forever. Clients must page on `next_offset`.
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const users = pageEntries.flatMap((e) => {
    const card = cardById.get(e.user_id);
    return card ? [{ ...card, viewed_on: e.viewed_on }] : [];
  });

  return NextResponse.json({
    ok: true,
    premium: true,
    viewer_identities: "visible",
    users,
    total,
    has_more: offset + pageEntries.length < total,
    // Where the next page starts, counted in ENTRIES asked for — not in rows
    // returned. Additive; the client pages on this.
    next_offset: offset + pageEntries.length,
  });
}
