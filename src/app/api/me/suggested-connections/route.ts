import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

type Suggestion = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  banner_gradient: string | null;
  major: string | null;
  year: number | null;
  mutual_count: number;
  shared_org_count: number;
  /** True if the candidate's major matches the viewer's. Independent of `reason`. */
  same_major: boolean;
  reason: string;
};

/**
 * People-you-might-know feed. Strategy in priority order:
 *
 *   1. Friends-of-friends — people connected to your existing connections
 *      who you don't already follow. Sorted by overlap count desc.
 *   2. Shared-org peers — members of orgs/clubs you're in who you haven't
 *      connected with. Sorted by number of shared orgs.
 *   3. Same-major peers at the same school — fills the rail for users
 *      with very few existing connections or org memberships.
 *
 * Filters out: self, already-connected (one-way OR mutual), blocked-either-
 * way (when the blocks table exists). Capped at `limit` (default 5).
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

  // Shared-org peers: people in the same orgs/clubs as me. Strong signal
  // for "you should know this person" — students in the same club already
  // share context, IRL exposure, common interests.
  const sharedOrgCount = new Map<string, number>();
  const { data: myOrgs } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);
  const myOrgIds = (myOrgs ?? []).map((r) => (r as { org_id: string }).org_id);
  if (myOrgIds.length > 0) {
    const { data: peers } = await supabase
      .from("org_members")
      .select("user_id, org_id")
      .in("org_id", myOrgIds)
      .neq("user_id", user.id);
    for (const row of peers ?? []) {
      const r = row as { user_id: string; org_id: string };
      // Skip: already an outgoing follow → not a "suggestion" anymore.
      // (mutuals are also outgoing, so this covers connected too.)
      if (outIds.has(r.user_id)) continue;
      sharedOrgCount.set(r.user_id, (sharedOrgCount.get(r.user_id) ?? 0) + 1);
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
      if (outIds.has(r.id)) continue; // already follow
      if (mutualCount.has(r.id)) continue;
      if (sharedOrgCount.has(r.id)) continue;
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

  // Dismissed list — viewer has hit × on these before; don't resurface.
  const { data: dismissals } = await supabase
    .from("suggestion_dismissals")
    .select("target_id")
    .eq("user_id", user.id);
  for (const row of dismissals ?? []) {
    blockedIds.add((row as { target_id: string }).target_id);
  }

  // Final candidate list, priority: mutuals > shared-org > fallback.
  // Each candidate carries both a mutual_count and shared_org_count so the
  // UI can render the strongest reason — the API doesn't pick one.
  type Entry = { id: string; mutuals: number; sharedOrgs: number };
  const candidates = new Map<string, Entry>();
  for (const [id, count] of mutualCount) {
    if (blockedIds.has(id)) continue;
    candidates.set(id, { id, mutuals: count, sharedOrgs: sharedOrgCount.get(id) ?? 0 });
  }
  for (const [id, count] of sharedOrgCount) {
    if (blockedIds.has(id)) continue;
    if (candidates.has(id)) continue; // already in via mutuals branch
    candidates.set(id, { id, mutuals: 0, sharedOrgs: count });
  }
  for (const id of fallbackPool) {
    if (blockedIds.has(id)) continue;
    if (candidates.has(id)) continue;
    candidates.set(id, { id, mutuals: 0, sharedOrgs: 0 });
  }

  // Sort: mutuals desc, then shared-orgs desc, then arbitrary.
  const merged = Array.from(candidates.values())
    .sort((a, b) => b.mutuals - a.mutuals || b.sharedOrgs - a.sharedOrgs)
    .slice(0, limit);

  if (merged.length === 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const { data: profiles } = await supabase
    .from("users")
    .select("id,name,handle,avatar_url,banner_url,banner_gradient,major,year")
    .in(
      "id",
      merged.map((m) => m.id),
    );
  type ProfileBase = Omit<
    Suggestion,
    "mutual_count" | "shared_org_count" | "same_major" | "reason"
  >;
  const profileById = new Map<string, ProfileBase>();
  for (const p of profiles ?? []) {
    const u = p as ProfileBase;
    profileById.set(u.id, u);
  }

  const suggestions: Suggestion[] = merged
    .map(({ id, mutuals, sharedOrgs }) => {
      const base = profileById.get(id);
      if (!base) return null;
      const sameMajor = !!(major && base.major && base.major === major);
      // Strongest reason wins. Mutuals first because that's the most
      // social-graph-anchored signal.
      let reason = "";
      if (mutuals > 0) {
        reason = `${mutuals} mutual${mutuals === 1 ? "" : "s"}`;
      } else if (sharedOrgs > 0) {
        reason = sharedOrgs === 1 ? "in your org" : `${sharedOrgs} shared orgs`;
      } else if (sameMajor) {
        reason = "same major";
      } else if (school) {
        reason = "same school";
      } else {
        reason = "new on Vibe";
      }
      return {
        ...base,
        mutual_count: mutuals,
        shared_org_count: sharedOrgs,
        same_major: sameMajor,
        reason,
      };
    })
    .filter((s): s is Suggestion => s !== null);

  return NextResponse.json({ ok: true, suggestions });
}
