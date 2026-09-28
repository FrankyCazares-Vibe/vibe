import { test } from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097) and next build type-checks this file. A variable specifier
// keeps both happy, the display-mode.test.ts pattern.
const specifier = "./media-quarantine.ts";
const { authorPostMediaPath, isAuthorPostPhotoUrl, leftOnlineKind, planPostQuarantine } = (await import(
  specifier
)) as typeof import("./media-quarantine");

const PROJECT = "https://abcd1234.supabase.co";
const AUTHOR = "df5ab44e-1111-4222-8333-944445555666";
const VICTIM = "0a1b2c3d-1111-4222-8333-944445555666";
const pub = (path: string) => `${PROJECT}/storage/v1/object/public/profiles/${path}`;

test("the author's own post photo and poster frame are quarantined", () => {
  assert.equal(
    authorPostMediaPath(pub(`${AUTHOR}/posts/post-1.jpg`), PROJECT, AUTHOR),
    `${AUTHOR}/posts/post-1.jpg`,
  );
  assert.equal(
    authorPostMediaPath(pub(`${AUTHOR}/posters/poster-2.jpg`), PROJECT, AUTHOR),
    `${AUTHOR}/posters/poster-2.jpg`,
  );
});

test("a cache-busting query string is ignored", () => {
  assert.equal(
    authorPostMediaPath(`${pub(`${AUTHOR}/posts/p.webp`)}?t=123#x`, PROJECT, AUTHOR),
    `${AUTHOR}/posts/p.webp`,
  );
});

test("another student's file is never touched, even from the author's post", () => {
  assert.equal(authorPostMediaPath(pub(`${VICTIM}/posts/p.jpg`), PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(pub(`${VICTIM}/avatar-1.jpg`), PROJECT, AUTHOR), null);
});

test("the author's avatar, banner and logos are not post media", () => {
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/avatar-1.jpg`), PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/logos/l.png`), PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/posts/deep/p.png`), PROJECT, AUTHOR), null);
});

test("path tricks are refused before the URL parser can resolve them", () => {
  const sneaky = pub(`${VICTIM}/posts/../../${AUTHOR}/posts/p.jpg`);
  assert.equal(authorPostMediaPath(sneaky, PROJECT, AUTHOR), null);
  const encoded = pub(`${AUTHOR}/posts/%2e%2e/p.jpg`);
  assert.equal(authorPostMediaPath(encoded, PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/posts/.hidden`), PROJECT, AUTHOR), null);
});

test("other hosts, other buckets and bad input are refused", () => {
  const other = `https://evil.example/storage/v1/object/public/profiles/${AUTHOR}/posts/p.jpg`;
  assert.equal(authorPostMediaPath(other, PROJECT, AUTHOR), null);
  const resumes = `${PROJECT}/storage/v1/object/public/resumes/${AUTHOR}/posts/p.jpg`;
  assert.equal(authorPostMediaPath(resumes, PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(`clips/${AUTHOR}/v.mp4`, PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(null, PROJECT, AUTHOR), null);
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/posts/p.jpg`), PROJECT, "not-a-uuid"), null);
  assert.equal(authorPostMediaPath(pub(`${AUTHOR}/posts/p.jpg`), "not a url", AUTHOR), null);
});

test("local development's http project URL works the same way", () => {
  const local = "http://127.0.0.1:54321";
  const ref = `${local}/storage/v1/object/public/profiles/${AUTHOR}/posts/p.jpg`;
  assert.equal(authorPostMediaPath(ref, local, AUTHOR), `${AUTHOR}/posts/p.jpg`);
});

test("what is left online is named by kind", () => {
  assert.equal(leftOnlineKind(`clips/${AUTHOR}/v.mp4`, PROJECT), "r2");
  assert.equal(leftOnlineKind(`orgs/${VICTIM}/p.jpg`, PROJECT), "r2");
  assert.equal(leftOnlineKind(pub(`${VICTIM}/avatar.jpg`), PROJECT), "foreign");
  assert.equal(leftOnlineKind("https://imgur.example/a.jpg", PROJECT), "external");
});

test("an image post's two identical columns move one file", () => {
  const url = pub(`${AUTHOR}/posts/post-1.jpg`);
  const plan = planPostQuarantine(
    { user_id: AUTHOR, media_url: url, media_thumbnail_url: url },
    PROJECT,
  );
  assert.deepEqual(plan.paths, [`${AUTHOR}/posts/post-1.jpg`]);
  assert.deepEqual(plan.left, { r2: 0, foreign: 0, external: 0 });
});

test("a video post moves its poster frame and leaves the R2 video", () => {
  const plan = planPostQuarantine(
    {
      user_id: AUTHOR,
      media_url: `clips/${AUTHOR}/v.mp4`,
      media_thumbnail_url: pub(`${AUTHOR}/posters/poster-1.jpg`),
    },
    PROJECT,
  );
  assert.deepEqual(plan.paths, [`${AUTHOR}/posters/poster-1.jpg`]);
  assert.deepEqual(plan.left, { r2: 1, foreign: 0, external: 0 });
});

test("a text post, or one pointing elsewhere, moves nothing", () => {
  assert.deepEqual(planPostQuarantine({ user_id: AUTHOR }, PROJECT).paths, []);
  const plan = planPostQuarantine(
    { user_id: AUTHOR, media_url: pub(`${VICTIM}/posts/p.jpg`), media_thumbnail_url: "" },
    PROJECT,
  );
  assert.deepEqual(plan.paths, []);
  assert.deepEqual(plan.left, { r2: 0, foreign: 1, external: 0 });
});

// isAuthorPostPhotoUrl: what a post may STORE as its photo (repair round 1).
// It must never accept a URL the quarantine can't move, or a moderator's
// removal leaves the photo online again.

test("a post may store the author's own post photo and poster frame", () => {
  for (const path of [`${AUTHOR}/posts/post-1.jpg`, `${AUTHOR}/posters/poster-2.jpg`]) {
    assert.equal(isAuthorPostPhotoUrl(pub(path), PROJECT, AUTHOR), true, path);
    // ...and every one of them is a file the removal takes offline.
    assert.equal(authorPostMediaPath(pub(path), PROJECT, AUTHOR), path);
  }
});

test("the author's banner, avatar and logos can't be posted as a photo", () => {
  for (const path of [
    `${AUTHOR}/banner-1.jpg`,
    `${AUTHOR}/avatar-1.jpg`,
    `${AUTHOR}/logos/logo-1.png`,
  ]) {
    assert.equal(isAuthorPostPhotoUrl(pub(path), PROJECT, AUTHOR), false, path);
  }
});

test("another student's photo can't be re-posted as your own", () => {
  assert.equal(isAuthorPostPhotoUrl(pub(`${VICTIM}/posts/p.jpg`), PROJECT, AUTHOR), false);
  assert.equal(isAuthorPostPhotoUrl(pub(`${VICTIM}/avatar-1.jpg`), PROJECT, AUTHOR), false);
});

test("a stored photo URL is plain: no query, hash, http, other host or odd path", () => {
  const own = pub(`${AUTHOR}/posts/p.jpg`);
  for (const ref of [
    `${own}?t=1`,
    `${own}#x`,
    own.replace("https:", "http:"),
    own.replace("abcd1234", "ABCD1234"),
    own.replace(PROJECT, "https://evil.example"),
    own.replace(PROJECT, `${PROJECT}:443`),
    own.replace("/public/", "/sign/"),
    own.replace("/profiles/", "/quarantine/"),
    pub(`${AUTHOR}/posts/sub/p.jpg`),
    pub(`${AUTHOR}/posts/.p`),
    pub(`${AUTHOR}/posts/..p`),
    pub(`${AUTHOR}/posts/../${VICTIM}/posts/p.jpg`),
    pub(`${AUTHOR}/posts/p%2ejpg`),
    pub(`${AUTHOR}/posts/`),
    pub(`${AUTHOR}/posts/${"a".repeat(2100)}.jpg`),
    `clips/${AUTHOR}/v.mp4`,
    "",
  ]) {
    assert.equal(isAuthorPostPhotoUrl(ref, PROJECT, AUTHOR), false, ref.slice(0, 120));
  }
});

test("a missing or malformed author, ref or project refuses", () => {
  const own = pub(`${AUTHOR}/posts/p.jpg`);
  assert.equal(isAuthorPostPhotoUrl(own, PROJECT, null), false);
  assert.equal(isAuthorPostPhotoUrl(own, PROJECT, AUTHOR.toUpperCase()), false);
  assert.equal(isAuthorPostPhotoUrl(own, "not a url", AUTHOR), false);
  assert.equal(isAuthorPostPhotoUrl(null, PROJECT, AUTHOR), false);
  assert.equal(isAuthorPostPhotoUrl(42, PROJECT, AUTHOR), false);
});
