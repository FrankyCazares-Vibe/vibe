/**
 * Tests for `removals.ts` (S67 security wave 2 #15).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/removals.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./removals.ts";
const { ORG_REMOVALS_TABLE, isMissingRemovalsTable, removedIdSet } = (await import(
  specifier
)) as typeof import("./removals");

const A = "6979e030-690b-4092-bb91-fd6f00a6a988";
const B = "be3e2af2-f457-4414-8f22-8746bdf9bf59";

test("the table name matches the migration", () => {
  assert.equal(ORG_REMOVALS_TABLE, "org_removals");
});

test("PostgREST's and Postgres's 'no such table' for org_removals are recognised", () => {
  assert.equal(
    isMissingRemovalsTable({
      code: "PGRST205",
      message: "Could not find the table 'public.org_removals' in the schema cache",
    }),
    true,
  );
  assert.equal(
    isMissingRemovalsTable({ code: "42P01", message: 'relation "public.org_removals" does not exist' }),
    true,
  );
});

test("a missing OTHER table, or any other error, still fails closed", () => {
  assert.equal(
    isMissingRemovalsTable({ code: "42P01", message: 'relation "public.org_members" does not exist' }),
    false,
  );
  assert.equal(isMissingRemovalsTable({ code: "42501", message: "permission denied for table org_removals" }), false);
  assert.equal(isMissingRemovalsTable({ code: "PGRST205" }), false);
  assert.equal(isMissingRemovalsTable(null), false);
  assert.equal(isMissingRemovalsTable(undefined), false);
});

test("removedIdSet keeps only asked-about ids, case-insensitively", () => {
  const set = removedIdSet([A, B.toUpperCase()], [
    { user_id: B },
    { user_id: "c3b9dbb5-df1f-4674-9a9b-134a487ae1a2" },
    { user_id: null },
    {},
  ]);
  assert.deepEqual([...set], [B]);
  assert.equal(removedIdSet([A], null).size, 0);
});
