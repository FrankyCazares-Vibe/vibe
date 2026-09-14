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

/**
 * Rows per `connections` page. PostgREST truncates a response at
 * `max_rows = 1000` (supabase/config.toml:18) and a truncated response carries
 * NO error, so an unpaged row read comes back SHORT and silently complete —
 * the same class of quiet lie `src/lib/posts/honest-views.ts` exists to remove.
 * The loop below advances by the rows actually returned and stops on an EMPTY
 * page, never a short one, so it stays correct if the deployed cap is lower
 * than this number.
 */
const CONNECTIONS_PAGE = 1000;

/**
 * Refuse to answer rather than scan the world: past this many follow edges for
 * one caller we say "we do not know" instead of handing back a partial set that
 * would read as a complete one.
 */
const CONNECTIONS_SCAN_CAP = 20_000;

/**
 * How many ids go into one `.in("following_id", ...)` filter. `connections` has
 * `UNIQUE (follower_id, following_id)`, so for a fixed follower a chunk of N ids
 * matches at most N rows — keeping the chunk under the row cap means that read
 * can never truncate either, and the request URL stays a sane length.
 */
const IN_FILTER_CHUNK = 500;

/**
 * The ids behind "you both follow": people `targetId` follows whom `viewerId`
 * also follows. Directed on purpose — it is the same math `hydrateUserCards`
 * uses for `mutual_count` (the mutual-edges query below), so the pill on a
 * profile and the list behind it (`/api/users/[handle]/mutuals`) can never
 * disagree. The strict reciprocal definition lives in `getCountsFor` and is a
 * different number on purpose.
 *
 * Order is deterministic — the *target's* follow edge newest first, ties broken
 * by the connection row id — because the mutuals route pages this array with
 * `slice(offset, offset + limit)` across separate HTTP calls; a wobbly order
 * would show the same person on two pages and skip someone else entirely.
 *
 * `{ ok: false }` means a read was refused, not that there is nobody. Callers
 * that can say so (the route) turn that into a 500 instead of painting an empty
 * list — same reason `/api/feed` fails closed on `loadHiddenUsers`. The shape
 * mirrors `loadHiddenUsers` in `src/lib/safety/hidden-users.ts`.
 *
 * Neither read can truncate. Step 1 is paged (`.range()`, ordered, stop on an
 * empty page) and step 2 is chunked below the row cap, because both are ROW
 * reads and PostgREST caps those at 1000 with no error to say so. The old
 * unpaged shape — inherited from `getCountsFor`'s following-id list, which
 * still has it — would have dropped every mutual whose edge fell outside an
 * arbitrary 1000 for anyone following more than that, and, with no ORDER BY,
 * would have returned a *different* arbitrary 1000 on the route's second page
 * request: the exact double-show the ordering note above exists to prevent.
 */
export async function loadMutualIds(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: unknown }> {
  if (viewerId === targetId) return { ok: true, ids: [] };

  // Step 1 — everyone the VIEWER follows. Ordered by `following_id`, which is
  // unique for a fixed `follower_id`, so the pages form one total order: no id
  // lands in two of them and none is skipped.
  const viewerFollowingIds: string[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", viewerId)
      .order("following_id", { ascending: true })
      .range(
        viewerFollowingIds.length,
        viewerFollowingIds.length + CONNECTIONS_PAGE - 1,
      );
    if (error || !data) {
      console.error("[connections.loadMutualIds viewer]", error);
      return {
        ok: false,
        error: error ?? new Error("connections read returned no rows"),
      };
    }
    const page = data as { following_id: string }[];
    if (page.length === 0) break;
    for (const r of page) viewerFollowingIds.push(r.following_id);
    if (viewerFollowingIds.length >= CONNECTIONS_SCAN_CAP) {
      console.error(
        `[connections.loadMutualIds] viewer follows at least ${CONNECTIONS_SCAN_CAP} people — refusing to answer from a partial scan`,
      );
      return { ok: false, error: new Error("connections scan cap exceeded") };
    }
  }
  if (viewerFollowingIds.length === 0) return { ok: true, ids: [] };

  // Step 2 — of those, the ones the TARGET follows too. Chunked so neither the
  // URL nor the response can grow past a page (see IN_FILTER_CHUNK).
  type MutualEdge = { id: string; following_id: string; created_at: string };
  const edges: MutualEdge[] = [];
  for (let i = 0; i < viewerFollowingIds.length; i += IN_FILTER_CHUNK) {
    const chunk = viewerFollowingIds.slice(i, i + IN_FILTER_CHUNK);
    const { data, error } = await supabase
      .from("connections")
      .select("id, following_id, created_at")
      .eq("follower_id", targetId)
      .in("following_id", chunk);
    if (error || !data) {
      console.error("[connections.loadMutualIds target]", error);
      return {
        ok: false,
        error: error ?? new Error("connections read returned no rows"),
      };
    }
    for (const row of data as MutualEdge[]) edges.push(row);
  }

  // Sorted here rather than by PostgREST because the chunks above come back
  // independently. Same order the single query used to ask for: `created_at`
  // newest first, then the row id (the primary key, so the order is total).
  const timeOf = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  };
  edges.sort((a, b) => {
    const byTime = timeOf(b.created_at) - timeOf(a.created_at);
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // The (follower_id, following_id) pair is unique, but dedupe anyway so a
  // duplicate row could never put one person on the page twice.
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of edges) {
    if (seen.has(row.following_id)) continue;
    seen.add(row.following_id);
    ids.push(row.following_id);
  }
  return { ok: true, ids };
}

/**
 * @deprecated — count paths only; list routes MUST use `loadMutualIds` so a
 * refused read can 500. This wrapper is fail-soft on purpose: `[]` for self and
 * `[]` on any refused read. Rendering that `[]` as a list would tell someone
 * "no one you both follow yet" over a database that is simply not answering,
 * which rule 1.3 of the wave plan forbids. Callers that only need a number (the
 * profile pill, via `getMutualCount`) have always treated a broken read as 0,
 * so they keep that behaviour and nothing else should adopt it.
 */
export async function getMutualIds(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<string[]> {
  const res = await loadMutualIds(supabase, viewerId, targetId);
  return res.ok ? res.ids : [];
}

/**
 * Number of people `targetId` follows whom `viewerId` also follows — the
 * profile pill's "N you both follow". Defined as the length of `getMutualIds`
 * so the pill and the list behind it are literally the same set; callers
 * (`src/app/api/users/[handle]/bootstrap/route.ts`) are unchanged.
 */
export async function getMutualCount(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<number> {
  return (await getMutualIds(supabase, viewerId, targetId)).length;
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
