import { NextResponse } from "next/server";

import {
  DISCOVERABLE_USER_COLUMNS,
  communityTraits,
  compareSuggestions,
  homeCampusIdFor,
  inPeopleCommunity,
  isDiscoverableAccount,
  peopleCommunityOrFilter,
  suggestionReasons,
  type SuggestionReasonV2,
} from "@/lib/iu/community-scope";
import { isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
/**
 * Per-query cap on the cold-start fallback pool. Two bounded queries run
 * instead of one so the cap can never turn the campus PREFERENCE back into
 * a de-facto filter within the community: home-campus peers get their own
 * slice, and a community slice guarantees the rest of the viewer's
 * university stays reachable even on a campus with only a couple of signups.
 */
const FALLBACK_POOL_SIZE = 250;

/**
 * Columns the SERVICE role reads for every candidate. `otto_answers` has no
 * SELECT grant for `authenticated` (checked live), which is why this read
 * can't use the caller's client. NONE of these values are echoed to the
 * client: they feed `isDiscoverableAccount` and the community compare, and
 * only `campus_id` / `school_system` (already public columns) survive into
 * the response.
 */
const TRAIT_COLUMNS = `${DISCOVERABLE_USER_COLUMNS},campus_id,school_system,major`;

type TraitRow = {
  id: string;
  school_verified: boolean | null;
  otto_answers: unknown;
  campus_id: string | null;
  school_system: string | null;
  major: string | null;
};

type Traits = {
  campusId: string | null;
  system: SchoolSystem | null;
  major: string | null;
  /** `isDiscoverableAccount` for this row — verified and onboarded. */
  discoverable: boolean;
};

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
  /**
   * True when the candidate is in the viewer's campus COMMUNITY — compared on
   * `campus_id`, so an IU Indy and a Purdue Indy student are `true` together
   * (shared Indianapolis is one row). False when either side has no campus.
   */
  same_campus: boolean;
  /** Same university, different (or no) campus. Never true with `same_campus`. */
  same_system: boolean;
  /** The candidate's campus, for the badge. Null when they haven't picked one. */
  campus_id: string | null;
  /** The candidate's university, for the badge. */
  school_system: SchoolSystem | null;
  /**
   * LEGACY reason string. Unchanged wording, including "same school" for a
   * campus match, because the deployed phone groups on that literal
   * (`NetworkMobile.tsx:943`, critic C4). Wave 3 (B14) switches to
   * `reason_v2` and this can go.
   */
  reason: string;
  /** New vocabulary: from_your_clubs | same_campus | same_major | same_system (+ mutuals / new_on_vibe). */
  reason_v2: SuggestionReasonV2;
};

/**
 * People-you-might-know feed. Strategy in priority order:
 *
 *   1. Friends-of-friends — people connected to your existing connections
 *      who you don't already follow. Sorted by overlap count desc.
 *   2. Shared-org peers — members of orgs/clubs you're in who you haven't
 *      connected with. Sorted by number of shared orgs.
 *   3. Cold-start pool — other students in your community, so the rail is
 *      never empty for users with few connections or org memberships. Within
 *      this tier, home-campus peers rank first, then same-major peers, then
 *      the rest of your university.
 *
 * WHO CAN APPEAR (plan §2.4, §3.4). Two rules, both in
 * `lib/iu/community-scope.ts`:
 *
 *   - DISCOVERABLE. Verified AND onboarded. This is checked on the MERGED
 *     candidate list, so it covers all three sources — a stranded account
 *     can't sneak in as a friend-of-friend either. It removes the 5 stranded
 *     `u<32hex>` accounts (plan §2.7) that pollute the rail today, all of
 *     which are unfinished; a student who finished onboarding always stays,
 *     handle or no handle.
 *   - COMMUNITY. Strangers come from the viewer's allowed set only, which is
 *     what keeps a Purdue West Lafayette student out of an IU student's rail
 *     while keeping Purdue INDIANAPOLIS students in (shared campus row).
 *     Graph-derived candidates skip that check on purpose: follows are
 *     global (Franky's Q2), so a friend-of-friend or a club-mate is a
 *     relationship the student already has, not us widening the browse.
 *
 * Campus comparison is `campus_id` equality, never a label — that is the
 * whole point of one shared Indianapolis row.
 *
 * Filters out: self, already-connected (one-way OR mutual), blocked-either-
 * way (when the blocks table exists), previously dismissed. Capped at
 * `limit` (default 5).
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

  // The discoverable test reads a private column, so this route needs the
  // service role. Without it we would have to either show the stranded
  // accounts or show nothing — both are wrong, so say so instead.
  if (!isSupabaseServiceConfigured()) {
    console.error("[suggested-connections] service role not configured");
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const service = createSupabaseServiceClient();

  // `maybeSingle`, not `single`: a viewer whose `public.users` row is missing
  // still gets a rail — the mutual/shared-org signals need no row of ours, and
  // the campus signals go inert by design when the campus is null. Only a
  // genuine read error fails the request.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("id,campus_id,school_system,major")
    .eq("id", user.id)
    .maybeSingle();
  if (meErr) {
    console.error("[suggested-connections me]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const viewer = {
    campusId: (me?.campus_id as string | null) ?? null,
    system: isSchoolSystem(me?.school_system) ? (me.school_system as SchoolSystem) : null,
    major: (me?.major as string | null) ?? null,
  };
  // The home campus, validated against the viewer's university the same way
  // `?campus=` is. Null simply makes the campus signal inert.
  const homeCampusId = homeCampusIdFor(viewer);

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

  // Traits (campus, university, major, discoverability) for every candidate
  // we might rank, filled opportunistically from the pool queries and topped
  // up below for graph-derived candidates.
  const traitById = new Map<string, Traits>();
  const rememberTraits = (rows: unknown[] | null | undefined) => {
    for (const row of rows ?? []) {
      const r = row as TraitRow;
      traitById.set(r.id, {
        campusId: r.campus_id ?? null,
        system: isSchoolSystem(r.school_system) ? r.school_system : null,
        major: r.major ?? null,
        discoverable: isDiscoverableAccount(r),
      });
    }
  };

  // Cold-start pool. Two bounded queries, run in parallel:
  //   a) home-campus peers — the preferred slice, only when the viewer has a
  //      campus. Shared Indianapolis means this slice already mixes IU and
  //      Purdue students;
  //   b) a community slice — the rest of the viewer's university, so a
  //      student on a campus with two signups still has a rail.
  // Neither is the community rule itself: `inPeopleCommunity` below decides,
  // and these filters just keep the 250-row cap from being spent on people
  // who would be dropped anyway. `school_verified` is filtered in the query
  // for the same reason; the full discoverable test runs after the merge.
  const communityFilter = peopleCommunityOrFilter(viewer.system);
  let communityQuery = service
    .from("users")
    .select(TRAIT_COLUMNS)
    .eq("school_verified", true)
    .neq("id", user.id)
    .order("created_at", { ascending: false })
    .limit(FALLBACK_POOL_SIZE);
  if (communityFilter) communityQuery = communityQuery.or(communityFilter);

  const [campusPeersRes, communityPeersRes] = await Promise.all([
    homeCampusId
      ? service
          .from("users")
          .select(TRAIT_COLUMNS)
          .eq("campus_id", homeCampusId)
          .eq("school_verified", true)
          .neq("id", user.id)
          .limit(FALLBACK_POOL_SIZE)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    communityQuery,
  ]);
  // A short list because a read failed would read as "nobody is here", which
  // is exactly the dishonest empty state this rail exists to avoid.
  if (campusPeersRes.error || communityPeersRes.error) {
    console.error("[suggested-connections pool]", campusPeersRes.error ?? communityPeersRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  rememberTraits(campusPeersRes.data);
  rememberTraits(communityPeersRes.data);

  const fallbackPool: string[] = [];
  const seenFallback = new Set<string>();
  for (const p of [...(campusPeersRes.data ?? []), ...(communityPeersRes.data ?? [])]) {
    const r = p as TraitRow;
    if (seenFallback.has(r.id)) continue;
    seenFallback.add(r.id);
    if (outIds.has(r.id)) continue; // already follow
    if (mutualCount.has(r.id)) continue;
    if (sharedOrgCount.has(r.id)) continue;
    const t = traitById.get(r.id);
    // Strangers only come from the viewer's own community.
    if (!inPeopleCommunity({ campusId: t?.campusId, system: t?.system }, viewer)) continue;
    fallbackPool.push(r.id);
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

  // Top up traits for graph-derived candidates (friends-of-friends and
  // org peers never went through the pool queries above).
  const missingTraitIds = Array.from(candidates.keys()).filter((id) => !traitById.has(id));
  if (missingTraitIds.length > 0) {
    const { data: traitRows, error: traitErr } = await service
      .from("users")
      .select(TRAIT_COLUMNS)
      .in("id", missingTraitIds);
    if (traitErr) {
      console.error("[suggested-connections traits]", traitErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    rememberTraits(traitRows);
  }

  // THE DISCOVERABLE FILTER, after the merge so it covers all three sources.
  // A candidate whose traits we never resolved fails closed.
  const merged = Array.from(candidates.values())
    .filter((e) => traitById.get(e.id)?.discoverable === true)
    .map((e) => {
      const t = traitById.get(e.id);
      const traits = communityTraits(viewer, {
        campusId: t?.campusId,
        system: t?.system,
        major: t?.major,
      });
      return { ...e, ...traits, campusId: t?.campusId ?? null, system: t?.system ?? null };
    })
    .sort(compareSuggestions)
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
    | "mutual_count"
    | "shared_org_count"
    | "same_major"
    | "same_campus"
    | "same_system"
    | "campus_id"
    | "school_system"
    | "reason"
    | "reason_v2"
  >;
  const profileById = new Map<string, ProfileBase>();
  for (const p of profiles ?? []) {
    const u = p as ProfileBase;
    profileById.set(u.id, u);
  }

  const suggestions: Suggestion[] = merged
    .map(({ id, mutuals, sharedOrgs, sameCampus, sameMajor, sameSystem, campusId, system }) => {
      const base = profileById.get(id);
      if (!base) return null;
      const { reason, reason_v2 } = suggestionReasons({
        mutuals,
        sharedOrgs,
        sameCampus,
        sameMajor,
        sameSystem,
      });
      return {
        ...base,
        mutual_count: mutuals,
        shared_org_count: sharedOrgs,
        same_major: sameMajor,
        same_campus: sameCampus,
        same_system: sameSystem,
        campus_id: campusId,
        school_system: system,
        reason,
        reason_v2,
      };
    })
    .filter((s): s is Suggestion => s !== null);

  return NextResponse.json({ ok: true, suggestions });
}
