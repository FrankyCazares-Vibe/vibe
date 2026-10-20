/**
 * The "Reposted by" rules (Oct 19, 2026, decision 1a), no database:
 *   - only people the viewer follows are named, newest repost first, each
 *     once, never the viewer, never anyone blocked or muted;
 *   - everyone else is a number, `others_total`, which never goes below 0
 *     and leaves out the viewer's own repost (that is `viewer_reposted`);
 *   - a followed person whose profile didn't come back is counted, not named;
 *   - past MAX_NAMED_REPOSTERS the rest are still in `followed_total`;
 *   - the words add up to the post's total, and `total` is that total;
 *   - the follow check asks about the reposters, FOLLOW_CHECK_CHUNK at a
 *     time, and the repost read never claims more than max_rows (1,000).
 *
 * Run with:
 *   node --test src/lib/posts/reposters.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// A variable specifier, as engagement-counts.test.ts: `node --test` needs the
// ".ts", and the type check refuses a literal one.
const specifier = "./reposters.ts";
const { FOLLOW_CHECK_CHUNK, followedReposterIds, MAX_NAMED_REPOSTERS, MAX_REPOST_ROWS, reposterIdChunks, repostersCopy, shapeReposters } = (await import(
  specifier
)) as typeof import("./reposters");

const ME = "11111111-0000-4000-8000-000000000001";
const uid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 20, min)).toISOString();
const row = (n: number, min: number) => ({ user_id: uid(n), created_at: at(min) });
const person = (n: number, name: string) => ({ id: uid(n), name, handle: name.toLowerCase(), avatar_url: null });

test("names only followed reposters, newest first, each once, never me", () => {
  const rows = [row(1, 10), row(2, 30), row(3, 20), row(2, 5), { user_id: ME, created_at: at(40) }];
  const ids = followedReposterIds(rows, [uid(1), uid(2), ME], [], ME);
  assert.deepEqual(ids, [uid(2), uid(1)]);
});

test("a blocked or muted reposter is left out of the names", () => {
  const rows = [row(1, 10), row(2, 20), row(3, 30)];
  const ids = followedReposterIds(rows, [uid(1), uid(2), uid(3)], [uid(3)], ME);
  assert.deepEqual(ids, [uid(2), uid(1)]);
});

test("ids match in either case, and malformed rows are skipped", () => {
  const rows = [{ user_id: uid(1).toUpperCase(), created_at: at(1) }, null, 7, { user_id: 5 }, { created_at: at(2) }];
  assert.deepEqual(followedReposterIds(rows, [uid(1)], [], ME), [uid(1).toUpperCase()]);
  assert.deepEqual(followedReposterIds("nope", [uid(1)], [], ME), []);
});

test("non-followed reposters are counted, not named", () => {
  const a = shapeReposters({
    repostCount: 9,
    followedIds: [uid(2), uid(1)],
    users: [person(1, "Jonah"), person(2, "Maya")],
    followsYou: [uid(2)],
    viewerReposted: false,
  });
  assert.deepEqual(a.followed.map((p) => p.name), ["Maya", "Jonah"]);
  assert.deepEqual(a.followed.map((p) => p.follows_you), [true, false]);
  assert.equal(a.followed_total, 2);
  assert.equal(a.others_total, 7);
  assert.equal(JSON.stringify(a).includes(uid(3)), false);
});

test("others_total never goes below 0 and leaves my own repost out", () => {
  const raced = shapeReposters({ repostCount: 1, followedIds: [uid(1), uid(2)], users: [person(1, "A"), person(2, "B")], followsYou: [], viewerReposted: true });
  assert.equal(raced.others_total, 0);
  const mine = shapeReposters({ repostCount: 4, followedIds: [uid(1)], users: [person(1, "A")], followsYou: [], viewerReposted: true });
  assert.equal(mine.others_total, 2);
  for (const bad of [NaN, -3, "x", null, undefined, Infinity]) {
    assert.equal(shapeReposters({ repostCount: bad, followedIds: [], users: [], followsYou: [], viewerReposted: false }).others_total, 0);
  }
});

test("a followed reposter whose profile didn't come back joins the number", () => {
  const a = shapeReposters({ repostCount: 3, followedIds: [uid(1), uid(2)], users: [person(2, "Maya")], followsYou: [], viewerReposted: false });
  assert.deepEqual(a.followed.map((p) => p.id), [uid(2)]);
  assert.equal(a.followed_total, 1);
  assert.equal(a.others_total, 2);
});

test("past the cap, the rest stay in followed_total, not others", () => {
  const ids = Array.from({ length: MAX_NAMED_REPOSTERS + 5 }, (_, i) => uid(i + 1));
  const users = ids.slice(0, MAX_NAMED_REPOSTERS).map((id) => ({ id, name: "N", handle: "n", avatar_url: null }));
  const a = shapeReposters({ repostCount: ids.length + 10, followedIds: ids, users, followsYou: [], viewerReposted: false });
  assert.equal(a.followed.length, MAX_NAMED_REPOSTERS);
  assert.equal(a.followed_total, MAX_NAMED_REPOSTERS + 5);
  assert.equal(a.others_total, 10);
  assert.equal(repostersCopy(a).others, "+ 15 others reposted");
});

test("the words: named people, me, the number and the note", () => {
  const base = { followed: [], followed_total: 0, others_total: 0, viewer_reposted: false, total: 0 };
  const maya = { id: uid(1), name: "Maya", handle: "maya", avatar_url: null, follows_you: false };
  assert.deepEqual(repostersCopy(base), { you: null, others: null, note: null, empty: "No reposts yet." });
  assert.deepEqual(repostersCopy({ ...base, viewer_reposted: true }), { you: "You reposted this.", others: null, note: null, empty: null });
  assert.equal(repostersCopy({ ...base, followed: [maya], followed_total: 1, others_total: 1 }).others, "+ 1 other reposted");
  assert.equal(repostersCopy({ ...base, followed: [maya], followed_total: 1, others_total: 12 }).others, "+ 12 others reposted");
  assert.equal(repostersCopy({ ...base, followed: [maya], followed_total: 1 }).others, null);
  const strangers = repostersCopy({ ...base, others_total: 6 });
  assert.equal(strangers.others, "6 people reposted this");
  assert.equal(strangers.note, "You see names only for people you follow.");
  assert.equal(repostersCopy({ ...base, others_total: 1 }).others, "1 person reposted this");
  const meToo = repostersCopy({ ...base, others_total: 2, viewer_reposted: true });
  assert.equal(meToo.others, "+ 2 others reposted");
  assert.equal(meToo.note, "You see names only for people you follow.");
});

test("the follow check asks about each reposter once, never me, 100 at a time", () => {
  assert.equal(FOLLOW_CHECK_CHUNK, 100);
  const rows = [row(1, 1), { user_id: ME.toUpperCase(), created_at: at(2) }, row(1, 3), null, { user_id: "" }, ...Array.from({ length: 150 }, (_, i) => row(10 + i, 4))];
  const chunks = reposterIdChunks(rows, ME);
  assert.deepEqual(chunks.map((c) => c.length), [100, 51]);
  assert.equal(chunks[0]![0], uid(1));
  assert.ok(!chunks.flat().includes(ME));
  assert.deepEqual(reposterIdChunks(rows.slice(0, 3), ME, 1), [[uid(1)]]);
  assert.deepEqual(reposterIdChunks("nope", ME), []);
});

test("the repost read's cap is PostgREST's max_rows, and total is the count read", () => {
  // supabase/config.toml max_rows = 1000: a larger .limit() is cut to it anyway.
  assert.equal(MAX_REPOST_ROWS, 1000);
  const a = shapeReposters({ repostCount: 15, followedIds: [uid(1)], users: [person(1, "Maya")], followsYou: [], viewerReposted: true });
  assert.equal(a.total, 15);
  assert.equal(a.followed_total + a.others_total + (a.viewer_reposted ? 1 : 0), a.total);
  assert.equal(shapeReposters({ repostCount: "x", followedIds: [], users: [], followsYou: [], viewerReposted: false }).total, 0);
});
