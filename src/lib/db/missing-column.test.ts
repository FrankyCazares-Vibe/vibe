/**
 * Tests for `missing-column.ts`. Run with:
 *   node --test --experimental-strip-types src/lib/db/missing-column.test.ts
 *
 * The module has no imports, so it loads through a dynamic import of its
 * ".ts" path (Node's type stripping adds no extensions; tsc only sees a
 * string specifier and takes the type from the `typeof import` below).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const specifier = "./missing-column.ts";
const { isMissingColumnError, M1_USER_COLUMNS } = (await import(specifier)) as typeof import("./missing-column");

// The list the three profile selects pass (S67 wave 2, contracts C3): M1's
// campus columns plus the widget-layout column from 20260926100000.
const PROFILE_FIRST_TIER_COLUMNS = [...M1_USER_COLUMNS, "profile_layout"];

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const readRepoFile = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

test("PostgREST PGRST204 naming a new column is a missing-column error", () => {
  assert.equal(
    isMissingColumnError({
      code: "PGRST204",
      message: "Could not find the 'school_system' column of 'users' in the schema cache",
    }),
    true,
  );
});

test("Postgres 42703 naming a new column is a missing-column error", () => {
  assert.equal(
    isMissingColumnError({ code: "42703", message: "column users.campus_id does not exist" }),
    true,
  );
  assert.equal(
    isMissingColumnError({ code: "42703", message: 'column "campus_set_at" does not exist' }),
    true,
  );
});

test("a 42703 that names some other column is not treated as the migration gap", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column users.nickname does not exist" }), false);
});

test("a trigger bug with 42703 'has no field' does not trigger the fallback", () => {
  assert.equal(
    isMissingColumnError({ code: "42703", message: 'record "new" has no field "school_system"' }),
    false,
  );
});

test("other error codes never match, even with a matching message", () => {
  assert.equal(
    isMissingColumnError({ code: "23503", message: "column users.campus_id does not exist" }),
    false,
  );
});

test("null, undefined and empty column lists are false", () => {
  assert.equal(isMissingColumnError(null), false);
  assert.equal(isMissingColumnError(undefined), false);
  assert.equal(isMissingColumnError({ code: "42703", message: "column users.campus_id does not exist" }, []), false);
});

test("message in details (no code) still matches when it names the column", () => {
  assert.equal(
    isMissingColumnError({ message: "update failed", details: "Could not find the 'campus_id' column of 'users'" }),
    true,
  );
});

test("the default column list is exactly M1's user columns", () => {
  assert.deepEqual([...M1_USER_COLUMNS], ["school_system", "campus_id", "campus_set_at"]);
});

test("profile_layout (S67 wave 2): a 42703 naming it matches the extended list, never the default", () => {
  const postgres = { code: "42703", message: "column users.profile_layout does not exist" };
  assert.equal(isMissingColumnError(postgres, PROFILE_FIRST_TIER_COLUMNS), true);
  assert.equal(isMissingColumnError(postgres), false);
  const postgrest = {
    code: "PGRST204",
    message: "Could not find the 'profile_layout' column of 'users' in the schema cache",
  };
  assert.equal(isMissingColumnError(postgrest, PROFILE_FIRST_TIER_COLUMNS), true);
  assert.equal(isMissingColumnError(postgrest), false);
  // The extended list still covers M1's columns, so one guard serves both migrations.
  assert.equal(
    isMissingColumnError({ code: "42703", message: "column users.campus_id does not exist" }, PROFILE_FIRST_TIER_COLUMNS),
    true,
  );
  // And an unrelated missing column is still a real failure.
  assert.equal(
    isMissingColumnError({ code: "42703", message: "column users.profile_theme does not exist" }, PROFILE_FIRST_TIER_COLUMNS),
    false,
  );
});

// The three routes whose first-tier select names profile_layout, the BASE_*
// string their retry falls back to, and the variable their guard tests.
const PROFILE_SELECT_ROUTES: ReadonlyArray<readonly [path: string, base: string, errVar: string]> = [
  ["src/app/api/me/profile-bootstrap/route.ts", "BASE_PROFILE_SELECT", "error"],
  ["src/app/api/users/[handle]/bootstrap/route.ts", "BASE_PUBLIC_PROFILE_SELECT", "error"],
  ["src/app/api/me/profile-sync/route.ts", "SYNC_PROFILE_SELECT", "selErr"],
];

test("the three profile selects: profile_layout rides the first tier, the guard knows it, the retry omits it", () => {
  for (const [path, base, errVar] of PROFILE_SELECT_ROUTES) {
    const src = readRepoFile(path);
    // The fallback string never names the column, so the retry can succeed
    // while the migration lags the deploy (plan "Fixed after the four critiques").
    const baseDecl = src.match(new RegExp(`const ${base} =\\s*"([^"]*)"`));
    assert.ok(baseDecl, `${path}: ${base} declaration`);
    assert.equal(baseDecl[1].split(",").includes("profile_layout"), false, `${path}: ${base} names profile_layout`);
    assert.ok(src.includes(`.select(${base})`), `${path}: the retry must select ${base}`);
    // The first tier does name it, and every guard in the file carries the name.
    assert.ok(src.includes(",profile_layout`"), `${path}: first-tier select must end with profile_layout`);
    const guards = src.match(/isMissingColumnError\(/g) ?? [];
    const extended = src.split(`isMissingColumnError(${errVar}, [...M1_USER_COLUMNS, "profile_layout"])`).length - 1;
    assert.ok(guards.length >= 1, `${path}: no isMissingColumnError call`);
    assert.equal(extended, guards.length, `${path}: every guard must pass the extended list`);
  }
});
