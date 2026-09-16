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

const { resolveCampusRequest, scopeViewerFromRow } = await import("./campus-request");
const { feedLaneFor, feedLaneOrFilter } = await import("./community-scope");
const { scopeCampusIds } = await import("./campus-scope");

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

test("another university's campus is 403 campus_not_in_system", () => {
  assert.deepEqual(
    resolveCampusRequest("purdue-west-lafayette", { campusId: "indianapolis", system: "iu" }),
    { kind: "forbidden", reason: "campus_not_in_system" },
  );
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

test("NO UNIVERSITY, NO BROWSING: a system-less viewer can't name a campus", () => {
  // Franky's Q2. `allowedCampusIdsFor(null)` is every campus, which is the
  // right default for their own view but must not become a browse pass.
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
