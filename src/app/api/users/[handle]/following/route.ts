import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type RouteContext = { params: Promise<{ handle: string }> };

/**
 * Users that a target (looked up by handle) follows. Newest follow first.
 * Hydration runs from the viewer's perspective.
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

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  const targetId = (target as { id: string }).id;

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
    .eq("follower_id", targetId)
    .order("created_at", { ascending: false });
  const followingIds = (rows ?? []).map(
    (r) => (r as { following_id: string }).following_id,
  );

  let filteredIds = followingIds;
  if (q.length > 0 && followingIds.length > 0) {
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
  const users = await hydrateUserCards(supabase, viewer.id, pageIds);

  return NextResponse.json({
    ok: true,
    users,
    total,
    has_more: offset + pageIds.length < total,
  });
}
