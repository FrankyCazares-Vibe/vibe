/**
 * Tests for `club-posts.ts`: which service-role club posts a viewer may see
 * (S67 security wave 2, integration I1; ruling 13).
 *
 * Run with:
 *   node --test src/lib/club-routes/club-posts.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./club-posts.ts";
const {
  CLUB_POST_SHOW_LIMIT,
  isMissingRestrictionsStore,
  visibleClubPosts,
} = (await import(specifier)) as typeof import("./club-posts");

const OFFICER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const OFFICER_B = "bbbbbbbb-0000-4000-8000-000000000002";
const RESTRICTED = "cccccccc-0000-4000-8000-000000000003";

const post = (id: string, author: string | null) => ({
  id,
  user: author ? { id: author } : null,
});
const NONE = { restricted: new Set<string>(), hiddenAuthors: new Set<string>() };

test("nothing to hide keeps every row, in order", () => {
  const rows = [post("1", OFFICER_A), post("2", OFFICER_B), post("3", null)];
  assert.deepEqual(visibleClubPosts(rows, NONE).map((r) => r.id), ["1", "2", "3"]);
});

test("a blocked author's club posts go; the other officer's stay (ruling 13)", () => {
  const rows = [post("1", OFFICER_A), post("2", OFFICER_B), post("3", OFFICER_A)];
  const out = visibleClubPosts(rows, { ...NONE, hiddenAuthors: new Set([OFFICER_A]) });
  assert.deepEqual(out.map((r) => r.id), ["2"]);
});

test("a restricted author's posts go, for signed-out viewers too", () => {
  const rows = [post("1", RESTRICTED), post("2", OFFICER_B)];
  const out = visibleClubPosts(rows, { restricted: new Set([RESTRICTED]), hiddenAuthors: new Set() });
  assert.deepEqual(out.map((r) => r.id), ["2"]);
});

test("ids match whatever their case", () => {
  const rows = [post("1", OFFICER_A.toUpperCase()), post("2", OFFICER_B)];
  const out = visibleClubPosts(rows, { ...NONE, hiddenAuthors: new Set([OFFICER_A]) });
  assert.deepEqual(out.map((r) => r.id), ["2"]);
});

test("a row whose author is gone is kept (nobody to restrict or block)", () => {
  const out = visibleClubPosts([post("1", null)], {
    restricted: new Set([RESTRICTED]),
    hiddenAuthors: new Set([OFFICER_A]),
  });
  assert.deepEqual(out.map((r) => r.id), ["1"]);
});

test("the limit counts shown rows, after the filters", () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => post(`hidden-${i}`, OFFICER_A)),
    ...Array.from({ length: 20 }, (_, i) => post(`ok-${i}`, OFFICER_B)),
  ];
  const out = visibleClubPosts(rows, { ...NONE, hiddenAuthors: new Set([OFFICER_A]) });
  assert.equal(out.length, CLUB_POST_SHOW_LIMIT);
  assert.ok(out.every((r) => r.id.startsWith("ok-")));
  assert.equal(visibleClubPosts(rows, NONE, 3).length, 3);
});

test("a missing restrictions table is recognised; any other error is not", () => {
  assert.equal(isMissingRestrictionsStore({ code: "42P01", message: "x" }), true);
  assert.equal(isMissingRestrictionsStore({ code: "PGRST205", message: "x" }), true);
  assert.equal(
    isMissingRestrictionsStore({ message: "Could not find the table 'public.account_restrictions'" }),
    true,
  );
  assert.equal(
    isMissingRestrictionsStore({ message: 'relation "account_restrictions" does not exist' }),
    true,
  );
  assert.equal(isMissingRestrictionsStore({ code: "57014", message: "canceling statement" }), false);
  assert.equal(isMissingRestrictionsStore(null), false);
  assert.equal(isMissingRestrictionsStore(undefined), false);
});
