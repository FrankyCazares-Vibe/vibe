import type { SupabaseClient } from "@supabase/supabase-js";

import { blockPairFilter } from "@/lib/safety/pair-block";

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

/**
 * Read-only fetch of follower / following / connection counts for one user.
 *
 * WHICH CLIENT (T1). Policy `connections_select_either_party` (migration
 * `20260922110000_t1_close_world_readable_selects.sql`) shows a user client
 * only the edges it is part of. So a user client counts correctly only when
 * `userId` IS the signed-in user (`me/connections-summary`,
 * `me/profile-bootstrap`). For anyone else, pass the service client, or
 * every number comes back as "edges that touch the viewer". The service
 * client skips RLS, so the CALLER does the authorization first
 * (`users/[handle]/bootstrap` answers blocked pairs before it gets here).
 * Counts are public; only the three numbers may leave the route.
 */
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
 * How many peers go into one `blocks` read in `loadMutualIds` step 3. The
 * block-pair filter lists every id twice (once per direction), so at
 * IN_FILTER_CHUNK its URL would be about twice as long as step 2's. Half the
 * chunk keeps it about the length of the URL step 2 already sends (~20 KB
 * encoded, measured with node's URL).
 */
const BLOCK_PEER_CHUNK = IN_FILTER_CHUNK / 2;

/**
 * The ids behind "you both follow": people `targetId` follows whom `viewerId`
 * also follows. Directed on purpose — it is the same math `hydrateUserCards`
 * gets for `mutual_count` from the `mutual_follow_counts` RPC, so the pill on
 * a profile, the list behind it (`/api/users/[handle]/mutuals`) and the
 * target's card in any list can never disagree. The strict reciprocal
 * definition lives in `getCountsFor` and is a different number on purpose.
 *
 * Blocks (rulings M4, M12). Anyone in a block pair with the viewer, in either
 * direction, is dropped from the answer, and a target in a block pair with the
 * viewer has no mutuals at all. The RPC skips the same people, which keeps the
 * three numbers above equal.
 *
 * WHICH CLIENT (T1). Step 2 reads the TARGET's edges. Under policy
 * `connections_select_either_party` a user client sees only edges it is part
 * of, so for any target other than the viewer this must be handed the service
 * client (the mutuals route and bootstrap both do). The service client skips
 * RLS, so the CALLER does the authorization check (the viewer is signed in,
 * and the viewer↔target block check has run) before calling this. Only ids
 * leave; the caller decides what to show.
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
 * No read can truncate. Step 1 is paged (`.range()`, ordered, stop on an
 * empty page) and steps 2 and 3 are chunked at or below the row cap, because
 * all three are ROW reads and PostgREST caps those at 1000 with no error to
 * say so. The old unpaged shape — inherited from `getCountsFor`'s
 * following-id list, which still has it — would have dropped every mutual
 * whose edge fell outside an arbitrary 1000 for anyone following more than
 * that, and, with no ORDER BY, would have returned a *different* arbitrary
 * 1000 on the route's second page request: the exact double-show the
 * ordering note above exists to prevent.
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
  if (ids.length === 0) return { ok: true, ids };

  // Step 3 — drop block pairs with the viewer (see the docblock). The target
  // goes in the same read. `blocks` is UNIQUE (blocker_id, blocked_id), so a
  // chunk of N peers matches at most 2N rows: 500 at BLOCK_PEER_CHUNK, under
  // the row cap, so this read cannot truncate either, and its URL stays about
  // as long as step 2's. The filter comes from the one block-pair module
  // (rulings M11); it is null for a non-UUID id, which counts as a refused
  // read, never as "not blocked".
  const peers = [targetId, ...ids];
  const blockedPeers = new Set<string>();
  const viewerLower = viewerId.toLowerCase();
  for (let i = 0; i < peers.length; i += BLOCK_PEER_CHUNK) {
    const filter = blockPairFilter(viewerId, peers.slice(i, i + BLOCK_PEER_CHUNK));
    if (filter === null) {
      console.error("[connections.loadMutualIds blocks] bad id");
      return { ok: false, error: new Error("bad id") };
    }
    const { data, error } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(filter);
    if (error || !data) {
      console.error("[connections.loadMutualIds blocks]", error);
      return {
        ok: false,
        error: error ?? new Error("blocks read returned no rows"),
      };
    }
    for (const row of data as { blocker_id: string; blocked_id: string }[]) {
      const blocker = String(row.blocker_id).toLowerCase();
      const blocked = String(row.blocked_id).toLowerCase();
      blockedPeers.add(blocker === viewerLower ? blocked : blocker);
    }
  }
  if (blockedPeers.has(targetId.toLowerCase())) return { ok: true, ids: [] };
  return {
    ok: true,
    ids: ids.filter((id) => !blockedPeers.has(id.toLowerCase())),
  };
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
 * NEVER PASS THE SERVICE CLIENT (rulings M3). Hand this the signed-in
 * viewer's cookie client, and `viewerId` must be that same user.
 * `mutual_follow_counts` keys on `auth.uid()`, which is NULL under the
 * service role, so with the service client every card's `mutual_count`
 * silently reads 0 (no error to say so). This is the opposite of
 * `getCountsFor` and `loadMutualIds`, which need the service client for
 * someone else's edges. Reviewer check: `grep -rnE
 * 'hydrateUserCards\((service|createSupabaseServiceClient)' src` prints
 * nothing.
 *
 * Four batched reads in parallel, regardless of page size:
 *   1. Profiles for the candidate slice.
 *   2. Outgoing edges (viewer → candidate) for follow_state.
 *   3. Incoming edges (candidate → viewer) for follow_state.
 *   4. Mutual counts from the `mutual_follow_counts` RPC: for each candidate,
 *      how many of their followings the viewer also follows, skipping block
 *      pairs with the viewer (rulings M4). Numbers only, never who.
 * Steps 2 and 3 read edges the viewer is part of, which is all policy
 * `connections_select_either_party` shows a user client.
 */
export async function hydrateUserCards(
  supabase: SupabaseClient,
  viewerId: string,
  candidateIds: string[],
): Promise<UserCardData[]> {
  if (candidateIds.length === 0) return [];

  const [profilesRes, outEdgesRes, inEdgesRes, mutualByCandidate] = await Promise.all([
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
    loadMutualFollowCounts(supabase, candidateIds),
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

/** `mutual_follow_counts` refuses more ids than this (SQLSTATE 22023). */
const MUTUAL_RPC_MAX_IDS = 1000;

/** A count from the RPC as a whole number: NaN, negatives, non-finite or missing → 0. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * `mutual_count` per candidate, from `rpc("mutual_follow_counts", { p_user_ids })`
 * (migration `20260922100000_t1_count_and_visibility_fns.sql`). Rows are
 * `{ user_id, mutual_count }`, only where the count is above 0, so a missing
 * candidate reads 0. Deduped and chunked at 1000.
 *
 * Keys are the caller's own spelling of each id. Postgres returns uuids in
 * lower case, so rows are matched in lower case: an id passed in upper case
 * would otherwise always read 0.
 *
 * On any error: `console.error("[connections.hydrateUserCards mutual]")` and
 * an empty map, so every card shows 0, which is what the old row read gave on
 * a failure. It is a hint on a card, not a list, so a card still renders.
 * The viewer is `auth.uid()`: see the service-client warning on
 * `hydrateUserCards`.
 */
async function loadMutualFollowCounts(
  supabase: SupabaseClient,
  candidateIds: string[],
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(candidateIds));
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MUTUAL_RPC_MAX_IDS) {
    chunks.push(ids.slice(i, i + MUTUAL_RPC_MAX_IDS));
  }

  const byLower = new Map<string, number>();
  try {
    const results = await Promise.all(
      chunks.map((chunk) => supabase.rpc("mutual_follow_counts", { p_user_ids: chunk })),
    );
    for (const res of results) {
      if (res.error) {
        console.error("[connections.hydrateUserCards mutual]", res.error);
        return new Map();
      }
      for (const row of Array.isArray(res.data) ? (res.data as unknown[]) : []) {
        if (!row || typeof row !== "object") continue;
        const r = row as { user_id?: unknown; mutual_count?: unknown };
        if (typeof r.user_id !== "string") continue;
        byLower.set(r.user_id.toLowerCase(), toCount(r.mutual_count));
      }
    }
  } catch (error) {
    console.error("[connections.hydrateUserCards mutual]", error);
    return new Map();
  }

  const out = new Map<string, number>();
  for (const id of ids) out.set(id, byLower.get(id.toLowerCase()) ?? 0);
  return out;
}
