/**
 * Tests for `feed-actions.ts`, the rows of the phone feed card's ⋯ sheet
 * (Delete on the card since Oct 14 2026).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/feed-actions.test.ts
 *
 * The module has no imports, so it loads through a dynamic import of its
 * ".ts" path (the same pattern as `viewer-can-delete.test.ts`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./feed-actions.ts";
const { deletesAsOfficer, postSheetRows } = (await import(specifier)) as typeof import(
  "./feed-actions"
);

const base = { isOwner: false, viewerCanDelete: false, removed: false, canBlock: true };

test("your own post: Edit post, then Delete post", () => {
  assert.deepEqual(postSheetRows({ ...base, isOwner: true, viewerCanDelete: true }), [
    "send",
    "copy",
    "edit",
    "delete",
  ]);
});

test("your own post without the server's yes keeps Edit and drops Delete (fail closed)", () => {
  assert.deepEqual(postSheetRows({ ...base, isOwner: true }), ["send", "copy", "edit"]);
});

test("your own removed post: no Edit, no Delete", () => {
  assert.deepEqual(
    postSheetRows({ ...base, isOwner: true, viewerCanDelete: true, removed: true }),
    ["send", "copy"],
  );
});

test("someone else's post: Report and Block, never Edit or Delete", () => {
  assert.deepEqual(postSheetRows(base), ["send", "copy", "report", "block"]);
});

test("no author id: no Block author", () => {
  assert.deepEqual(postSheetRows({ ...base, canBlock: false }), ["send", "copy", "report"]);
});

test("a club officer on someone else's club post: Delete between Report and Block", () => {
  assert.deepEqual(postSheetRows({ ...base, viewerCanDelete: true }), [
    "send",
    "copy",
    "report",
    "delete",
    "block",
  ]);
});

test("nobody gets Delete on a removed post, officer included", () => {
  assert.equal(
    postSheetRows({ ...base, viewerCanDelete: true, removed: true }).includes("delete"),
    false,
  );
});

test("Send to chats and Copy link always lead", () => {
  for (const isOwner of [true, false]) {
    for (const viewerCanDelete of [true, false]) {
      for (const removed of [true, false]) {
        const rows = postSheetRows({ isOwner, viewerCanDelete, removed, canBlock: true });
        assert.deepEqual(rows.slice(0, 2), ["send", "copy"]);
      }
    }
  }
});

test("only an officer on someone else's post deletes as an officer", () => {
  assert.equal(deletesAsOfficer({ isOwner: false, viewerCanDelete: true }), true);
  assert.equal(deletesAsOfficer({ isOwner: true, viewerCanDelete: true }), false);
  assert.equal(deletesAsOfficer({ isOwner: false, viewerCanDelete: false }), false);
  assert.equal(deletesAsOfficer({ isOwner: true, viewerCanDelete: false }), false);
});
