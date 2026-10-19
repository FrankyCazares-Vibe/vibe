/**
 * Tests for `org-mark.ts`: its palette, hash, initials and tint are twins of
 * campus-home.tsx's (which aren't exported), so a club's mark on the Tonight
 * panels matches its post cards. The test reads campus-home's SOURCE TEXT and
 * runs its function bodies, so a change there fails here until both move.
 *
 * Run with:
 *   node --test src/components/campus/tonight/org-mark.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't add file extensions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFile } from "node:fs/promises";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("org-mark.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { ORG_PALETTE, colorForOrg, hexToRgba, initialsForOrg, orgMarkBackground } = await import("./org-mark");

const CAMPUS_HOME = new URL("../../../app/campus/campus-home.tsx", import.meta.url);
const source = await readFile(CAMPUS_HOME, "utf8");

/** The body of `function <name>(...): <type> { ... }` in campus-home.tsx (top-level, closes at a line-start "}"). */
function bodyOf(name: string): string {
  const re = new RegExp(`\\nfunction ${name}\\([^)]*\\)[^{]*\\{\\n([\\s\\S]*?)\\n\\}\\n`);
  const found = re.exec(source);
  assert.ok(found, `campus-home.tsx: function ${name} not found. Did it move or get renamed? Update org-mark.ts and this test.`);
  return found[1];
}

/** campus-home's palette, in order, from its source text. */
function campusPalette(): string[] {
  const found = /\nconst ORG_PALETTE = \[([\s\S]*?)\];/.exec(source);
  assert.ok(found, "campus-home.tsx: const ORG_PALETTE not found");
  return [...found[1].matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
}

const SAMPLE_IDS = [
  "df5ab44e-0000-4000-8000-000000000001",
  "3f2a9c10-7e1b-4c55-9a0d-2b8e6f4d1c77",
  "a",
  "",
  "org-climb",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "00000000-0000-0000-0000-000000000000",
];

test("drift: the palette equals campus-home's, in order", () => {
  const theirs = campusPalette();
  assert.equal(theirs.length, 8);
  assert.deepEqual(ORG_PALETTE.map((c) => c.toUpperCase()), theirs);
});

test("drift: colorForOrg gives campus-home's colour for the same id", () => {
  // The body has no type annotations, so it runs as plain JS with the palette passed in.
  const theirs = new Function("id", "ORG_PALETTE", bodyOf("colorForOrg")) as (id: string, p: readonly string[]) => string;
  const palette = campusPalette();
  for (const id of SAMPLE_IDS) assert.equal(colorForOrg(id).toUpperCase(), theirs(id, palette), `id ${JSON.stringify(id)}`);
  // Spread: the sample ids don't all land on one colour.
  assert.ok(new Set(SAMPLE_IDS.map(colorForOrg)).size > 2);
});

test("drift: initialsForOrg matches campus-home's", () => {
  const theirs = new Function("name", bodyOf("initialsForOrg")) as (name: string) => string;
  for (const name of ["Climbing Club", "sigma alpha epsilon", "  Chess   ", "Vibe", "", "Black Student Union Org"]) {
    assert.equal(initialsForOrg(name), theirs(name), `name ${JSON.stringify(name)}`);
  }
  assert.equal(initialsForOrg("Climbing Club"), "CC");
});

test("drift: hexToRgba matches campus-home's; the tile is the post card's gradient", () => {
  const theirs = new Function("hex", "alpha", bodyOf("hexToRgba")) as (hex: string, a: number) => string;
  assert.equal(hexToRgba("#FF5C35", 0.95), theirs("#FF5C35", 0.95));
  assert.equal(hexToRgba("#FF5C35", 0.5), "rgba(255, 92, 53, 0.5)");
  const id = SAMPLE_IDS[1];
  const c = colorForOrg(id);
  assert.equal(orgMarkBackground(id), `linear-gradient(135deg, ${hexToRgba(c, 0.95)} 0%, ${hexToRgba(c, 0.6)} 100%)`);
  // The post card builds the same string inline (campus-home, the org avatar).
  assert.ok(
    source.includes("linear-gradient(135deg, ${hexToRgba(colorForOrg(post.org!.id), 0.95)} 0%, ${hexToRgba(colorForOrg(post.org!.id), 0.6)} 100%)"),
    "campus-home's post-card gradient changed: update orgMarkBackground",
  );
});
