/**
 * Tests for `viewer-can-delete.ts`, the `viewer_can_delete` rule (S68 officer
 * tools, contract C3).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/viewer-can-delete.test.ts
 *
 * The module has only `import type`, so it loads through a dynamic import of
 * its ".ts" path (the same pattern as `edit.test.ts`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./viewer-can-delete.ts";
const {
  CLUB_POST_DELETE_ROLES,
  isClubPostDeleteRole,
  isModeratorRemoved,
  viewerCanDeletePost,
} = (await import(specifier)) as typeof import("./viewer-can-delete");

test("only owners and admins may delete another student's club post", () => {
  assert.deepEqual([...CLUB_POST_DELETE_ROLES], ["owner", "admin"]);
  assert.equal(isClubPostDeleteRole("owner"), true);
  assert.equal(isClubPostDeleteRole("admin"), true);
  assert.equal(isClubPostDeleteRole("mod" as never), false, "no mods since 20261021100000");
  assert.equal(isClubPostDeleteRole("member"), false);
  assert.equal(isClubPostDeleteRole(null), false);
  assert.equal(isClubPostDeleteRole(undefined), false);
});

test("removed_at set means removed; null, undefined and empty do not", () => {
  assert.equal(isModeratorRemoved("2026-09-28T12:00:00Z"), true);
  assert.equal(isModeratorRemoved(null), false);
  assert.equal(isModeratorRemoved(undefined), false);
  assert.equal(isModeratorRemoved(""), false);
});

test("the author may delete their own post", () => {
  assert.equal(viewerCanDeletePost({ removed: false, isAuthor: true, clubOfficer: false }), true);
});

test("a current officer may delete a club post they didn't write", () => {
  assert.equal(viewerCanDeletePost({ removed: false, isAuthor: false, clubOfficer: true }), true);
});

test("anyone else may not", () => {
  assert.equal(viewerCanDeletePost({ removed: false, isAuthor: false, clubOfficer: false }), false);
});

test("nobody deletes a moderator-removed post, author or officer", () => {
  assert.equal(viewerCanDeletePost({ removed: true, isAuthor: true, clubOfficer: false }), false);
  assert.equal(viewerCanDeletePost({ removed: true, isAuthor: false, clubOfficer: true }), false);
  assert.equal(viewerCanDeletePost({ removed: true, isAuthor: true, clubOfficer: true }), false);
});
