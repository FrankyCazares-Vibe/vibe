/**
 * Tests for the discovery community rules (`community-scope.ts`, wave 2 B9).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/iu/community-scope.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. The hook maps "@/x" to "src/x.ts" and retries a
 * failed relative specifier with ".ts" (same pattern as
 * `onboarding-prefill.test.ts`). The module loads through dynamic `import()`
 * so the hook is registered first.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("community-scope.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const {
  DISCOVERABLE_USER_COLUMNS,
  FOLLOWED_AUTHOR_FILTER_CAP,
  FOLLOWED_ORG_FILTER_CAP,
  SAME_CAMPUS_BOOST,
  campusScopeError,
  communityTraits,
  compareSuggestions,
  feedDiversityKey,
  feedLaneFor,
  feedLaneOrFilter,
  homeCampusIdFor,
  inPeopleCommunity,
  isDiscoverableAccount,
  peopleCommunityOrFilter,
  postInFeedLane,
  scoreFeedRow,
  suggestionReasons,
} = await import("./community-scope");
const { resolveScopeV2 } = await import("./campus-scope");

const TRIGGER_HANDLE = "u0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const ONBOARDED = { done: true };

const IU_INDY = { campusId: "indianapolis", system: "iu" as const };
const PURDUE_INDY = { campusId: "indianapolis", system: "purdue" as const };
const IU_BLOOMINGTON = { campusId: "iu-bloomington", system: "iu" as const };
const PURDUE_WL = { campusId: "purdue-west-lafayette", system: "purdue" as const };
const IU_NO_CAMPUS = { campusId: null, system: "iu" as const };
const UNVERIFIED = { campusId: null, system: null };

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);

// ── 1. Who is discoverable ───────────────────────────────────────────────

/**
 * `DISCOVERABLE_USER_COLUMNS` no longer selects `handle` and the predicate no
 * longer reads it, so a row carrying one is an excess property to the type.
 * These tests still pass real-shaped rows — the point of several of them is
 * that the handle changes nothing — hence the widened call.
 */
const discoverable = (row: unknown) => isDiscoverableAccount(row as never);

test("discoverable: verified + onboarded, and nothing else is asked", () => {
  assert.equal(discoverable({ handle: "franky", school_verified: true, otto_answers: ONBOARDED }), true);
});

test("discoverable: every missing ingredient disqualifies", () => {
  const cases: Array<[string, unknown]> = [
    ["no row", null],
    ["undefined row", undefined],
    ["unverified", { handle: "franky", school_verified: false, otto_answers: ONBOARDED }],
    ["verified missing", { handle: "franky", otto_answers: ONBOARDED }],
    ["otto null", { handle: "franky", school_verified: true, otto_answers: null }],
    ["otto empty", { handle: "franky", school_verified: true, otto_answers: {} }],
    ["otto array", { handle: "franky", school_verified: true, otto_answers: [1] }],
    ["otto string", { handle: "franky", school_verified: true, otto_answers: "yes" }],
  ];
  for (const [name, row] of cases) {
    assert.equal(discoverable(row), false, name);
  }
});

test("discoverable: onboarding, not the handle, is what removes the stranded rows", () => {
  // The live shape of the 5 stranded rows (1 verified, 0 onboarded).
  assert.equal(discoverable({ handle: TRIGGER_HANDLE, school_verified: true, otto_answers: null }), false);
  assert.equal(discoverable({ handle: TRIGGER_HANDLE, school_verified: false, otto_answers: null }), false);
  // But a student who FINISHED onboarding stays discoverable even while still
  // carrying the trigger's handle: the deployed bundle claims a handle only
  // when the field was filled in (OnboardingMobile.tsx:403) and nothing gates
  // Finish on it, so this is a real tester this week — not a stranded row.
  assert.equal(
    discoverable({ handle: TRIGGER_HANDLE, school_verified: true, otto_answers: ONBOARDED }),
    true,
  );
  // A handle we can't even read changes nothing.
  assert.equal(discoverable({ school_verified: true, otto_answers: ONBOARDED }), true);
});

test("discoverable: the service select carries every column the predicate reads", () => {
  // A narrowed select would make the predicate fail closed on everyone —
  // empty rails and empty search, with nothing in the logs. Pin the pairing.
  const cols = DISCOVERABLE_USER_COLUMNS.split(",").map((c) => c.trim());
  for (const needed of ["id", "school_verified", "otto_answers"]) {
    assert.ok(cols.includes(needed), `${needed} missing from DISCOVERABLE_USER_COLUMNS`);
  }
  const full: Record<string, unknown> = { school_verified: true, otto_answers: ONBOARDED };
  for (const drop of ["school_verified", "otto_answers"]) {
    const row = { ...full };
    delete row[drop];
    assert.equal(discoverable(row), false, `dropping ${drop} must fail closed`);
  }
});

// ── 2. Which community ───────────────────────────────────────────────────

test("community: shared Indianapolis makes IU and Purdue students same-campus", () => {
  const t = communityTraits(IU_INDY, PURDUE_INDY);
  assert.equal(t.sameCampus, true);
  assert.equal(t.sameSystem, false, "sameSystem never doubles up with sameCampus");
});

test("community: same university, different campus is sameSystem only", () => {
  const t = communityTraits(IU_INDY, IU_BLOOMINGTON);
  assert.deepEqual(
    { sameCampus: t.sameCampus, sameSystem: t.sameSystem },
    { sameCampus: false, sameSystem: true },
  );
});

test("community: an unset viewer campus never claims a match", () => {
  assert.equal(communityTraits(IU_NO_CAMPUS, IU_NO_CAMPUS).sameCampus, false);
  assert.equal(communityTraits(IU_NO_CAMPUS, IU_INDY).sameCampus, false);
  assert.equal(communityTraits(UNVERIFIED, IU_INDY).sameSystem, false);
  // Two campus-less students of the same university are still same-system.
  assert.equal(communityTraits(IU_NO_CAMPUS, IU_NO_CAMPUS).sameSystem, true);
});

test("community: an unknown campus id reads as no campus, never as a match", () => {
  assert.equal(communityTraits({ campusId: "atlantis", system: "iu" }, IU_INDY).sameCampus, false);
  assert.equal(
    communityTraits(IU_INDY, { campusId: "atlantis", system: "iu" }).sameCampus,
    false,
  );
});

test("community: major compares trimmed and non-empty", () => {
  assert.equal(communityTraits({ ...IU_INDY, major: "CS" }, { ...IU_INDY, major: " CS " }).sameMajor, true);
  assert.equal(communityTraits({ ...IU_INDY, major: "" }, { ...IU_INDY, major: "" }).sameMajor, false);
  assert.equal(communityTraits({ ...IU_INDY, major: null }, { ...IU_INDY, major: null }).sameMajor, false);
  assert.equal(communityTraits({ ...IU_INDY, major: "CS" }, { ...IU_INDY, major: "cs" }).sameMajor, false);
});

test("people pool: allowed-set campuses in, other-system campuses out", () => {
  assert.equal(inPeopleCommunity(PURDUE_INDY, IU_INDY), true, "Purdue Indy reaches an IU viewer");
  assert.equal(inPeopleCommunity(IU_BLOOMINGTON, IU_INDY), true, "elsewhere at IU");
  assert.equal(inPeopleCommunity(PURDUE_WL, IU_INDY), false, "other system, outside a shared campus");
  assert.equal(inPeopleCommunity(IU_BLOOMINGTON, PURDUE_INDY), false, "mirrored for a Purdue viewer");
  assert.equal(inPeopleCommunity(IU_INDY, PURDUE_WL), true, "shared Indianapolis is in Purdue's set");
});

test("people pool: campus-less candidates need the same university", () => {
  assert.equal(inPeopleCommunity(IU_NO_CAMPUS, IU_INDY), true);
  assert.equal(inPeopleCommunity({ campusId: null, system: "purdue" }, IU_INDY), false);
  assert.equal(inPeopleCommunity(UNVERIFIED, IU_INDY), false);
});

test("people pool: a viewer with no system sees everyone (critic A7)", () => {
  for (const candidate of [IU_INDY, PURDUE_WL, IU_NO_CAMPUS, UNVERIFIED]) {
    assert.equal(inPeopleCommunity(candidate, UNVERIFIED), true);
  }
});

test("people pool filter: ids match the allowed set and nothing else", () => {
  const iu = peopleCommunityOrFilter("iu") ?? "";
  assert.match(iu, /campus_id\.in\.\(indianapolis,fort-wayne,[^)]*iu-bloomington[^)]*\)/);
  assert.match(iu, /and\(campus_id\.is\.null,school_system\.eq\.iu\)/);
  assert.equal(iu.includes("purdue-west-lafayette"), false);

  const purdue = peopleCommunityOrFilter("purdue") ?? "";
  assert.equal(purdue.includes("iu-bloomington"), false);
  assert.match(purdue, /purdue-west-lafayette/);
  assert.match(purdue, /school_system\.eq\.purdue/);

  assert.equal(peopleCommunityOrFilter(null), null);
  assert.equal(peopleCommunityOrFilter(undefined), null);
});

// ── Reasons (critic C4: the legacy strings must survive wave 2) ──────────

const signals = (over: Partial<Parameters<typeof suggestionReasons>[0]> = {}) => ({
  mutuals: 0,
  sharedOrgs: 0,
  sameCampus: false,
  sameMajor: false,
  sameSystem: false,
  ...over,
});

test("reasons: the deployed phone's literals are byte-for-byte unchanged", () => {
  // NetworkMobile.tsx:943 groups on `reason === "same school"`, and the other
  // strings render verbatim. Changing any of these empties a group on a
  // bundle that is live for days after this ships.
  assert.equal(suggestionReasons(signals({ mutuals: 1 })).reason, "1 mutual");
  assert.equal(suggestionReasons(signals({ mutuals: 3 })).reason, "3 mutuals");
  assert.equal(suggestionReasons(signals({ sharedOrgs: 1 })).reason, "in your org");
  assert.equal(suggestionReasons(signals({ sharedOrgs: 2 })).reason, "2 shared orgs");
  assert.equal(suggestionReasons(signals({ sameMajor: true })).reason, "same major");
  assert.equal(suggestionReasons(signals({ sameCampus: true })).reason, "same school");
  assert.equal(suggestionReasons(signals()).reason, "new on Vibe");
  // Legacy precedence: major outranks campus in the OLD string, and a
  // same-campus Purdue student still gets "same school" on the old phone.
  assert.equal(
    suggestionReasons(signals({ sameCampus: true, sameMajor: true })).reason,
    "same major",
  );
});

test("reasons: reason_v2 follows the onboarding group order", () => {
  assert.equal(suggestionReasons(signals({ sharedOrgs: 1, sameCampus: true })).reason_v2, "from_your_clubs");
  assert.equal(suggestionReasons(signals({ sameCampus: true, sameMajor: true })).reason_v2, "same_campus");
  assert.equal(suggestionReasons(signals({ sameMajor: true, sameSystem: true })).reason_v2, "same_major");
  assert.equal(suggestionReasons(signals({ sameSystem: true })).reason_v2, "same_system");
  assert.equal(suggestionReasons(signals({ mutuals: 2 })).reason_v2, "mutuals");
  assert.equal(suggestionReasons(signals()).reason_v2, "new_on_vibe");
  // A mutual on your campus is grouped by campus; the count carries the rest.
  assert.equal(suggestionReasons(signals({ mutuals: 2, sameCampus: true })).reason_v2, "same_campus");
});

test("order: mutuals > clubs > campus > major > system", () => {
  const ranked = [
    signals({ sameSystem: true }),
    signals({ sameMajor: true }),
    signals({ sameCampus: true }),
    signals({ sharedOrgs: 1 }),
    signals({ mutuals: 1 }),
  ].sort(compareSuggestions);
  assert.deepEqual(
    ranked.map((s) => (s.mutuals ? "m" : s.sharedOrgs ? "o" : s.sameCampus ? "c" : s.sameMajor ? "j" : "s")),
    ["m", "o", "c", "j", "s"],
  );
  assert.equal(compareSuggestions(signals({ mutuals: 3 }), signals({ mutuals: 1 })) < 0, true);
});

// ── 3. The campus lane ───────────────────────────────────────────────────

const laneFor = (raw: string | null, viewer: { campusId: string | null; system: "iu" | "purdue" | null }) => {
  const scope = resolveScopeV2(raw, viewer);
  assert.notEqual(scope.kind, "forbidden", "test expects an allowed scope");
  return feedLaneFor(scope as Exclude<typeof scope, { kind: "forbidden" }>, viewer);
};

test("home campus: resolved the same way the scope helper does", () => {
  assert.equal(homeCampusIdFor(IU_INDY), "indianapolis");
  assert.equal(homeCampusIdFor(IU_NO_CAMPUS), null);
  // A campus outside the viewer's university (only a trigger bypass produces
  // this) is not a home campus.
  assert.equal(homeCampusIdFor({ campusId: "purdue-west-lafayette", system: "iu" }), null);
});

test("lane: the home lane is home campus + legacy same-system posts + follows", () => {
  const lane = laneFor(null, IU_INDY);
  assert.deepEqual(lane, {
    kind: "scoped",
    campusIds: ["indianapolis"],
    legacySystem: "iu",
    includeFollowed: true,
  });
});

test("lane: ?campus= equal to home is still the home lane", () => {
  assert.deepEqual(laneFor("indianapolis", IU_INDY), laneFor(null, IU_INDY));
});

test("lane: browsing another allowed campus shows that campus only", () => {
  assert.deepEqual(laneFor("iu-bloomington", IU_INDY), {
    kind: "scoped",
    campusIds: ["iu-bloomington"],
    legacySystem: null,
    includeFollowed: false,
  });
});

test("lane: no home campus means the whole allowed set (critic A7 'none')", () => {
  const lane = laneFor(null, IU_NO_CAMPUS);
  assert.equal(lane.kind, "scoped");
  if (lane.kind !== "scoped") return;
  assert.equal(lane.campusIds.includes("indianapolis"), true);
  assert.equal(lane.campusIds.includes("iu-bloomington"), true);
  assert.equal(lane.campusIds.includes("purdue-west-lafayette"), false);
  assert.equal(lane.legacySystem, "iu");
  assert.equal(lane.includeFollowed, true);
});

test("lane: ?campus=all is the viewer's university, not every campus", () => {
  const lane = laneFor("all", IU_INDY);
  assert.equal(lane.kind, "scoped");
  if (lane.kind !== "scoped") return;
  assert.equal(lane.campusIds.includes("purdue-west-lafayette"), false);
  assert.equal(lane.campusIds.includes("fort-wayne"), true);
});

test("lane: no system at all leaves the feed global", () => {
  assert.deepEqual(laneFor(null, UNVERIFIED), { kind: "everything" });
});

test("lane filter: the fragment carries campuses, legacy posts and follows", () => {
  const ids = [uuid(1), uuid(2)];
  const filter = feedLaneOrFilter(laneFor(null, IU_INDY), ids) ?? "";
  assert.match(filter, /campus_id\.in\.\(indianapolis\)/);
  assert.match(filter, /and\(campus_id\.is\.null,school_system\.eq\.iu\)/);
  // …and the posts stamped with no university at all, which the trigger pins
  // forever: matching no lane would hide a student's own post from everyone.
  assert.match(filter, /and\(campus_id\.is\.null,school_system\.is\.null\)/);
  assert.match(filter, new RegExp(`user_id\\.in\\.\\(${ids[0]},${ids[1]}\\)`));
});

test("lane filter: browse view carries neither legacy posts nor follows", () => {
  const filter = feedLaneOrFilter(laneFor("iu-bloomington", IU_INDY), [uuid(1)]) ?? "";
  assert.equal(filter, "campus_id.in.(iu-bloomington)");
});

test("lane filter: global lane filters nothing", () => {
  assert.equal(feedLaneOrFilter({ kind: "everything" }, [uuid(1)]), null);
});

test("lane filter: non-uuid follow ids never enter the filter grammar", () => {
  const filter =
    feedLaneOrFilter(laneFor(null, IU_INDY), [
      "not-a-uuid",
      "*",
      `${uuid(1)},user_id.not.is.null`,
      uuid(2),
    ]) ?? "";
  assert.equal(filter.includes("not-a-uuid"), false);
  assert.equal(filter.includes("not.is.null"), false);
  assert.match(filter, new RegExp(`user_id\\.in\\.\\(${uuid(2)}\\)`));
});

test("lane filter: the follow list is capped", () => {
  const many = Array.from({ length: FOLLOWED_AUTHOR_FILTER_CAP + 50 }, (_, i) =>
    `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );
  const filter = feedLaneOrFilter(laneFor(null, IU_INDY), many) ?? "";
  const listed = (filter.match(/user_id\.in\.\(([^)]*)\)/)?.[1] ?? "").split(",").filter(Boolean);
  assert.equal(listed.length, FOLLOWED_AUTHOR_FILTER_CAP);
});

test("lane filter: an empty lane matches nothing rather than everything", () => {
  const filter = feedLaneOrFilter(
    { kind: "scoped", campusIds: [], legacySystem: null, includeFollowed: true },
    [],
  );
  assert.equal(filter, "id.is.null");
  // An unknown campus id can't smuggle itself into the filter either.
  assert.equal(
    feedLaneOrFilter({ kind: "scoped", campusIds: ["atlantis"], legacySystem: null, includeFollowed: false }, []),
    "id.is.null",
  );
});

// ── Followed clubs in the lane (wave plan F4) ────────────────────────────

const CLUB_A = uuid(5);
const CLUB_B = uuid(6);
const listedOrgIds = (filter: string) =>
  (filter.match(/org_id\.in\.\(([^)]*)\)/)?.[1] ?? "").split(",").filter(Boolean);

test("club follows: the club clause rides on the home lane only", () => {
  const home = feedLaneOrFilter(laneFor(null, IU_INDY), [uuid(1)], [CLUB_A]) ?? "";
  assert.match(home, new RegExp(`org_id\\.in\\.\\(${CLUB_A}\\)`));
  assert.match(home, new RegExp(`user_id\\.in\\.\\(${uuid(1)}\\)`));
  // A club follow with no person follows still gets its clause.
  const clubsOnly = feedLaneOrFilter(laneFor(null, IU_INDY), [], [CLUB_A]) ?? "";
  assert.match(clubsOnly, new RegExp(`org_id\\.in\\.\\(${CLUB_A}\\)`));
  assert.equal(clubsOnly.includes("user_id.in."), false);
  // Browsing another campus is that campus only: no people, no clubs.
  assert.equal(
    feedLaneOrFilter(laneFor("iu-bloomington", IU_INDY), [uuid(1)], [CLUB_A]),
    "campus_id.in.(iu-bloomington)",
  );
});

test("club follows: the global lane still filters nothing", () => {
  assert.equal(feedLaneOrFilter({ kind: "everything" }, [uuid(1)], [CLUB_A]), null);
  assert.equal(feedLaneOrFilter(laneFor(null, UNVERIFIED), [], [CLUB_A]), null);
});

test("club follows: the list is capped at 50, newest first kept", () => {
  assert.equal(FOLLOWED_ORG_FILTER_CAP, 50);
  const many = Array.from({ length: FOLLOWED_ORG_FILTER_CAP + 30 }, (_, i) =>
    `${i.toString(16).padStart(8, "0")}-0000-4000-8000-00000000c1ab`,
  );
  const filter = feedLaneOrFilter(laneFor(null, IU_INDY), [], many) ?? "";
  const listed = listedOrgIds(filter);
  assert.equal(listed.length, FOLLOWED_ORG_FILTER_CAP);
  assert.deepEqual(listed, many.slice(0, FOLLOWED_ORG_FILTER_CAP));
  // The club cap is its own budget: a full author list doesn't shrink it.
  const authors = Array.from({ length: FOLLOWED_AUTHOR_FILTER_CAP }, (_, i) =>
    `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );
  const both = feedLaneOrFilter(laneFor(null, IU_INDY), authors, many) ?? "";
  assert.equal(listedOrgIds(both).length, FOLLOWED_ORG_FILTER_CAP);
});

test("club follows: non-uuid and injection strings never reach the filter", () => {
  const filter =
    feedLaneOrFilter(
      laneFor(null, IU_INDY),
      [],
      [
        "not-a-uuid",
        "*",
        "",
        `${CLUB_A}),user_id.not.is.null`,
        `${CLUB_A},org_id.not.is.null`,
        "org_id.not.is.null",
        CLUB_B,
        CLUB_B,
      ],
    ) ?? "";
  assert.equal(filter.includes("not-a-uuid"), false);
  assert.equal(filter.includes("not.is.null"), false);
  assert.equal(filter.includes("*"), false);
  // Deduped, and the only club that survives is the real uuid.
  assert.deepEqual(listedOrgIds(filter), [CLUB_B]);
  // Junk only: no club clause at all, not an empty `org_id.in.()`.
  const junk = feedLaneOrFilter(laneFor(null, IU_INDY), [], ["nope", `${CLUB_A};drop`]) ?? "";
  assert.equal(junk.includes("org_id"), false);
});

test("club follows: an empty lane with no ids at all still matches nothing", () => {
  const empty = { kind: "scoped" as const, campusIds: [], legacySystem: null, includeFollowed: true };
  assert.equal(feedLaneOrFilter(empty, [], []), "id.is.null");
  assert.equal(feedLaneOrFilter(empty, [], ["not-a-uuid"]), "id.is.null");
  // …and a club follow alone is enough to make it match something.
  assert.equal(feedLaneOrFilter(empty, [], [CLUB_A]), `org_id.in.(${CLUB_A})`);
});

test("club follows: the 2-argument call is byte-for-byte what it was", () => {
  const lane = laneFor(null, IU_INDY);
  const expected =
    "campus_id.in.(indianapolis)," +
    "and(campus_id.is.null,school_system.eq.iu)," +
    "and(campus_id.is.null,school_system.is.null)," +
    `user_id.in.(${uuid(1)},${uuid(2)})`;
  assert.equal(feedLaneOrFilter(lane, [uuid(1), uuid(2)]), expected);
  assert.equal(feedLaneOrFilter(lane, [uuid(1), uuid(2)], []), expected);
  assert.equal(
    feedLaneOrFilter(laneFor(null, IU_INDY)),
    "campus_id.in.(indianapolis),and(campus_id.is.null,school_system.eq.iu),and(campus_id.is.null,school_system.is.null)",
  );
});

test("club follows: a followed club's off-campus post passes the home lane, not a browse view", () => {
  const home = laneFor(null, IU_INDY);
  const clubs = new Set([CLUB_A]);
  const none = new Set<string>();
  const offCampus = { user_id: uuid(1), org_id: CLUB_A, campus_id: "iu-bloomington", school_system: "iu" };
  assert.equal(postInFeedLane(offCampus, home, none, clubs), true);
  assert.equal(postInFeedLane(offCampus, home, none), false, "the 3-argument call knows no clubs");
  assert.equal(postInFeedLane(offCampus, home, none, new Set([CLUB_B])), false);
  // Wherever the club is, like a followed person.
  assert.equal(
    postInFeedLane({ ...offCampus, campus_id: "purdue-west-lafayette", school_system: "purdue" }, home, none, clubs),
    true,
  );
  // A personal post never matches on a club.
  assert.equal(postInFeedLane({ ...offCampus, org_id: null }, home, none, clubs), false);

  const browse = laneFor("iu-bloomington", IU_INDY);
  const homeCampusClubPost = { user_id: uuid(1), org_id: CLUB_A, campus_id: "indianapolis", school_system: "iu" };
  assert.equal(postInFeedLane(homeCampusClubPost, browse, none, clubs), false);
  // The browse view still shows its own campus's club posts, followed or not.
  assert.equal(postInFeedLane(offCampus, browse, none, new Set()), true);
});

test("lane predicate: agrees with the home lane's intent", () => {
  const lane = laneFor(null, IU_INDY);
  const follows = new Set([uuid(9)]);
  const seen = (post: Record<string, unknown>) => postInFeedLane(post as never, lane, follows);

  assert.equal(seen({ user_id: uuid(1), campus_id: "indianapolis", school_system: "purdue" }), true);
  assert.equal(seen({ user_id: uuid(1), campus_id: "iu-bloomington", school_system: "iu" }), false);
  assert.equal(seen({ user_id: uuid(1), campus_id: null, school_system: "iu" }), true);
  assert.equal(seen({ user_id: uuid(1), campus_id: null, school_system: "purdue" }), false);
  // Stamped with no university (an unverified author). `posts_stamp_campus`
  // pins both columns on UPDATE, so this row can never be rescued — dropping
  // it would hide the student's own post from every lane, forever.
  assert.equal(seen({ user_id: uuid(1), campus_id: null, school_system: null }), true);
  assert.equal(seen({ user_id: uuid(1) }), true, "a row missing both columns reads the same way");
  assert.equal(
    seen({ user_id: uuid(9), campus_id: "purdue-west-lafayette", school_system: "purdue" }),
    true,
    "someone you follow reaches you wherever they are",
  );
});

test("lane predicate: a browse view drops follows and legacy posts", () => {
  const lane = laneFor("iu-bloomington", IU_INDY);
  const follows = new Set([uuid(9)]);
  assert.equal(postInFeedLane({ user_id: uuid(1), campus_id: "iu-bloomington" }, lane, follows), true);
  assert.equal(postInFeedLane({ user_id: uuid(9), campus_id: "indianapolis" }, lane, follows), false);
  assert.equal(postInFeedLane({ user_id: uuid(1), campus_id: null, school_system: "iu" }, lane, follows), false);
  assert.equal(postInFeedLane({ user_id: uuid(1), campus_id: null, school_system: null }, lane, follows), false);
});

test("lane: a Purdue viewer's home lane picks up the same unstamped pile", () => {
  const lane = laneFor(null, PURDUE_INDY);
  const filter = feedLaneOrFilter(lane, []) ?? "";
  assert.match(filter, /and\(campus_id\.is\.null,school_system\.eq\.purdue\)/);
  assert.match(filter, /and\(campus_id\.is\.null,school_system\.is\.null\)/);
  assert.equal(postInFeedLane({ user_id: uuid(1), campus_id: null, school_system: null }, lane, new Set()), true);
  assert.equal(postInFeedLane({ user_id: uuid(1), campus_id: null, school_system: "iu" }, lane, new Set()), false);
});

test("lane predicate: the global lane keeps everything", () => {
  assert.equal(
    postInFeedLane({ user_id: uuid(1), campus_id: "purdue-west-lafayette" }, { kind: "everything" }, new Set()),
    true,
  );
});

test("forbidden scopes map to the documented statuses", () => {
  const iuViewer = { campusId: "indianapolis", system: "iu" as const };
  const notMine = resolveScopeV2("purdue-west-lafayette", iuViewer);
  assert.equal(notMine.kind, "forbidden");
  if (notMine.kind !== "forbidden") return;
  const forbidden = campusScopeError(notMine);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, "campus_not_in_system");

  const junk = resolveScopeV2("atlantis", iuViewer);
  assert.equal(junk.kind, "forbidden");
  if (junk.kind !== "forbidden") return;
  assert.equal(campusScopeError(junk).status, 400);
  assert.equal(campusScopeError(junk).body.code, "unknown_campus");
});

// ── Ranking ──────────────────────────────────────────────────────────────

// One pinned clock for every ranking test. Deriving `created_at` from a
// fresh Date.now() per post would make two "equally old" posts differ by
// microseconds, and the boost assertions below compare exact ratios.
const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);

const post = (over: Record<string, unknown> = {}) => ({
  user_id: uuid(1),
  created_at: new Date(NOW - 2 * 3_600_000).toISOString(),
  like_count: 0,
  comment_count: 0,
  repost_count: 0,
  ...over,
});

test("boost: compares campus_id, so shared Indianapolis counts for both", () => {
  const now = NOW;
  const none = new Set<string>();
  const home = scoreFeedRow(post({ campus_id: "indianapolis" }) as never, now, none, "indianapolis");
  const away = scoreFeedRow(post({ campus_id: "iu-bloomington" }) as never, now, none, "indianapolis");
  assert.ok(Math.abs(home / away - SAME_CAMPUS_BOOST) < 1e-9);
});

test("boost: inert without a home campus or a post campus", () => {
  const now = NOW;
  const none = new Set<string>();
  const plain = scoreFeedRow(post({ campus_id: null }) as never, now, none, "indianapolis");
  const noHome = scoreFeedRow(post({ campus_id: "indianapolis" }) as never, now, none, null);
  const baseline = scoreFeedRow(post({ campus_id: "iu-bloomington" }) as never, now, none, "indianapolis");
  assert.equal(plain, baseline);
  assert.equal(noHome, baseline);
});

test("boost: a follow still outranks a campus match", () => {
  const now = NOW;
  const follows = new Set([uuid(2)]);
  const followedAway = scoreFeedRow(
    post({ user_id: uuid(2), campus_id: "iu-bloomington" }) as never,
    now,
    follows,
    "indianapolis",
  );
  const strangerHome = scoreFeedRow(post({ campus_id: "indianapolis" }) as never, now, follows, "indianapolis");
  assert.ok(followedAway > strangerHome);
});

test("ranking: engagement and decay keep their shape", () => {
  const now = NOW;
  const none = new Set<string>();
  const fresh = scoreFeedRow(post({ campus_id: null }) as never, now, none, null);
  const old = scoreFeedRow(
    post({ campus_id: null, created_at: new Date(now - 48 * 3_600_000).toISOString() }) as never,
    now,
    none,
    null,
  );
  assert.ok(fresh > old);
  const liked = scoreFeedRow(post({ campus_id: null, like_count: 5 }) as never, now, none, null);
  assert.ok(liked > fresh);
  const reposted = scoreFeedRow(post({ campus_id: null, friend_reposter_count: 2 }) as never, now, none, null);
  assert.ok(Math.abs(reposted - fresh - 6) < 1e-9);
});

test("boost: a followed club is the same 1.6, and following both is still one 1.6", () => {
  const now = NOW;
  const none = new Set<string>();
  const clubPost = (over: Record<string, unknown> = {}) =>
    post({ user_id: uuid(2), org_id: uuid(5), campus_id: null, ...over }) as never;
  const base = scoreFeedRow(clubPost(), now, none, null);
  const author = scoreFeedRow(clubPost(), now, new Set([uuid(2)]), null);
  const club = scoreFeedRow(clubPost(), now, none, null, new Set([uuid(5)]));
  const both = scoreFeedRow(clubPost(), now, new Set([uuid(2)]), null, new Set([uuid(5)]));
  assert.ok(Math.abs(author / base - 1.6) < 1e-9);
  assert.ok(Math.abs(club / base - 1.6) < 1e-9);
  assert.ok(Math.abs(both / base - 1.6) < 1e-9, "one 1.6, never 2.56");
  // A personal post never picks up a club boost, and the 4-argument call is unchanged.
  const personal = scoreFeedRow(clubPost({ org_id: null }), now, none, null, new Set([uuid(5)]));
  assert.equal(personal, base);
  assert.equal(scoreFeedRow(clubPost(), now, none, null, new Set()), base);
});

test("diversity key: people bucket alone, a club's officers share one bucket", () => {
  const officerA = uuid(2);
  const officerB = uuid(3);
  assert.notEqual(feedDiversityKey({ user_id: officerA }), feedDiversityKey({ user_id: officerB }));
  assert.notEqual(
    feedDiversityKey({ user_id: officerA, org_id: null }),
    feedDiversityKey({ user_id: officerB, org_id: null }),
  );
  assert.equal(
    feedDiversityKey({ user_id: officerA, org_id: uuid(5) }),
    feedDiversityKey({ user_id: officerB, org_id: uuid(5) }),
  );
  // An officer's own post and their club's post are different buckets.
  assert.notEqual(
    feedDiversityKey({ user_id: officerA, org_id: null }),
    feedDiversityKey({ user_id: officerA, org_id: uuid(5) }),
  );
  // A user id can never collide with a club id that happens to be equal.
  assert.notEqual(feedDiversityKey({ user_id: uuid(5) }), feedDiversityKey({ user_id: officerA, org_id: uuid(5) }));
});
