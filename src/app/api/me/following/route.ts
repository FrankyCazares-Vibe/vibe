import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Users the viewer follows. Paginated, newest follow first.
 *
 * Optional `?q=` filters on name + handle (ILIKE).
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

  const { data: rows } = await supabase
    .from("connections")
    .select("following_id, created_at")
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false });

  const followingIds = (rows ?? []).map(
    (r) => (r as { following_id: string }).following_id,
  );

  if (followingIds.length === 0) {
    return NextResponse.json({ ok: true, users: [], total: 0, has_more: false });
  }

  let filteredIds = followingIds;
  if (q.length > 0) {
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    const { data: matches } = await supabase
      .from("users")
      .select("id")
      .in("id", followingIds)
      .or(`name.ilike.%${escaped}%,handle.ilike.%${escaped}%`);
    const matchSet = new Set(
      (matches ?? []).map((r) => (r as { id: string }).id),
    );
    filteredIds = followingIds.filter((id) => matchSet.has(id));
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
