import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hydrateUserCards } from "@/lib/connections/queries";
import { ilikeOrFilter } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type RouteContext = { params: Promise<{ handle: string }> };

/** The empty answer for a blocked pair or a search that matched nothing. */
const EMPTY_PAGE = { ok: true, users: [], total: 0, has_more: false };

const failed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

/**
 * Followers of a user looked up by handle. Newest follow first. Paginated.
 * Hydration runs from the viewer's perspective so action buttons reflect
 * the viewer ↔ each follower relationship, not target ↔ follower.
 *
 * T1: policy `connections_select_either_party` shows a user client only the
 * edges it is part of, so the target's follower edges are read with the
 * service client, AFTER the checks that make that safe:
 *   - signed in, and at most 120 list reads a minute per viewer, shared with
 *     /following and /connections (`follow-lists:<viewer>`, rulings M12), so
 *     this is not a cheap way to walk everyone's graph;
 *   - no block between the viewer and the target, in either direction
 *     (`loadPairBlock`); a blocked pair gets the empty page, like /mutuals;
 *   - anyone in a block pair with the viewer is left out of the list
 *     (`loadHiddenUsers(...).blocked`, rulings M12), before `total` is taken.
 * The service read selects only ids and timestamps. The `q` search and
 * `hydrateUserCards` stay on the viewer's cookie client (rulings M3).
 * A refused read answers 500, never a quietly shorter list.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(`follow-lists:${viewer.id}`, {
    limit: 120,
    windowSec: 60,
  });
  if (!limited.allowed) return tooManyRequests(limited);

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  const targetId = (target as { id: string }).id;

  const [pair, hiddenRes] = await Promise.all([
    loadPairBlock(supabase, viewer.id, targetId),
    loadHiddenUsers(supabase, viewer.id),
  ]);
  if (!pair.ok || !hiddenRes.ok) {
    // A refused safety read is unknown, not "nobody blocked anybody".
    console.error(
      "[users/:handle/followers blocks]",
      !pair.ok ? pair.error : !hiddenRes.ok ? hiddenRes.error : null,
    );
    return failed();
  }
  if (pair.blocked) return NextResponse.json(EMPTY_PAGE);
  const blocked = hiddenRes.hidden.blocked;

  let service: SupabaseClient;
  try {
    service = createSupabaseServiceClient();
  } catch (e) {
    console.error("[users/:handle/followers service]", e);
    return failed();
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const q = (url.searchParams.get("q") ?? "").trim();

  const { data: rows, error: rowsErr } = await service
    .from("connections")
    .select("follower_id, created_at")
    .eq("following_id", targetId)
    .order("created_at", { ascending: false });
  if (rowsErr) {
    console.error("[users/:handle/followers]", rowsErr);
    return failed();
  }
  const followerIds = (rows ?? [])
    .map((r) => (r as { follower_id: string }).follower_id)
    .filter((id) => !blocked.has(id));

  let filteredIds = followerIds;
  if (q.length > 0 && followerIds.length > 0) {
    const filter = ilikeOrFilter(["name", "handle"], q);
    if (!filter) {
      return NextResponse.json(EMPTY_PAGE);
    }
    const { data: matches, error: matchErr } = await supabase
      .from("users")
      .select("id")
      .in("id", followerIds)
      .or(filter);
    if (matchErr) {
      console.error("[users/:handle/followers search]", matchErr);
      return failed();
    }
    const matchSet = new Set(
      (matches ?? []).map((r) => (r as { id: string }).id),
    );
    filteredIds = followerIds.filter((id) => matchSet.has(id));
  }

  const total = filteredIds.length;
  const pageIds = filteredIds.slice(offset, offset + limit);
  const users = await hydrateUserCards(supabase, viewer.id, pageIds);

  return NextResponse.json({
    ok: true,
    users,
    total,
    has_more: offset + pageIds.length < total,
  });
}
