/**
 * Tests for the school identity colours (`school-colors.ts`): which zone
 * leads the phone campus banner (S68 wave 5), its seam line and its tile.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/iu/school-colors.test.ts
 *
 * The resolve hook retries an extensionless relative specifier with ".ts"
 * (same pattern and reason as `campuses.test.ts`); the module under test
 * loads through dynamic `import()` so the hook is registered first.
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
  throw new Error("school-colors.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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
  IU_CREAM,
  IU_CRIMSON,
  PURDUE_BLACK,
  PURDUE_GOLD,
  SCHOOL_TILES,
  SCHOOL_ZONE_PALETTES,
  schoolSkinFor,
  schoolZonesFor,
} = await import("./school-colors");

test("shared campus: an IU student (or no school yet) leads with IU, gold seam", () => {
  for (const viewer of ["iu", null, undefined] as const) {
    assert.deepEqual(schoolZonesFor("shared", viewer), {
      lead: "iu",
      follow: "purdue",
      seamLine: PURDUE_GOLD,
    });
  }
});

test("shared campus: a Purdue student leads with Purdue, cream seam", () => {
  assert.deepEqual(schoolZonesFor("shared", "purdue"), {
    lead: "purdue",
    follow: "iu",
    seamLine: IU_CREAM,
  });
});

test("single-school and unknown campuses use one zone and no seam", () => {
  for (const viewer of ["iu", "purdue", null] as const) {
    assert.deepEqual(schoolZonesFor("iu", viewer), { lead: "iu", follow: "iu", seamLine: null });
    assert.deepEqual(schoolZonesFor("purdue", viewer), {
      lead: "purdue",
      follow: "purdue",
      seamLine: null,
    });
    assert.deepEqual(schoolZonesFor("none", viewer), { lead: "none", follow: "none", seamLine: null });
  }
});

test("skin comes from the campus's systems; nothing known is neutral", () => {
  assert.equal(schoolSkinFor({ systems: ["iu", "purdue"] }), "shared");
  assert.equal(schoolSkinFor({ systems: ["iu"] }), "iu");
  assert.equal(schoolSkinFor({ systems: ["purdue"] }), "purdue");
  assert.equal(schoolSkinFor(null), "none");
});

test("the tile swaps the leading school's colours", () => {
  assert.deepEqual({ ...SCHOOL_TILES.iu }, { background: IU_CREAM, ink: IU_CRIMSON });
  assert.deepEqual({ ...SCHOOL_TILES.purdue }, { background: PURDUE_GOLD, ink: PURDUE_BLACK });
  // The seam line is always the FOLLOWING zone's own ink.
  assert.equal(SCHOOL_ZONE_PALETTES.purdue.ink, PURDUE_GOLD);
  assert.equal(SCHOOL_ZONE_PALETTES.iu.ink, IU_CREAM);
});
