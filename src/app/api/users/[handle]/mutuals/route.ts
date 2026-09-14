import { NextResponse } from "next/server";

import { hydrateUserCards, loadMutualIds } from "@/lib/connections/queries";
import { ilikeOrFilter } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type RouteContext = { params: Promise<{ handle: string }> };

/** The one empty answer this route gives: self, blocked, or nothing matched. */
const EMPTY_PAGE = { ok: true, users: [], total: 0, has_more: false };

/**
 * People the visited user follows whom the viewer also follows — the list
 * behind the profile's "N you both follow" pill.
 *
 * Same envelope and the same `limit`/`offset`/`q` parsing as its siblings
 * (`src/app/api/me/followers/route.ts`, `src/app/api/users/[handle]/connections/route.ts`),
 * so the connections-modal IIFE in `public/html/profile.html` can drive it as
 * one more mode without new client plumbing.
 *
 * The number and the list come from the same function: `loadMutualIds` is what
 * `getMutualCount` is defined as, so the pill can never disagree with what
 * opens underneath it. "Mutual" here is the DIRECTED intersection — people you
 * both follow — not the strict reciprocal pairs `getCountsFor` counts.
 *
 * Everything reads through the cookie client. `connections` is
 * `SELECT TO authenticated USING (true)`, so the viewer's own session sees the
 * whole follow graph and there is nothing for the service role to unlock; the
 * comment at `bootstrap/route.ts` claiming otherwise is the thing this route
 * deliberately does not copy.
 *
 * Auth is required (no anonymous browsing of someone else's network) and
 * `rateLimit` is keyed on the caller, because this is the first connections
 * list route that walks a *stranger's* graph on demand.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(`mutuals:${viewer.id}`, {
    limit: 60,
    windowSec: 60,
  });
  if (!limited.allowed) return tooManyRequests(limited);

  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  const targetId = (target as { id: string }).id;

  // Your own profile has no "you both follow" list — the pill never renders
  // there, and the directed math would answer with everyone you follow.
  if (targetId === viewer.id) {
    return NextResponse.json(EMPTY_PAGE);
  }

  // Block check, both directions, copied from
  // `src/app/api/users/[handle]/bootstrap/route.ts`: one round trip pulls every
  // block row between the two, and either direction answers with the empty page
  // rather than a 403 — the profile itself already told the visitor what is
  // going on, and a status code here would just be a second way to probe.
  // Both ids are UUIDs (one from the session, one from `users`), never caller
  // text, so the interpolated `.or()` filter has nothing to inject.
  const { data: blockRows, error: blockErr } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${targetId},blocked_id.eq.${viewer.id}),` +
        `and(blocker_id.eq.${viewer.id},blocked_id.eq.${targetId})`,
    );
  if (blockErr) {
    // A refused safety read is unknown, not "nobody blocked anybody".
    console.error("[users/:handle/mutuals blocks]", blockErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if ((blockRows ?? []).length > 0) {
    return NextResponse.json(EMPTY_PAGE);
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const q = (url.searchParams.get("q") ?? "").trim();

  const idsRes = await loadMutualIds(supabase, viewer.id, targetId);
  if (!idsRes.ok) {
    // Never paint "no one you both follow" over a read we could not do.
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const mutualIds = idsRes.ids;
  if (mutualIds.length === 0) {
    return NextResponse.json(EMPTY_PAGE);
  }

  // `q` narrows the set before `total` is taken, like every sibling list, so
  // "showing N of M" counts what the search actually matched. The filter goes
  // through `ilikeOrFilter` (`src/lib/pgrest.ts`) and a query that sanitizes
  // down to nothing answers empty instead of matching everyone.
  let filteredIds = mutualIds;
  if (q.length > 0) {
    const filter = ilikeOrFilter(["name", "handle"], q);
    if (!filter) {
      return NextResponse.json(EMPTY_PAGE);
    }
    const { data: matches, error: matchErr } = await supabase
      .from("users")
      .select("id")
      .in("id", mutualIds)
      .or(filter);
    if (matchErr) {
      console.error("[users/:handle/mutuals search]", matchErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    const matchSet = new Set((matches ?? []).map((r) => (r as { id: string }).id));
    // Keep `loadMutualIds`' newest-follow-first order, not the match order.
    filteredIds = mutualIds.filter((id) => matchSet.has(id));
  }

  const total = filteredIds.length;
  const pageIds = filteredIds.slice(offset, offset + limit);
  // Hydration runs from the VIEWER's perspective so Connect / Follow / Message
  // read correctly for the signed-in user, not for the profile being visited.
  const users = await hydrateUserCards(supabase, viewer.id, pageIds);

  return NextResponse.json({
    ok: true,
    users,
    total,
    has_more: offset + pageIds.length < total,
  });
}
