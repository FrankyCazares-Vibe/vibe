import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Counts derived from `public.connections` for a given user.
 *
 * - `followers`   = rows where `following_id = userId`
 * - `following`   = rows where `follower_id  = userId`
 * - `connections` = mutual follow (A→B and B→A both exist). Computed from the
 *   intersection — never stored. Hot-path queries can be materialized later
 *   if perf demands it.
 */
export type ConnectionCounts = {
  followers: number;
  following: number;
  connections: number;
};

/** Connection status from a viewer's perspective toward a target user. */
export type ConnectionState =
  | "self"
  | "none"
  | "following"
  | "followed_by"
  | "connected";

const ZERO_COUNTS: ConnectionCounts = {
  followers: 0,
  following: 0,
  connections: 0,
};

/** Read-only fetch of follower / following / connection counts for one user. */
export async function getCountsFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectionCounts> {
  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("connections")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("connections")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);

  if (followersRes.error || followingRes.error) {
    console.error(
      "[connections.getCountsFor]",
      followersRes.error ?? followingRes.error,
    );
    return ZERO_COUNTS;
  }

  // Mutuals: rows in BOTH followers and following lists. Skip the join when
  // either side is empty — saves a roundtrip on brand-new accounts.
  const followers = followersRes.count ?? 0;
  const following = followingRes.count ?? 0;
  if (followers === 0 || following === 0) {
    return { followers, following, connections: 0 };
  }

  const { data: followingRows, error: listErr } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", userId);

  if (listErr || !followingRows) {
    console.error("[connections.getCountsFor list]", listErr);
    return { followers, following, connections: 0 };
  }

  const followingIds = followingRows.map((r) => r.following_id as string);
  if (followingIds.length === 0) {
    return { followers, following, connections: 0 };
  }

  const { count: mutualCount, error: mutualErr } = await supabase
    .from("connections")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId)
    .in("follower_id", followingIds);

  if (mutualErr) {
    console.error("[connections.getCountsFor mutual]", mutualErr);
    return { followers, following, connections: 0 };
  }

  return { followers, following, connections: mutualCount ?? 0 };
}

/**
 * Connection state from `viewerId`'s perspective toward `targetId`.
 * Two boolean checks (does viewer→target exist; does target→viewer exist)
 * combine into one of five states.
 */
export async function getFollowState(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<ConnectionState> {
  if (viewerId === targetId) return "self";

  const [viewerFollows, targetFollows] = await Promise.all([
    supabase
      .from("connections")
      .select("id", { head: true, count: "exact" })
      .eq("follower_id", viewerId)
      .eq("following_id", targetId),
    supabase
      .from("connections")
      .select("id", { head: true, count: "exact" })
      .eq("follower_id", targetId)
      .eq("following_id", viewerId),
  ]);

  const a = (viewerFollows.count ?? 0) > 0;
  const b = (targetFollows.count ?? 0) > 0;

  if (a && b) return "connected";
  if (a) return "following";
  if (b) return "followed_by";
  return "none";
}

/** Number of mutual connections between two users (intersection of their followings). */
export async function getMutualCount(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<number> {
  if (viewerId === targetId) return 0;

  const { data: viewerFollowing, error: viewErr } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", viewerId);
  if (viewErr || !viewerFollowing) return 0;

  const ids = viewerFollowing.map((r) => r.following_id as string);
  if (ids.length === 0) return 0;

  const { count, error } = await supabase
    .from("connections")
    .select("follower_id", { count: "exact", head: true })
    .eq("follower_id", targetId)
    .in("following_id", ids);

  if (error) return 0;
  return count ?? 0;
}

export type UserCardData = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  banner_gradient: string | null;
  major: string | null;
  year: number | null;
  mutual_count: number;
  follow_state: ConnectionState;
};

/**
 * Hydrate a list of candidate user IDs into UserCardData rows: profile fields,
 * mutual count vs viewer, and follow state from viewer's perspective.
 *
 * Order of returned rows matches `candidateIds`. Missing/invisible profiles are
 * dropped silently.
 *
 * Three batched queries regardless of page size:
 *   1. Profiles for the candidate slice.
 *   2. Outgoing edges (viewer → candidate) for follow_state.
 *   3. Mutual counts: for each candidate, count their followings that overlap
 *      with the viewer's followings.
 */
export async function hydrateUserCards(
  supabase: SupabaseClient,
  viewerId: string,
  candidateIds: string[],
): Promise<UserCardData[]> {
  if (candidateIds.length === 0) return [];

  // Viewer's outgoing followings — needed for both mutual computation and
  // follow_state (incoming side comes from the candidate set itself when
  // applicable; we fetch it separately to stay generic).
  const { data: viewerOut } = await supabase
    .from("connections")
    .select("following_id")
    .eq("follower_id", viewerId);
  const viewerFollowingIds = (viewerOut ?? []).map(
    (r) => (r as { following_id: string }).following_id,
  );

  const [profilesRes, outEdgesRes, inEdgesRes, mutualEdgesRes] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,handle,avatar_url,banner_url,banner_gradient,major,year")
      .in("id", candidateIds),
    supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in("following_id", candidateIds),
    supabase
      .from("connections")
      .select("follower_id")
      .eq("following_id", viewerId)
      .in("follower_id", candidateIds),
    viewerFollowingIds.length === 0
      ? Promise.resolve({ data: [] as { follower_id: string; following_id: string }[] })
      : supabase
          .from("connections")
          .select("follower_id, following_id")
          .in("follower_id", candidateIds)
          .in("following_id", viewerFollowingIds),
  ]);

  type ProfileRow = {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    banner_gradient: string | null;
    major: string | null;
    year: number | null;
  };
  const profileById = new Map<string, ProfileRow>();
  for (const row of profilesRes.data ?? []) {
    profileById.set((row as ProfileRow).id, row as ProfileRow);
  }

  const viewerFollows = new Set(
    (outEdgesRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const followsViewer = new Set(
    (inEdgesRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );

  const mutualByCandidate = new Map<string, number>();
  for (const row of mutualEdgesRes.data ?? []) {
    const r = row as { follower_id: string; following_id: string };
    mutualByCandidate.set(
      r.follower_id,
      (mutualByCandidate.get(r.follower_id) ?? 0) + 1,
    );
  }

  return candidateIds
    .map((id) => {
      const profile = profileById.get(id);
      if (!profile) return null;
      const a = viewerFollows.has(id);
      const b = followsViewer.has(id);
      let state: ConnectionState;
      if (id === viewerId) state = "self";
      else if (a && b) state = "connected";
      else if (a) state = "following";
      else if (b) state = "followed_by";
      else state = "none";
      return {
        ...profile,
        mutual_count: mutualByCandidate.get(id) ?? 0,
        follow_state: state,
      } satisfies UserCardData;
    })
    .filter((row): row is UserCardData => row !== null);
}
