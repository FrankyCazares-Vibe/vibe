// Your own comment: Edit for 3 minutes after sending (Nov 16, 2026).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const specifier = "./edit-window.ts";
const {
  COMMENT_EDIT_WINDOW_MS,
  COMMENT_EDIT_GRACE_MS,
  canEditComment,
  commentEditMsLeft,
  commentEditCutoffIso,
} = (await import(specifier)) as typeof import("./edit-window");

const SENT = "2026-11-16T22:00:00.000Z";
const at = (ms: number) => Date.parse(SENT) + ms;

test("the window is 3 minutes", () => {
  assert.equal(COMMENT_EDIT_WINDOW_MS, 180_000);
});

test("Edit shows for 3 minutes, then not", () => {
  assert.equal(canEditComment(SENT, at(0)), true);
  assert.equal(canEditComment(SENT, at(179_999)), true);
  assert.equal(canEditComment(SENT, at(180_000)), false);
  assert.equal(canEditComment(SENT, at(3_600_000)), false);
});

test("time left counts down to 0 and never below", () => {
  assert.equal(commentEditMsLeft(SENT, at(60_000)), 120_000);
  assert.equal(commentEditMsLeft(SENT, at(500_000)), 0);
});

test("a missing or broken date never opens the editor", () => {
  for (const bad of [undefined, null, "", "yesterday", 12]) {
    assert.equal(canEditComment(bad, at(0)), false);
    assert.equal(commentEditMsLeft(bad, at(0)), 0);
  }
});

test("the server's cutoff is the window plus a short grace, no more", () => {
  const now = at(0);
  assert.equal(Date.parse(commentEditCutoffIso(now)), now - COMMENT_EDIT_WINDOW_MS - COMMENT_EDIT_GRACE_MS);
  assert.ok(COMMENT_EDIT_GRACE_MS > 0 && COMMENT_EDIT_GRACE_MS <= 30_000);
});

test("the static popup carries the same 3 minutes", () => {
  const js = readFileSync(new URL("../../../public/html/_postViewer.js", import.meta.url), "utf8");
  assert.match(js, /const VPV_COMMENT_EDIT_WINDOW_MS = 3 \* 60 \* 1000;/);
  // Its own comments only, from the server's own answer.
  assert.match(js, /if \(c\.viewer_is_author === true && c\.id && !c\.removed_at\)/);
});

test("the route edits only the author's own, live, in-window comment", () => {
  const route = readFileSync(new URL("../../app/api/comments/[id]/route.ts", import.meta.url), "utf8");
  // The service-role write repeats every condition the read checked.
  assert.match(
    route,
    /\.update\(\{ content \}\)\s*\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)\s*\.is\("removed_at", null\)\s*\.gt\("created_at", cutoff\)/,
  );
  // Delete runs on the student's own session (the RLS policy is the boundary).
  assert.match(route, /await supabase\s*\.from\("post_comments"\)\s*\.delete\(\)\s*\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)/);
  assert.match(route, /requireCanPublish\(user\.id\)/);
  assert.match(route, /checkText\(content\)/);
});
