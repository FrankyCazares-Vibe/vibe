/**
 * The shared like / save / repost / comment-count record (Oct 19, 2026,
 * critique M1): seed, a tap, a server read overwriting, an in-flight field
 * kept, a stale read ignored (sent before the tap, or while it was out),
 * rollback, and listeners.
 *
 * Run with:
 *   node --test src/lib/posts/engagement-store.test.ts
 *
 * Each test uses its own post id: the store is one module-wide map, as it is
 * in the app (one per tab).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const storeSpecifier = "./engagement-store.ts";
const store = (await import(storeSpecifier)) as typeof import("./engagement-store");
const {
  applyServerEngagement,
  beginEngagementTap,
  engagementFromFeedPost,
  engagementReadToken,
  patchEngagement,
  readEngagement,
  seedEngagementFromFeed,
  subscribeEngagement,
} = store;

type E = import("./engagement-store").PostEngagement;
let n = 0;
const freshId = () => `post-${++n}`;
const base = (over: Partial<E> = {}): E => ({
  liked: false,
  likeCount: 3,
  saved: false,
  reposted: false,
  repostCount: 1,
  commentCount: 2,
  ...over,
});
const like = (c: E) => ({ liked: !c.liked, likeCount: c.likeCount + (c.liked ? -1 : 1) });

test("the feed seeds a record from its own fields", () => {
  const id = freshId();
  assert.equal(readEngagement(id), undefined);
  seedEngagementFromFeed(
    [{ id, viewer_liked: true, like_count: 4, viewer_saved: true, viewer_reposted: false, repost_count: 2, comment_count: 7 }],
    engagementReadToken(),
  );
  assert.deepEqual(readEngagement(id), {
    liked: true,
    likeCount: 4,
    saved: true,
    reposted: false,
    repostCount: 2,
    commentCount: 7,
  });
});

test("a feed post with missing or junk fields reads as zeros and false, never NaN", () => {
  assert.deepEqual(engagementFromFeedPost({ id: "x", like_count: Number.NaN, comment_count: -4, viewer_liked: null }), {
    liked: false,
    likeCount: 0,
    saved: false,
    reposted: false,
    repostCount: 0,
    commentCount: 0,
  });
});

test("a feed refresh that couldn't read a field (missing or null) leaves the good value alone (review r2)", () => {
  const id = freshId();
  seedEngagementFromFeed(
    [{ id, viewer_liked: true, like_count: 4, viewer_saved: true, viewer_reposted: true, repost_count: 2, comment_count: 7 }],
    engagementReadToken(),
  );
  seedEngagementFromFeed([{ id, viewer_liked: null, like_count: null, viewer_saved: false }], engagementReadToken());
  assert.deepEqual(readEngagement(id), {
    liked: true,
    likeCount: 4,
    saved: false,
    reposted: true,
    repostCount: 2,
    commentCount: 7,
  });
  // A post seen for the first time with a field missing still starts at 0 / false.
  const other = freshId();
  seedEngagementFromFeed([{ id: other, like_count: 2 }], engagementReadToken());
  assert.deepEqual(readEngagement(other), { liked: false, likeCount: 2, saved: false, reposted: false, repostCount: 0, commentCount: 0 });
});

test("a tap changes the record at once, for every reader, and commit keeps it", () => {
  const id = freshId();
  let calls = 0;
  const off = subscribeEngagement(id, () => calls++);
  const tap = beginEngagementTap(id, "like", base(), like);
  assert.ok(tap);
  assert.equal(readEngagement(id)?.liked, true);
  assert.equal(readEngagement(id)?.likeCount, 4);
  assert.equal(calls, 1);
  tap.commit();
  assert.equal(readEngagement(id)?.liked, true);
  off();
});

test("a tap only moves its own group's fields", () => {
  const id = freshId();
  const tap = beginEngagementTap(id, "save", base(), () => ({ saved: true, likeCount: 99, commentCount: 99 }));
  tap?.commit();
  assert.deepEqual(readEngagement(id), { ...base(), saved: true });
});

test("a second tap on the same group while the first is out is dropped", () => {
  const id = freshId();
  const first = beginEngagementTap(id, "like", base(), like);
  assert.ok(first);
  assert.equal(beginEngagementTap(id, "like", base(), like), null);
  // Another group is free.
  assert.ok(beginEngagementTap(id, "save", base(), (c) => ({ saved: !c.saved })));
  first.commit();
  assert.ok(beginEngagementTap(id, "like", base(), like));
});

test("a refused tap rolls the record back, and only its own group", () => {
  const id = freshId();
  seedEngagementFromFeed([{ id, like_count: 3, comment_count: 2, repost_count: 1 }], engagementReadToken());
  const tap = beginEngagementTap(id, "like", base(), like);
  patchEngagement(id, "comment", base(), (c) => ({ commentCount: c.commentCount + 1 }));
  let calls = 0;
  const off = subscribeEngagement(id, () => calls++);
  tap?.rollback();
  assert.equal(readEngagement(id)?.liked, false);
  assert.equal(readEngagement(id)?.likeCount, 3);
  assert.equal(readEngagement(id)?.commentCount, 3, "the comment posted meanwhile stays");
  assert.equal(calls, 1);
  // A settled tap can't be settled twice.
  tap?.rollback();
  tap?.commit();
  assert.equal(calls, 1);
  off();
});

test("a fresh server read overwrites what the feed seeded", () => {
  const id = freshId();
  seedEngagementFromFeed([{ id, like_count: 3, viewer_liked: false }], engagementReadToken());
  applyServerEngagement(id, { liked: true, likeCount: 5, reposted: true, repostCount: 2, saved: true, commentCount: 9 }, engagementReadToken());
  assert.deepEqual(readEngagement(id), { liked: true, likeCount: 5, saved: true, reposted: true, repostCount: 2, commentCount: 9 });
});

test("a read keeps a group whose tap is still in flight, and overwrites the rest", () => {
  const id = freshId();
  const tap = beginEngagementTap(id, "like", base(), like);
  const token = engagementReadToken();
  applyServerEngagement(id, { liked: false, likeCount: 3, saved: true, commentCount: 8 }, token);
  assert.equal(readEngagement(id)?.liked, true, "the like in flight wins");
  assert.equal(readEngagement(id)?.likeCount, 4);
  assert.equal(readEngagement(id)?.saved, true);
  assert.equal(readEngagement(id)?.commentCount, 8);
  tap?.commit();
  // Once it settles, a read sent after it overwrites as usual.
  applyServerEngagement(id, { liked: true, likeCount: 6 }, engagementReadToken());
  assert.equal(readEngagement(id)?.likeCount, 6);
});

test("a read sent before a tap can't undo it, even when it lands after the tap settled", () => {
  const id = freshId();
  seedEngagementFromFeed([{ id, like_count: 3 }], engagementReadToken());
  const sentBefore = engagementReadToken();
  beginEngagementTap(id, "like", base(), like)?.commit();
  // The old answer (made before the like) arrives late.
  applyServerEngagement(id, { liked: false, likeCount: 3, commentCount: 5 }, sentBefore);
  assert.equal(readEngagement(id)?.liked, true);
  assert.equal(readEngagement(id)?.likeCount, 4);
  assert.equal(readEngagement(id)?.commentCount, 5, "groups nobody tapped still update");
});

test("a read sent WHILE a tap is out can't undo it after the tap commits (review r3)", () => {
  // The race the review reproduced: unlike on the card, open the post at
  // once; the post read was answered before the DELETE committed and lands
  // after it, carrying the pre-write state.
  const id = freshId();
  seedEngagementFromFeed([{ id, viewer_liked: true, like_count: 1 }], engagementReadToken());
  const tap = beginEngagementTap(id, "like", base({ liked: true, likeCount: 1 }), like);
  assert.ok(tap);
  const sentDuring = engagementReadToken();
  tap.commit();
  applyServerEngagement(id, { liked: true, likeCount: 1, commentCount: 6 }, sentDuring);
  assert.equal(readEngagement(id)?.liked, false, "the committed unlike stays");
  assert.equal(readEngagement(id)?.likeCount, 0);
  assert.equal(readEngagement(id)?.commentCount, 6, "groups nobody tapped still update");
  // A read sent after the tap settled is the truth again.
  applyServerEngagement(id, { liked: true, likeCount: 2 }, engagementReadToken());
  assert.equal(readEngagement(id)?.likeCount, 2);
});

test("a read sent while a refused tap was out can't flip it either", () => {
  const id = freshId();
  seedEngagementFromFeed([{ id, viewer_saved: false }], engagementReadToken());
  const tap = beginEngagementTap(id, "save", base(), (c) => ({ saved: !c.saved }));
  const sentDuring = engagementReadToken();
  tap?.rollback();
  applyServerEngagement(id, { saved: true }, sentDuring);
  assert.equal(readEngagement(id)?.saved, false);
});

test("a confirmed local change (a comment posted) beats a stale read too", () => {
  const id = freshId();
  seedEngagementFromFeed([{ id, comment_count: 2 }], engagementReadToken());
  const sentBefore = engagementReadToken();
  patchEngagement(id, "comment", base(), (c) => ({ commentCount: c.commentCount + 1 }));
  applyServerEngagement(id, { commentCount: 2 }, sentBefore);
  assert.equal(readEngagement(id)?.commentCount, 3);
  applyServerEngagement(id, { commentCount: 4 }, engagementReadToken());
  assert.equal(readEngagement(id)?.commentCount, 4);
});

test("an unchanged read notifies nobody; a tap on an unseeded post starts from the card's fields", () => {
  const id = freshId();
  const tap = beginEngagementTap(id, "repost", base({ repostCount: 6 }), (c) => ({ reposted: true, repostCount: c.repostCount + 1 }));
  tap?.commit();
  assert.deepEqual(readEngagement(id), { ...base(), reposted: true, repostCount: 7 });
  let calls = 0;
  const off = subscribeEngagement(id, () => calls++);
  applyServerEngagement(id, { reposted: true, repostCount: 7 }, engagementReadToken());
  assert.equal(calls, 0);
  off();
});
