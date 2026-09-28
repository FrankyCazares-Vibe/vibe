/**
 * Tests for `report-visibility.ts`: reporting keeps working across a block
 * (S67 security wave 2, A2).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/moderation/report-visibility.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./report-visibility.ts";
const {
  blockSuspects,
  commentVisibleIgnoringBlocks,
  crossBlockReportVerdict,
  postVisibleIgnoringBlocks,
} = (await import(specifier)) as typeof import("./report-visibility");

type PostFacts = import("./report-visibility").PostFacts;
type CommentFacts = import("./report-visibility").CommentFacts;

const VICTIM = "df5ab44e-0000-4000-8000-000000000001";
const HARASSER = "923896fb-0000-4000-8000-000000000002";
const OTHER = "017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

const post = (over: Partial<PostFacts> = {}): PostFacts => ({
  userId: HARASSER,
  status: "published",
  removedAt: null,
  authorVisible: true,
  clubAllowed: true,
  ...over,
});
const comment = (over: Partial<CommentFacts> = {}): CommentFacts => ({
  userId: HARASSER,
  removedAt: null,
  authorVisible: true,
  post: post({ userId: VICTIM }),
  ...over,
});
const blockedWith = (...ids: string[]) => new Set(ids);

test("a blocked pair's published post can be reported, whichever way the block goes", () => {
  assert.equal(
    crossBlockReportVerdict(VICTIM, { kind: "post", post: post() }, blockedWith(HARASSER)),
    "allow",
  );
});

test("no block with the reporter: the empty read stands", () => {
  assert.equal(crossBlockReportVerdict(VICTIM, { kind: "post", post: post() }, blockedWith()), "not_found");
  assert.equal(
    crossBlockReportVerdict(VICTIM, { kind: "post", post: post() }, blockedWith(OTHER)),
    "not_found",
  );
});

test("a block doesn't open what was closed anyway: draft, removed, restricted, hidden club", () => {
  const b = blockedWith(HARASSER);
  for (const p of [
    post({ status: "draft" }),
    post({ status: null }),
    post({ removedAt: "2026-09-27T00:00:00Z" }),
    post({ authorVisible: false }),
    post({ clubAllowed: false }),
  ]) {
    assert.equal(crossBlockReportVerdict(VICTIM, { kind: "post", post: p }, b), "not_found");
  }
});

test("a blocked person's comment on the reporter's own post can be reported", () => {
  const c = comment({ post: post({ userId: VICTIM, status: "draft" }) });
  // The reporter's own post counts as readable whatever its state (the author branch).
  assert.equal(crossBlockReportVerdict(VICTIM, { kind: "comment", comment: c }, blockedWith(HARASSER)), "allow");
});

test("a comment is reportable when the block is with its post's author", () => {
  const c = comment({ userId: OTHER, post: post({ userId: HARASSER }) });
  assert.equal(crossBlockReportVerdict(VICTIM, { kind: "comment", comment: c }, blockedWith(HARASSER)), "allow");
});

test("a comment hidden only by a block between two OTHER people stays not found", () => {
  // Product call 5: OTHER's comment on HARASSER's post vanishes for everyone
  // when those two are a block pair. The reporter isn't part of that block.
  const c = comment({ userId: OTHER, post: post({ userId: HARASSER }) });
  assert.equal(crossBlockReportVerdict(VICTIM, { kind: "comment", comment: c }, blockedWith()), "not_found");
});

test("a comment: removed, restricted author, or a post that's gone or closed is not found", () => {
  const b = blockedWith(HARASSER);
  for (const c of [
    comment({ removedAt: "2026-09-27T00:00:00Z" }),
    comment({ authorVisible: false }),
    comment({ post: null }),
    comment({ post: post({ userId: OTHER, status: "draft" }) }),
    comment({ post: post({ userId: OTHER, clubAllowed: false }) }),
    comment({ post: post({ userId: OTHER, authorVisible: false }) }),
  ]) {
    assert.equal(crossBlockReportVerdict(VICTIM, { kind: "comment", comment: c }, b), "not_found");
  }
});

test("the no-blocks rules mirror the two SELECT policies", () => {
  assert.equal(postVisibleIgnoringBlocks(VICTIM, post({ userId: VICTIM, removedAt: "x", status: "draft" })), true);
  assert.equal(postVisibleIgnoringBlocks(VICTIM, post()), true);
  assert.equal(commentVisibleIgnoringBlocks(VICTIM, comment({ userId: VICTIM, removedAt: "x", post: null })), true);
  assert.equal(commentVisibleIgnoringBlocks(VICTIM, comment()), true);
});

test("blockSuspects: distinct, lower case, never the reporter", () => {
  assert.deepEqual(blockSuspects(VICTIM, { kind: "post", post: post() }), [HARASSER]);
  assert.deepEqual(blockSuspects(VICTIM, { kind: "post", post: post({ userId: VICTIM }) }), []);
  assert.deepEqual(
    blockSuspects(VICTIM, { kind: "comment", comment: comment({ userId: OTHER.toUpperCase() }) }),
    [OTHER],
  );
  assert.deepEqual(
    blockSuspects(VICTIM, {
      kind: "comment",
      comment: comment({ userId: HARASSER, post: post({ userId: HARASSER.toUpperCase() }) }),
    }),
    [HARASSER],
  );
  assert.deepEqual(blockSuspects(VICTIM, { kind: "comment", comment: comment({ post: null }) }), [HARASSER]);
});

test("ids match in either case", () => {
  assert.equal(
    crossBlockReportVerdict(VICTIM.toUpperCase(), { kind: "post", post: post() }, blockedWith(HARASSER.toUpperCase())),
    "allow",
  );
});
