/**
 * Community rules for the three DISCOVERY surfaces — the people rail, the
 * feed's campus lane, and user search (plan §2.4, wave 2 batch B9; Franky's
 * Q2; critic A7, B1, C4). Pure functions, no I/O: every DB read stays in the
 * routes, so these rules can be unit-tested (`community-scope.test.ts`).
 *
 * THE THREE RULES
 *
 * 1. WHO IS DISCOVERABLE. A candidate has to be school-verified AND finished
 *    with onboarding — the plan's two clauses (§2.4), and nothing else. That
 *    is what removes the 5 stranded `u<32hex>` accounts (plan §2.7; live
 *    2026-09-15: 5 stranded, 0 of them onboarded). `otto_answers` is a
 *    private column, so the routes read it with the service role and pass the
 *    row here.
 *
 * 2. WHICH COMMUNITY. Comparison is `campus_id` equality, never a label:
 *    Indianapolis is ONE row shared by IU and Purdue, so an IU Indy student
 *    and a Purdue Indy student compare equal (`same_campus`) while their
 *    badges still say IU and Purdue. Same-university-different-campus is a
 *    weaker `same_system` signal, and other-system-other-campus people are
 *    not suggested at all (§2.4 "Never other-system people outside
 *    Indianapolis"). Profiles, search, follows and DMs stay global (Q2), so
 *    this is relevance, not secrecy — RLS lets any signed-in user read these
 *    rows directly (§2.4 honesty note).
 *
 * 3. THE CAMPUS LANE. Posts whose `campus_id` is the viewer's home campus,
 *    PLUS the campus-less pile — legacy posts of the viewer's university, and
 *    posts stamped with no university at all (critic A7: those rows would
 *    otherwise be visible to every university forever, or to nobody) — PLUS
 *    posts by people the viewer follows wherever they are (follows are
 *    global, so their posts must be reachable). `?campus=<id>` switches to
 *    another campus in the viewer's allowed set — that browse view is that
 *    campus only.
 *
 * COMPATIBILITY (critic C4). `suggestionReasons` still emits today's legacy
 * `reason` strings — the deployed phone groups on the literal "same school"
 * (`NetworkMobile.tsx:943`) for days after this ships — and adds the new
 * vocabulary as a separate `reason_v2`. Wave 3 (B14) reads `reason_v2` and
 * the legacy string can go with it.
 */

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isUuid } from "@/lib/pgrest";

import {
  allowedCampusIdsFor,
  resolveScopeV2,
  scopeCampusIds,
  type CampusScopeForbidden,
  type CampusScopeV2,
  type ScopeViewer,
} from "./campus-scope";
import { campusRowById, isSchoolSystem, type SchoolSystem } from "./campuses";

// ─────────────────────────────────────────────────────────────────────────
// 1. Who is discoverable
// ─────────────────────────────────────────────────────────────────────────

/**
 * The `public.users` columns {@link isDiscoverableAccount} needs. Read with
 * the SERVICE role: `otto_answers` has no SELECT grant for `authenticated`
 * (checked live, 2026-09-15). None of these columns may be echoed to a
 * client — the routes carry them only as far as this predicate.
 */
export const DISCOVERABLE_USER_COLUMNS = "id,school_verified,otto_answers";

export type DiscoverableRow = {
  school_verified?: unknown;
  otto_answers?: unknown;
};

/**
 * True when this account is a real, finished student account that belongs in
 * discovery: school-verified AND onboarding saved (`otto_answers` non-empty,
 * the same test `campus-access.ts` gates the app on). Those are the plan's two
 * clauses (§2.4 "Exclude unverified and not-onboarded accounts") and nothing
 * else — a student who finished onboarding is findable, full stop.
 *
 * `school_verified` alone would leave one of the 5 stranded accounts (live,
 * 2026-09-15: 5 stranded, 1 of them verified, 0 onboarded), so the onboarding
 * test is the load-bearing one — and on its own it removes all five.
 *
 * DELIBERATELY NOT TESTED: the handle. It is still optional in the bundle
 * deployed right now (`OnboardingMobile.tsx:403` claims one only when it's
 * non-empty and valid, and nothing gates Finish on it), so during the wave-2 →
 * wave-3 window a tester who taps past that field is a FINISHED student still
 * carrying the trigger's `u<32hex>` handle. Rejecting them here would hide
 * them from search and the people rail while they stayed visible in
 * `/api/search`, on their profile and in DMs — a broken rail, not a prompt to
 * pick a handle.
 *
 * A missing row is NOT discoverable: a candidate we couldn't read is a
 * candidate we can't vouch for.
 */
export function isDiscoverableAccount(row: DiscoverableRow | null | undefined): boolean {
  if (!row) return false;
  if (row.school_verified !== true) return false;
  return isOttoOnboardingComplete(row.otto_answers);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Which community
// ─────────────────────────────────────────────────────────────────────────

/** A viewer or candidate, as the two campus columns on `public.users`. */
export type CommunityMember = {
  /** `users.campus_id`. */
  campusId: string | null | undefined;
  /** `users.school_system`. */
  system: SchoolSystem | null | undefined;
};

/**
 * The viewer's home campus id, or null when they have none (or hold one
 * outside their university, which only a trigger bypass could produce).
 * Same resolution the scope helper uses, so the lane and the boost can never
 * disagree with `?campus=`.
 */
export function homeCampusIdFor(viewer: ScopeViewer): string | null {
  const scope = resolveScopeV2(null, viewer);
  return scope.kind === "campus" ? scope.campusId : null;
}

/** Canonical campus id of a member, or null (unset, or an id we don't know). */
function memberCampusId(m: CommunityMember | null | undefined): string | null {
  return campusRowById(m?.campusId)?.id ?? null;
}

export type CommunityTraits = {
  /** Same campus row — so IU Indy and Purdue Indy are `true` together. */
  sameCampus: boolean;
  /** Same university, different (or no) campus. Never true with `sameCampus`. */
  sameSystem: boolean;
  /** Same non-empty major string. Independent of the campus signals. */
  sameMajor: boolean;
};

/**
 * Compare a candidate to the viewer. Every signal is false when the viewer's
 * side is unset, so an incomplete viewer profile never produces a claim we
 * can't back ("same campus" on two blank campuses would be a lie).
 */
export function communityTraits(
  viewer: CommunityMember & { major?: string | null },
  candidate: CommunityMember & { major?: string | null },
): CommunityTraits {
  const viewerCampus = memberCampusId(viewer);
  const candidateCampus = memberCampusId(candidate);
  const sameCampus = !!viewerCampus && viewerCampus === candidateCampus;
  const sameSystem =
    !sameCampus && isSchoolSystem(viewer?.system) && viewer.system === candidate?.system;
  const viewerMajor = (viewer?.major ?? "").trim();
  const candidateMajor = (candidate?.major ?? "").trim();
  return {
    sameCampus,
    sameSystem,
    sameMajor: viewerMajor.length > 0 && viewerMajor === candidateMajor,
  };
}

/**
 * Whether a STRANGER (cold-start pool) may be suggested to this viewer: a
 * campus in the viewer's allowed set — which is how a Purdue Indy student
 * reaches an IU student and vice versa — or no campus yet but the same
 * university.
 *
 * Not applied to graph-derived candidates (friends-of-friends, club peers):
 * those are anchored in a relationship the student already has, and follows
 * are global (Q2). A viewer with no system (unverified, or a legacy row the
 * backfill didn't reach) has no university to scope to and sees everyone,
 * matching the "none" rule in critic A7.
 */
export function inPeopleCommunity(candidate: CommunityMember, viewer: CommunityMember): boolean {
  if (!isSchoolSystem(viewer?.system)) return true;
  const campusId = memberCampusId(candidate);
  if (campusId) return allowedCampusIdsFor(viewer.system).includes(campusId);
  return candidate?.system === viewer.system;
}

/**
 * PostgREST `.or()` fragment that pre-filters the cold-start pool to
 * {@link inPeopleCommunity} — the query does the cheap part, the predicate
 * above stays authoritative. Null when the viewer has no system (no filter).
 *
 * Campus ids come from our own frozen table and the system is a narrowed
 * union, so nothing user-supplied enters the filter grammar.
 */
export function peopleCommunityOrFilter(system: SchoolSystem | null | undefined): string | null {
  if (!isSchoolSystem(system)) return null;
  const ids = allowedCampusIdsFor(system);
  return `campus_id.in.(${ids.join(",")}),and(campus_id.is.null,school_system.eq.${system})`;
}

// ─────────────────────────────────────────────────────────────────────────
// Suggestion reasons and ordering
// ─────────────────────────────────────────────────────────────────────────

/**
 * The new reason vocabulary (plan §3.4). `mutuals` and `new_on_vibe` round it
 * out so every row has one: the four named reasons describe why a STRANGER is
 * here, and a friend-of-friend from another university matches none of them.
 */
export type SuggestionReasonV2 =
  | "from_your_clubs"
  | "same_campus"
  | "same_major"
  | "same_system"
  | "mutuals"
  | "new_on_vibe";

export type SuggestionSignals = {
  mutuals: number;
  sharedOrgs: number;
  sameCampus: boolean;
  sameMajor: boolean;
  sameSystem: boolean;
};

/**
 * Both reason strings for one candidate.
 *
 * `reason` is byte-for-byte what this route emits today, including "same
 * school" for a campus match: the deployed phone bundle groups on that exact
 * literal (critic C4) and will keep doing so until wave 3 ships. `reason_v2`
 * is the new vocabulary, ordered like the onboarding people step's groups
 * (§3.5): your clubs, your campus, your major, then elsewhere at your
 * university.
 */
export function suggestionReasons(s: SuggestionSignals): {
  reason: string;
  reason_v2: SuggestionReasonV2;
} {
  const mutuals = s.mutuals > 0 ? s.mutuals : 0;
  const sharedOrgs = s.sharedOrgs > 0 ? s.sharedOrgs : 0;

  const reason =
    mutuals > 0
      ? `${mutuals} mutual${mutuals === 1 ? "" : "s"}`
      : sharedOrgs > 0
        ? sharedOrgs === 1
          ? "in your org"
          : `${sharedOrgs} shared orgs`
        : s.sameMajor
          ? "same major"
          : s.sameCampus
            ? "same school"
            : "new on Vibe";

  const reason_v2: SuggestionReasonV2 =
    sharedOrgs > 0
      ? "from_your_clubs"
      : s.sameCampus
        ? "same_campus"
        : s.sameMajor
          ? "same_major"
          : s.sameSystem
            ? "same_system"
            : mutuals > 0
              ? "mutuals"
              : "new_on_vibe";

  return { reason, reason_v2 };
}

/**
 * Suggestion order: mutuals → shared orgs → same campus → same major → same
 * university. The graph signals stay above campus (a real mutual elsewhere
 * beats a stranger next door) and campus stays above major, which is the
 * founder's call. Nothing here excludes anyone; it only decides who fills the
 * rail first.
 */
export function compareSuggestions(a: SuggestionSignals, b: SuggestionSignals): number {
  return (
    b.mutuals - a.mutuals ||
    b.sharedOrgs - a.sharedOrgs ||
    Number(b.sameCampus) - Number(a.sameCampus) ||
    Number(b.sameMajor) - Number(a.sameMajor) ||
    Number(b.sameSystem) - Number(a.sameSystem)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. The campus lane
// ─────────────────────────────────────────────────────────────────────────

/**
 * How many followed authors can ride along in the feed's `.or()` filter.
 * Each id costs ~40 characters of URL, and PostgREST takes the whole query in
 * the URL, so an unbounded set would eventually produce a request no proxy
 * accepts. At the cap, posts from the overflow authors are still reachable —
 * they just have to be in the scoped campus set like everyone else. Live max
 * outgoing follows today: well under 30.
 */
export const FOLLOWED_AUTHOR_FILTER_CAP = 300;

/**
 * How many followed CLUBS ride along in the same `.or()` filter (wave plan
 * batch F4, critic C20). The URL budget is shared with the author list: 300
 * author uuids cost about 11.1 KB, 50 club uuids add about 1.9 KB, and the
 * route's blocked/muted `not.in` list comes on top of both. The caller passes
 * its follows newest first, so the newest 50 are the ones kept; the feed
 * route logs when it has to truncate. A club past the cap still reaches the
 * viewer through the campus rule, and still gets the follow boost in ranking.
 */
export const FOLLOWED_ORG_FILTER_CAP = 50;

/** Default for the optional followed-club sets below, so 3- and 4-argument callers are unchanged. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export type FeedLane =
  /** No university to scope to (critic A7) — the feed stays global. */
  | { kind: "everything" }
  | {
      kind: "scoped";
      /** `posts.campus_id` values in the lane. */
      campusIds: string[];
      /**
       * University whose campus-less legacy posts belong in this lane, or
       * null to exclude them (a browse view of someone else's campus).
       *
       * Non-null also pulls in posts stamped with NO university (`campus_id`
       * and `school_system` both null). `posts_stamp_campus` copies both from
       * the author at INSERT and pins them on every UPDATE, so a post written
       * before its author verified is null/null forever — it can never be
       * rescued, not even by the author verifying later. Matching no lane
       * would mean silently dropping a student's own post; the campus-less
       * pile is where it belongs. Live count today: 0.
       */
      legacySystem: SchoolSystem | null;
      /** Whether posts by people the viewer follows join the lane. */
      includeFollowed: boolean;
    };

/**
 * The lane for one request.
 *
 * - home (no `?campus=`, or `?campus=` equal to the home campus): home campus
 *   + the viewer's university's campus-less legacy posts + followed authors.
 * - `?campus=all`, or no home campus at all ("none"): every campus in the
 *   allowed set, same extras.
 * - `?campus=<another allowed campus>`: that campus only. Browsing Bloomington
 *   should show Bloomington, not your Indianapolis friends and not the legacy
 *   pile, so the extras are off.
 * - no system: everything, because we have no university to scope to.
 *
 * Callers must handle `{ kind: "forbidden" }` from `resolveScopeV2` first.
 */
export function feedLaneFor(scope: CampusScopeV2, viewer: ScopeViewer): FeedLane {
  const home = homeCampusIdFor(viewer);
  const system = isSchoolSystem(viewer?.system) ? viewer.system : null;

  if (scope.kind === "campus" && scope.campusId !== home) {
    return { kind: "scoped", campusIds: [scope.campusId], legacySystem: null, includeFollowed: false };
  }
  if (!system) return { kind: "everything" };

  return {
    kind: "scoped",
    campusIds: scopeCampusIds(scope),
    legacySystem: system,
    includeFollowed: true,
  };
}

/**
 * The lane as a PostgREST `.or()` fragment, or null when nothing should be
 * filtered. `followedAuthorIds` are the viewer's outgoing follows (already
 * minus hidden users); non-uuid values are dropped rather than trusted into
 * the filter grammar, and the list is capped (see
 * {@link FOLLOWED_AUTHOR_FILTER_CAP}).
 *
 * `followedOrgIds` are the clubs the viewer follows, newest first and already
 * minus hidden clubs (the caller resolves those with the service client).
 * Posts made AS one of those clubs join the lane wherever the club is, on the
 * same terms as a followed author: home lane only, never a browse view. Same
 * uuid screen, deduped, capped at {@link FOLLOWED_ORG_FILTER_CAP}. It is a
 * parameter rather than a `FeedLane` field (critic C10), so the lane itself
 * and every existing caller stay as they were.
 */
export function feedLaneOrFilter(
  lane: FeedLane,
  followedAuthorIds: string[] = [],
  followedOrgIds: string[] = [],
): string | null {
  if (lane.kind === "everything") return null;

  const parts: string[] = [];
  const campusIds = lane.campusIds.map((id) => campusRowById(id)?.id).filter((id): id is string => !!id);
  if (campusIds.length > 0) parts.push(`campus_id.in.(${campusIds.join(",")})`);
  if (lane.legacySystem) {
    parts.push(`and(campus_id.is.null,school_system.eq.${lane.legacySystem})`);
    // Posts stamped with neither a campus nor a university — see `legacySystem`.
    parts.push("and(campus_id.is.null,school_system.is.null)");
  }
  if (lane.includeFollowed) {
    const ids = followedAuthorIds.filter(isUuid).slice(0, FOLLOWED_AUTHOR_FILTER_CAP);
    if (ids.length > 0) parts.push(`user_id.in.(${ids.join(",")})`);
    const orgIds = Array.from(new Set(followedOrgIds.filter(isUuid))).slice(0, FOLLOWED_ORG_FILTER_CAP);
    if (orgIds.length > 0) parts.push(`org_id.in.(${orgIds.join(",")})`);
  }
  // An empty lane must match nothing, not everything. `posts.id` is the
  // primary key, so `id.is.null` is always false.
  return parts.length > 0 ? parts.join(",") : "id.is.null";
}

/**
 * The same rule as {@link feedLaneOrFilter}, in TypeScript. The query decides
 * what comes back; this is the belt-and-braces check on what goes out, so a
 * mistake in the filter grammar can't put another university's post on the
 * page.
 *
 * `followedOrgIds` is the viewer's followed, NOT hidden clubs: a post made as
 * one of them passes wherever `includeFollowed` would pass a followed author.
 */
export function postInFeedLane(
  post: {
    user_id?: string | null;
    org_id?: string | null;
    campus_id?: string | null;
    school_system?: string | null;
  },
  lane: FeedLane,
  followedAuthorIds: ReadonlySet<string>,
  followedOrgIds: ReadonlySet<string> = EMPTY_SET,
): boolean {
  if (lane.kind === "everything") return true;
  const campusId = post?.campus_id ?? null;
  if (campusId && lane.campusIds.includes(campusId)) return true;
  if (!campusId && lane.legacySystem) {
    const system = post?.school_system ?? null;
    // The viewer's university's legacy posts, plus the ones stamped with no
    // university at all (see `legacySystem`).
    if (system === lane.legacySystem || system === null) return true;
  }
  return (
    (lane.includeFollowed && typeof post?.user_id === "string" && followedAuthorIds.has(post.user_id)) ||
    (lane.includeFollowed && typeof post?.org_id === "string" && followedOrgIds.has(post.org_id))
  );
}

/** HTTP answer for a `?campus=` value the viewer may not use (plan §2.4). */
export function campusScopeError(scope: CampusScopeForbidden): {
  status: number;
  body: { ok: false; code: string; error: string };
} {
  return scope.reason === "campus_not_in_system"
    ? {
        status: 403,
        body: {
          ok: false,
          code: "campus_not_in_system",
          error: "That campus isn't part of your university.",
        },
      }
    : { status: 400, body: { ok: false, code: "unknown_campus", error: "Unknown campus." } };
}

// ─────────────────────────────────────────────────────────────────────────
// Feed ranking
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tier-1 feed ranking score. Hand-tuned heuristic — no ML. The shape is a
 * Hacker-News-style decay, plus additive boosts from the viewer's social
 * graph:
 *
 *     engagement = 1 + likes + 2*reposts + comments
 *     base       = engagement / (age_hours + 2)^1.5
 *     score      = base
 *                  * (1.6  if the viewer follows the author OR the club the
 *                           post was made as, else 1.0 — once, never 1.6²)
 *                  * (1.35 if the post is on the viewer's home campus, else 1.0)
 *                  + 3 * friend_reposter_count
 *
 * Why these numbers (subject to tuning once we have engagement data):
 *   - Baseline +1 keeps brand-new no-engagement posts from scoring 0 and
 *     dropping out of the candidate pool entirely.
 *   - Reposts > comments > likes — reposts spend "social capital" and show up
 *     on someone's profile, so they're the strongest signal.
 *   - Decay exponent 1.5 is gentler than HN's 1.8 so good content can live
 *     ~24h on the feed before being aged out.
 *   - Follow boost is multiplicative so a stale post from a friend doesn't
 *     beat a fresh popular one purely from an additive trap. The
 *     friend-repost boost is additive and per-reposter (max 3) since each
 *     fresh reposter is a separate endorsement.
 *   - Following a club is the same deliberate act as following a person, so
 *     a post made as a followed club gets the same 1.6 (wave plan F4). An
 *     officer you follow posting as a club you follow still gets one 1.6,
 *     not 2.56: it is one post you asked to see, not two. `followedOrgIds`
 *     must already be minus hidden clubs.
 *
 * HOME-CAMPUS BOOST (1.35, multiplicative). The lane already decides WHAT is
 * in the pool; this decides what floats. Inside a lane that mixes the home
 * campus with legacy campus-less posts and followed authors elsewhere, 1.35
 * keeps home-campus posts on top without burying the rest.
 *   - It sits deliberately BELOW the 1.6 follow boost: following someone is a
 *     deliberate act, campus is where you happen to be. (ln 1.35 / ln 1.6 ≈
 *     0.64; they compound to 2.16x for a followed home-campus author.)
 *   - Through the 1.5 decay exponent it buys an effective head start of
 *     1.35^(1/1.5) ≈ 1.22 — a home-campus post beats an equally-engaged one
 *     that is up to ~22% fresher, while a stale home-campus post still loses
 *     to a fresh, well-engaged one from elsewhere.
 *   - Compared on `campus_id`, so shared Indianapolis is one campus: a Purdue
 *     Indy post gets the boost for an IU Indy viewer, which is the whole
 *     point of the shared row. It was a label comparison before, which could
 *     never see that.
 *   - Inert when the viewer has no home campus, or the post has none.
 */
export const SAME_CAMPUS_BOOST = 1.35;

export function scoreFeedRow(
  post: {
    user_id: string;
    created_at: string;
    like_count: number;
    comment_count: number;
    repost_count: number;
    friend_reposter_count?: number;
    campus_id?: string | null;
    org_id?: string | null;
  },
  nowMs: number,
  viewerFollowingIds: ReadonlySet<string>,
  homeCampusId: string | null,
  followedOrgIds: ReadonlySet<string> = EMPTY_SET,
): number {
  const ageHours = Math.max(0, (nowMs - new Date(post.created_at).getTime()) / 3_600_000);
  const engagement =
    1 + (post.like_count ?? 0) + 2 * (post.repost_count ?? 0) + (post.comment_count ?? 0);
  let score = engagement / Math.pow(ageHours + 2, 1.5);
  if (viewerFollowingIds.has(post.user_id) || (post.org_id != null && followedOrgIds.has(post.org_id))) {
    score *= 1.6;
  }
  if (homeCampusId && post.campus_id === homeCampusId) score *= SAME_CAMPUS_BOOST;
  score += 3 * (post.friend_reposter_count ?? 0);
  return score;
}

/**
 * The bucket the feed's diversity cap counts a post in (critic C1). A post
 * made as a club counts against the CLUB, so two officers posting for one
 * club share one cap and a club can't carpet the page. A personal post counts
 * against its author. Keyed on `org_id`, never on an embedded org object: the
 * embed was null for anyone `orgs_select` hid the club from, which silently
 * put every club post back in its officer's bucket. Pass a row whose `org_id`
 * is already null for a hidden club, so that post reads as the author's own.
 */
export function feedDiversityKey(post: { user_id: string; org_id?: string | null }): string {
  return post.org_id ? `org:${post.org_id}` : `user:${post.user_id}`;
}
