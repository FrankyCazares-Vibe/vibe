/**
 * Tests for `missing-column.ts`. Run with:
 *   node --test --experimental-strip-types src/lib/db/missing-column.test.ts
 *
 * The module has no imports, so it loads through a dynamic import of its
 * ".ts" path (Node's type stripping adds no extensions; tsc only sees a
 * string specifier and takes the type from the `typeof import` below).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./missing-column.ts";
const { isMissingColumnError, M1_USER_COLUMNS } = (await import(specifier)) as typeof import("./missing-column");

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
