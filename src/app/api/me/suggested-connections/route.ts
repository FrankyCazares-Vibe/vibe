import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

type Suggestion = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: number | null;
  mutual_count: number;
  reason: string;
};

/**
 * People-you-might-know feed for OttoPanel. Strategy in priority order:
 *
 *   1. Friends-of-friends — people connected to your existing connections
 *      who you don't already follow. Sorted by overlap count desc.
 *   2. Same-major peers at the same school — fills the panel for users
 *      with very few existing connections.
 *
 * Filters out: self, already-connected, blocked-either-way (when the
 * blocks table exists). Capped at `limit` (default 5 to fit the rail).
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

  const { data: me } = await supabase
    .from("users")
    .select("id,school,major")
    .eq("id", user.id)
    .single();
  const school = (me?.school ?? "").trim();
  const major = (me?.major ?? "").trim();

  // Compute the viewer's mutual-follow set. Same math as /api/campus-map.
  const [outRes, inRes] = await Promise.all([
    supabase.from("connections").select("following_id").eq("follower_id", user.id),
    supabase.from("connections").select("follower_id").eq("following_id", user.id),
  ]);
  const outIds = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const inIds = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const myConnections = new Set<string>();
  for (const id of outIds) if (inIds.has(id)) myConnections.add(id);

  // Aggregate friends-of-friends (count of how many of MY connections each
  // candidate follows). Skip if I have no connections yet.
  const mutualCount = new Map<string, number>();
  if (myConnections.size > 0) {
    const { data: hop } = await supabase
      .from("connections")
      .select("following_id")
      .in("follower_id", Array.from(myConnections));
    for (const row of hop ?? []) {
      const id = (row as { following_id: string }).following_id;
      if (id === user.id) continue;
      if (myConnections.has(id)) continue;
      mutualCount.set(id, (mutualCount.get(id) ?? 0) + 1);
    }
  }

  // Fallback pool: same-school peers (and optionally same-major) so the
  // panel has something to show for new accounts with zero connections.
  const fallbackPool: string[] = [];
  if (school) {
    const { data: peers } = await supabase
      .from("users")
      .select("id,major")
      .eq("school", school)
      .neq("id", user.id);
    for (const p of peers ?? []) {
      const r = p as { id: string; major: string | null };
      if (myConnections.has(r.id)) continue;
      if (mutualCount.has(r.id)) continue;
      fallbackPool.push(r.id);
    }
  }

  // Block list — exclude either direction.
  const { data: blocks } = await supabase
    .from("blocks")
    .select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  const blockedIds = new Set<string>();
  for (const row of blocks ?? []) {
    const r = row as { blocker_id: string; blocked_id: string };
    blockedIds.add(r.blocker_id === user.id ? r.blocked_id : r.blocker_id);
  }

  // Final candidate list: mutuals first (sorted), then fallback pool.
  const mutualEntries = Array.from(mutualCount.entries())
    .filter(([id]) => !blockedIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));

  const fallbackEntries = fallbackPool
    .filter((id) => !blockedIds.has(id))
    .map((id) => ({ id, count: 0 }));

  const merged = [...mutualEntries, ...fallbackEntries].slice(0, limit);

  if (merged.length === 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const { data: profiles } = await supabase
    .from("users")
    .select("id,name,handle,avatar_url,major,year")
    .in(
      "id",
      merged.map((m) => m.id),
    );
  const profileById = new Map<string, Suggestion>();
  for (const p of profiles ?? []) {
    const u = p as Omit<Suggestion, "mutual_count" | "reason">;
    profileById.set(u.id, {
      ...u,
      mutual_count: 0,
      reason: "",
    });
  }

  const suggestions: Suggestion[] = merged
    .map(({ id, count }) => {
      const base = profileById.get(id);
      if (!base) return null;
      let reason = "";
      if (count > 0) {
        reason = `${count} mutual${count === 1 ? "" : "s"}`;
      } else if (major && base.major && base.major === major) {
        reason = "same major";
      } else if (school) {
        reason = "same school";
      } else {
        reason = "new on Vibe";
      }
      return { ...base, mutual_count: count, reason };
    })
    .filter((s): s is Suggestion => s !== null);

  return NextResponse.json({ ok: true, suggestions });
}
