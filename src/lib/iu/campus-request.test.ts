/**
 * Tests for `campus-request.ts` (plan wave 2 B10, Franky's Q2, critic A7).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/iu/campus-request.test.ts
 *
 * WHY THE RESOLVE HOOK: these modules import through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. The hook maps "@/x" to "src/x.ts" and retries a
 * failed relative specifier with ".ts" (same pattern as
 * `community-scope.test.ts`). The modules under test load through dynamic
 * `import()` so the hook is registered first.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("campus-request.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  RSVP_CAMPUS_VISITING_COPY,
  eventCampusIdFor,
  mapCampusClosed,
  resolveCampusRequest,
  rsvpCampusDecision,
  scopeViewerFromRow,
} = await import("./campus-request");
const { feedLaneFor, feedLaneOrFilter } = await import("./community-scope");
const { scopeCampusIds } = await import("./campus-scope");
const { CAMPUSES } = await import("./campuses");

type Scope = ReturnType<typeof resolveCampusRequest>;

// ── scopeViewerFromRow ─────────────────────────────────────────────────────

test("a migrated row gives its campus and system", () => {
  assert.deepEqual(scopeViewerFromRow({ campus_id: "indianapolis", school_system: "iu" }), {
    campusId: "indianapolis",
    system: "iu",
  });
});

test("campus_id is trimmed and case-folded through the campus table", () => {
  assert.equal(
    scopeViewerFromRow({ campus_id: " INDIANAPOLIS ", school_system: "purdue" }).campusId,
    "indianapolis",
  );
});

test("a selected-but-null campus is 'no campus', never guessed from the legacy label", () => {
  // plan §2.7: the 7 campus-less May accounts get prompted, not guessed.
  const viewer = scopeViewerFromRow({
    campus_id: null,
    school_system: "iu",
    school: "IU Indianapolis",
  });
  assert.equal(viewer.campusId, null);
  assert.equal(viewer.system, "iu");
});

test("an unselected campus column falls back to the legacy label (pre-M1 database)", () => {
  assert.equal(
    scopeViewerFromRow({ school: "IU Indianapolis", school_system: "iu" }).campusId,
    "indianapolis",
  );
  assert.equal(scopeViewerFromRow({ school: "IU Bloomington" }).campusId, "iu-bloomington");
});

test("legacy junk and an empty label read as no campus", () => {
  assert.equal(scopeViewerFromRow({ school: "iu.edu" }).campusId, null);
  assert.equal(scopeViewerFromRow({ school: "" }).campusId, null);
  assert.equal(scopeViewerFromRow({ school: "IU Online" }).campusId, null);
});

test("a campus id no build knows reads as no campus", () => {
  assert.equal(scopeViewerFromRow({ campus_id: "mars", school_system: "iu" }).campusId, null);
});

test("a junk or missing system reads as no system", () => {
  assert.equal(
    scopeViewerFromRow({ campus_id: "indianapolis", school_system: "harvard" }).system,
    null,
  );
  assert.equal(scopeViewerFromRow({ campus_id: "indianapolis", school_system: null }).system, null);
  assert.equal(scopeViewerFromRow(null).system, null);
  assert.equal(scopeViewerFromRow(undefined).campusId, null);
});

// ── resolveCampusRequest ───────────────────────────────────────────────────

test("no param: the viewer's home campus", () => {
  const scope = resolveCampusRequest(null, { campusId: "indianapolis", system: "iu" });
  assert.deepEqual(scope, { kind: "campus", campusId: "indianapolis" });
});

test("a campus in the viewer's university is allowed", () => {
  const scope = resolveCampusRequest("iu-bloomington", { campusId: "indianapolis", system: "iu" });
  assert.deepEqual(scope, { kind: "campus", campusId: "iu-bloomington" });
});

test("shared Indianapolis is reachable from both universities", () => {
  for (const system of ["iu", "purdue"] as const) {
    assert.deepEqual(resolveCampusRequest("indianapolis", { campusId: null, system }), {
      kind: "campus",
      campusId: "indianapolis",
    });
  }
});

test("S67: a verified IU viewer can read a Purdue campus", () => {
  assert.deepEqual(
    resolveCampusRequest("purdue-west-lafayette", { campusId: "indianapolis", system: "iu" }),
    { kind: "campus", campusId: "purdue-west-lafayette" },
  );
  assert.deepEqual(
    resolveCampusRequest(" Purdue-Northwest ", { campusId: "iu-bloomington", system: "iu" }),
    { kind: "campus", campusId: "purdue-northwest" },
  );
});

test("S67: a verified Purdue viewer can read an IU-only campus", () => {
  assert.deepEqual(
    resolveCampusRequest("iu-bloomington", { campusId: "purdue-west-lafayette", system: "purdue" }),
    { kind: "campus", campusId: "iu-bloomington" },
  );
});

test("S67: every known campus resolves for a viewer with a university", () => {
  const ids = CAMPUSES.map((c) => c.id);
  assert.equal(ids.length, 11, "all 11 campuses, both universities, open or not");
  for (const system of ["iu", "purdue"] as const) {
    for (const id of ids) {
      const scope = resolveCampusRequest(id, { campusId: "indianapolis", system });
      assert.deepEqual(scope, { kind: "campus", campusId: id }, `${system} → ${id}`);
    }
  }
});

test("S67: reading another campus never widens ?campus=all past the viewer's university", () => {
  const viewer = { campusId: "indianapolis", system: "iu" } as const;
  const all = resolveCampusRequest("all", viewer);
  assert.equal(all.kind, "system");
  const ids = scopeCampusIds(all as Exclude<Scope, { kind: "forbidden" }>);
  assert.ok(!ids.includes("purdue-west-lafayette"));
  assert.ok(!ids.includes("purdue-northwest"));
});

test("an id no build knows is 400 unknown_campus, whatever the viewer is", () => {
  assert.deepEqual(resolveCampusRequest("mars", { campusId: "indianapolis", system: "iu" }), {
    kind: "forbidden",
    reason: "unknown_campus",
  });
  assert.deepEqual(resolveCampusRequest("mars", { campusId: null, system: null }), {
    kind: "forbidden",
    reason: "unknown_campus",
  });
});

test("NO UNIVERSITY, NO BROWSING: a system-less viewer gets campus_not_in_system", () => {
  // Still true after S67: looking around is for verified students.
  // `allowedCampusIdsFor(null)` is every campus, which is the right default
  // for their own view but must not become a browse pass.
  for (const id of ["purdue-west-lafayette", "iu-bloomington", "indianapolis"]) {
    assert.deepEqual(resolveCampusRequest(id, { campusId: null, system: null }), {
      kind: "forbidden",
      reason: "campus_not_in_system",
    });
    assert.deepEqual(resolveCampusRequest(id, { campusId: null, system: "harvard" as never }), {
      kind: "forbidden",
      reason: "campus_not_in_system",
    });
  }
});

test("a system-less viewer keeps their own default view and ?campus=all", () => {
  const viewer = { campusId: null, system: null };
  assert.equal(resolveCampusRequest(null, viewer).kind, "none");
  assert.equal(resolveCampusRequest("all", viewer).kind, "system");
  assert.equal(resolveCampusRequest("  ", viewer).kind, "none");
});

test("?campus=all covers the viewer's university and nobody else's", () => {
  const scope = resolveCampusRequest("ALL", { campusId: "indianapolis", system: "iu" });
  assert.equal(scope.kind, "system");
  const ids = scopeCampusIds(scope as Exclude<Scope, { kind: "forbidden" }>);
  assert.ok(ids.includes("indianapolis"));
  assert.ok(ids.includes("iu-bloomington"));
  assert.ok(!ids.includes("purdue-west-lafayette"));
});

test("a campus-less student with a university gets that university's set", () => {
  const scope = resolveCampusRequest(null, { campusId: null, system: "purdue" });
  assert.equal(scope.kind, "none");
  const ids = scopeCampusIds(scope as Exclude<Scope, { kind: "forbidden" }>);
  assert.ok(ids.includes("indianapolis"));
  assert.ok(!ids.includes("iu-bloomington"));
});

// ── The trending strip, end to end ─────────────────────────────────────────
//
// Trending counts the tags of the SAME post set the feed's campus lane shows,
// through the one builder in `community-scope.ts`. These pin that wiring: if
// the lane's rule changes, the strip changes with it instead of drifting.

/** What `trending/hashtags` computes for one viewer row. */
function trendingFilter(row: Parameters<typeof scopeViewerFromRow>[0]): string | null {
  const viewer = scopeViewerFromRow(row);
  const scope = resolveCampusRequest(null, viewer);
  if (scope.kind === "forbidden") throw new Error("home scope can never be forbidden");
  return feedLaneOrFilter(feedLaneFor(scope, viewer));
}

// The exact grammar belongs to `feedLaneOrFilter` and is asserted verbatim in
// `community-scope.test.ts`; these assert the RULE, so a refinement there
// (B9 added the null/null-post clause mid-wave) flows through instead of
// failing here.

test("an Indianapolis IU student: campus posts plus IU's campus-less legacy pile", () => {
  const filter = trendingFilter({ campus_id: "indianapolis", school_system: "iu" }) ?? "";
  assert.ok(filter.includes("campus_id.in.(indianapolis)"));
  assert.ok(filter.includes("and(campus_id.is.null,school_system.eq.iu)"));
  assert.ok(!filter.includes("purdue"));
});

test("a Purdue Indianapolis student: the same campus, only Purdue's legacy pile", () => {
  const filter = trendingFilter({ campus_id: "indianapolis", school_system: "purdue" }) ?? "";
  assert.ok(filter.includes("campus_id.in.(indianapolis)"));
  assert.ok(filter.includes("and(campus_id.is.null,school_system.eq.purdue)"));
  assert.ok(!filter.includes("school_system.eq.iu"));
});

test("a campus-less student still gets their own university, never the other one", () => {
  const filter = trendingFilter({ campus_id: null, school_system: "purdue" }) ?? "";
  assert.ok(filter.includes("and(campus_id.is.null,school_system.eq.purdue)"));
  assert.ok(filter.includes("indianapolis"));
  assert.ok(!filter.includes("iu-bloomington"));
});

test("a system-less straggler isn't filtered at all, exactly as today", () => {
  assert.equal(trendingFilter({ campus_id: null, school_system: null }), null);
});

// ── RSVP away from home (S67 E3) ───────────────────────────────────────────

test("rsvp: a club event on the viewer's home campus is fine", () => {
  assert.equal(
    rsvpCampusDecision({ orgCampusId: "indianapolis", creatorCampusId: null, viewerCampusId: "indianapolis" }),
    "ok",
  );
});

test("rsvp: a club event on another campus is campus_visiting", () => {
  assert.equal(
    rsvpCampusDecision({ orgCampusId: "iu-bloomington", creatorCampusId: null, viewerCampusId: "indianapolis" }),
    "campus_visiting",
  );
  // Either university: a Purdue campus from an IU home is the same answer.
  assert.equal(
    rsvpCampusDecision({
      orgCampusId: "purdue-west-lafayette",
      creatorCampusId: "purdue-west-lafayette",
      viewerCampusId: "indianapolis",
    }),
    "campus_visiting",
  );
});

test("rsvp: a member of the event's club RSVPs from any home campus", () => {
  // Members keep their clubs wherever home is (a transfer after 45 days, or a
  // visitor whose Request to join was approved).
  assert.equal(
    rsvpCampusDecision({
      orgCampusId: "iu-bloomington",
      creatorCampusId: null,
      viewerCampusId: "indianapolis",
      viewerIsClubMember: true,
    }),
    "ok",
  );
  assert.equal(
    rsvpCampusDecision({
      orgCampusId: "iu-bloomington",
      creatorCampusId: null,
      viewerCampusId: "indianapolis",
      viewerIsClubMember: false,
    }),
    "campus_visiting",
  );
});

test("rsvp: the club's campus wins over the creator's", () => {
  assert.equal(
    rsvpCampusDecision({ orgCampusId: "indianapolis", creatorCampusId: "iu-bloomington", viewerCampusId: "indianapolis" }),
    "ok",
  );
  assert.equal(eventCampusIdFor("indianapolis", "iu-bloomington"), "indianapolis");
});

test("rsvp: an org-less event (or a campus-less club) takes the creator's campus", () => {
  assert.equal(eventCampusIdFor(null, "iu-kokomo"), "iu-kokomo");
  assert.equal(
    rsvpCampusDecision({ orgCampusId: null, creatorCampusId: "iu-kokomo", viewerCampusId: "indianapolis" }),
    "campus_visiting",
  );
  assert.equal(
    rsvpCampusDecision({ orgCampusId: null, creatorCampusId: "indianapolis", viewerCampusId: "indianapolis" }),
    "ok",
  );
});

test("rsvp: nothing to compare is never refused", () => {
  // No event campus at all.
  assert.equal(rsvpCampusDecision({ orgCampusId: null, creatorCampusId: null, viewerCampusId: "indianapolis" }), "ok");
  // A viewer with no home campus yet.
  assert.equal(rsvpCampusDecision({ orgCampusId: "iu-bloomington", creatorCampusId: null, viewerCampusId: null }), "ok");
  // Junk and unknown ids read as unknown, not as a different campus.
  assert.equal(rsvpCampusDecision({ orgCampusId: "mars", creatorCampusId: 7, viewerCampusId: "indianapolis" }), "ok");
  assert.equal(eventCampusIdFor(undefined, ""), null);
});

test("rsvp: stored ids are canonicalised before comparing", () => {
  assert.equal(
    rsvpCampusDecision({ orgCampusId: " INDIANAPOLIS ", creatorCampusId: null, viewerCampusId: "indianapolis" }),
    "ok",
  );
});

test("rsvp: shared Indianapolis is home for IU and Purdue Indy students alike", () => {
  // Both universities' Indy students hold the one `indianapolis` row.
  assert.equal(
    rsvpCampusDecision({ orgCampusId: "indianapolis", creatorCampusId: "indianapolis", viewerCampusId: "indianapolis" }),
    "ok",
  );
});

test("rsvp: the refusal line is the one the clients show", () => {
  assert.equal(RSVP_CAMPUS_VISITING_COPY, "RSVP works on your home campus.");
});

// ── The map of a campus that isn't open (S67 R3) ───────────────────────────

const INDY_IU = { campusId: "indianapolis", system: "iu" as const };

function mapClosed(raw: string | null, viewer: { campusId: string | null; system: "iu" | "purdue" | null }) {
  return mapCampusClosed(resolveCampusRequest(raw, viewer), viewer);
}

test("map: a visited campus that isn't open draws nothing", () => {
  // Bloomington, Kokomo and West Lafayette are closed today (isOpen false).
  assert.equal(mapClosed("iu-bloomington", INDY_IU), true);
  assert.equal(mapClosed("iu-kokomo", INDY_IU), true);
  assert.equal(mapClosed("purdue-west-lafayette", INDY_IU), true);
  // A campus-less student naming one: not home either, so the same answer.
  assert.equal(mapClosed("iu-bloomington", { campusId: null, system: "iu" }), true);
});

test("map: every closed campus is held back, every open one drawn", () => {
  for (const c of CAMPUSES) {
    const viewer = { campusId: null, system: "iu" as const };
    assert.equal(mapClosed(c.id, viewer), !c.isOpen, c.id);
  }
});

test("map: home is always drawn, open or not", () => {
  // Default view and home named explicitly, on an open home...
  assert.equal(mapClosed(null, INDY_IU), false);
  assert.equal(mapClosed("indianapolis", INDY_IU), false);
  // ...and on a closed one: a Bloomington student sees their own map.
  const bloomington = { campusId: "iu-bloomington", system: "iu" as const };
  assert.equal(mapClosed(null, bloomington), false);
  assert.equal(mapClosed("iu-bloomington", bloomington), false);
  assert.equal(mapClosed(" IU-BLOOMINGTON ", bloomington), false);
});

test("map: an open campus that isn't home is drawn", () => {
  // Indianapolis is the one open campus; a Bloomington student may view it.
  assert.equal(mapClosed("indianapolis", { campusId: "iu-bloomington", system: "iu" }), false);
});

test("map: ?campus=all, no campus and refusals aren't this rule's business", () => {
  assert.equal(mapClosed("all", INDY_IU), false);
  assert.equal(mapClosed(null, { campusId: null, system: "iu" }), false);
  // Forbidden scopes are answered by campusScopeError before this is asked.
  assert.equal(mapClosed("mars", INDY_IU), false);
  assert.equal(mapClosed("iu-bloomington", { campusId: null, system: null }), false);
});
