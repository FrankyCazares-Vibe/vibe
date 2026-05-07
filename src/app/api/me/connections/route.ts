import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Mutual connections (the viewer follows AND is followed back). Paginated.
 *
 * Optional `?q=` filters on name + handle (ILIKE) before pagination so the
 * count stays accurate against the filtered set.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const q = (url.searchParams.get("q") ?? "").trim();

  // Mutuals = intersection of (viewer→x) and (x→viewer). Compute the
  // intersection client-side rather than via SQL — both sides cap at the
  // viewer's own follow degree so this stays cheap.
  const [outRes, inRes] = await Promise.all([
    supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", user.id),
    supabase
      .from("connections")
      .select("follower_id")
      .eq("following_id", user.id),
  ]);
  const outIds = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const inIds = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const mutualIds: string[] = [];
  for (const id of outIds) if (inIds.has(id)) mutualIds.push(id);

  if (mutualIds.length === 0) {
    return NextResponse.json({ ok: true, users: [], total: 0, has_more: false });
  }

  // Apply optional search before pagination so totals match the filtered set.
  let filteredIds = mutualIds;
  if (q.length > 0) {
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    const { data: matches } = await supabase
      .from("users")
      .select("id")
      .in("id", mutualIds)
      .or(`name.ilike.%${escaped}%,handle.ilike.%${escaped}%`);
    filteredIds = (matches ?? []).map((r) => (r as { id: string }).id);
  }

  const total = filteredIds.length;
  const pageIds = filteredIds.slice(offset, offset + limit);
  const users = await hydrateUserCards(supabase, user.id, pageIds);

  return NextResponse.json({
    ok: true,
    users,
    total,
    has_more: offset + pageIds.length < total,
  });
}
