/**
 * Tests for which files a post / club deletion takes (`delete-media.ts`).
 *
 * Run with:
 *   node --test src/lib/posts/delete-media.test.ts
 *
 * WHY THE RESOLVE HOOK: delete-media.ts imports its sibling rule modules
 * extensionless (what Next and tsc expect); Node's type stripping adds no
 * extension. Same hook as tags.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("delete-media.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const specifier = "./delete-media.ts";
const { evidenceToKeep, isClubPostMediaKey, orgKeysNamedIn, planPostMediaDelete } = (await import(
  specifier
)) as typeof import("./delete-media");

const PROJECT = "https://abcd1234.supabase.co";
const AUTHOR = "df5ab44e-1111-4222-8333-944445555666";
const VICTIM = "0a1b2c3d-1111-4222-8333-944445555666";
const ORG = "9f8e7d6c-1111-4222-8333-944445555666";
const OTHER_ORG = "1a2b3c4d-1111-4222-8333-944445555666";
const pub = (path: string) => `${PROJECT}/storage/v1/object/public/profiles/${path}`;

test("a photo post (same URL in both columns) removes one profiles path", () => {
  const url = pub(`${AUTHOR}/posts/p1.jpg`);
  const plan = planPostMediaDelete(
    { user_id: AUTHOR, media_url: url, media_thumbnail_url: url },
    [],
    [],
    PROJECT,
  );
  assert.deepEqual(plan, { profilesPaths: [`${AUTHOR}/posts/p1.jpg`], r2Keys: [], held: 0 });
});

test("a video post removes its clip key and its poster frame", () => {
  const plan = planPostMediaDelete(
    {
      user_id: AUTHOR,
      media_url: `clips/${AUTHOR}/v1.mp4`,
      media_thumbnail_url: pub(`${AUTHOR}/posters/v1.jpg`),
    },
    [],
    [],
    PROJECT,
  );
  assert.deepEqual(plan.profilesPaths, [`${AUTHOR}/posters/v1.jpg`]);
  assert.deepEqual(plan.r2Keys, [`clips/${AUTHOR}/v1.mp4`]);
});

test("a file another post names is held, a removed twin included", () => {
  const url = pub(`${AUTHOR}/posts/shared.jpg`);
  const clip = `clips/${AUTHOR}/shared.mp4`;
  const plan = planPostMediaDelete(
    { user_id: AUTHOR, media_url: clip, media_thumbnail_url: url },
    [{ user_id: AUTHOR, media_url: url }, { user_id: AUTHOR, media_url: clip }],
    [],
    PROJECT,
  );
  assert.deepEqual(plan, { profilesPaths: [], r2Keys: [], held: 2 });
});

test("the author's avatar naming the post photo keeps it", () => {
  const url = pub(`${AUTHOR}/posts/p2.jpg`);
  const plan = planPostMediaDelete({ user_id: AUTHOR, media_url: url }, [], [url], PROJECT);
  assert.deepEqual(plan, { profilesPaths: [], r2Keys: [], held: 1 });
});

test("another student's file or another club's key is never a candidate", () => {
  const plan = planPostMediaDelete(
    {
      user_id: AUTHOR,
      org_id: ORG,
      media_url: pub(`${VICTIM}/posts/theirs.jpg`),
      media_thumbnail_url: `clips/${VICTIM}/theirs.mp4`,
    },
    [],
    [],
    PROJECT,
  );
  assert.deepEqual(plan, { profilesPaths: [], r2Keys: [], held: 0 });
  const other = planPostMediaDelete(
    { user_id: AUTHOR, org_id: ORG, media_url: `orgs/${OTHER_ORG}/posts/x.jpg` },
    [],
    [],
    PROJECT,
  );
  assert.deepEqual(other.r2Keys, []);
});

test("a club post takes its orgs/<club>/posts/ key, never the logo or banner", () => {
  const post = `orgs/${ORG}/posts/a.jpg`;
  const logo = `orgs/${ORG}/logo/l.png`;
  assert.deepEqual(
    planPostMediaDelete({ user_id: AUTHOR, org_id: ORG, media_url: post }, [], [], PROJECT).r2Keys,
    [post],
  );
  // A planted club post that names the club's own logo erases nothing.
  const planted = planPostMediaDelete(
    { user_id: AUTHOR, org_id: ORG, media_url: logo },
    [],
    [logo],
    PROJECT,
  );
  assert.deepEqual(planted, { profilesPaths: [], r2Keys: [], held: 0 });
  // A posts/ key the logo column names is held too.
  const heldByLogo = planPostMediaDelete(
    { user_id: AUTHOR, org_id: ORG, media_url: post },
    [],
    [post],
    PROJECT,
  );
  assert.deepEqual(heldByLogo, { profilesPaths: [], r2Keys: [], held: 1 });
  // Without a club, an orgs/ key is nobody's to delete.
  assert.deepEqual(
    planPostMediaDelete({ user_id: AUTHOR, org_id: null, media_url: post }, [], [], PROJECT).r2Keys,
    [],
  );
});

test("isClubPostMediaKey accepts only the club's posts folder", () => {
  assert.equal(isClubPostMediaKey(`orgs/${ORG}/posts/a.jpg`, ORG), true);
  assert.equal(isClubPostMediaKey(`orgs/${ORG}/banner/a.jpg`, ORG), false);
  assert.equal(isClubPostMediaKey(`orgs/${ORG}/posts/../logo/a.jpg`, ORG), false);
  assert.equal(isClubPostMediaKey(`orgs/${ORG}/posts/a.jpg`, OTHER_ORG), false);
  assert.equal(isClubPostMediaKey(null, ORG), false);
});

test("evidenceToKeep: removed photo and video posts, own folders only", () => {
  const ev = evidenceToKeep(
    [
      { user_id: AUTHOR, media_url: pub(`${AUTHOR}/posts/r.jpg`), media_thumbnail_url: pub(`${AUTHOR}/posts/r.jpg`) },
      { user_id: AUTHOR, media_url: `clips/${AUTHOR}/r.mp4`, media_thumbnail_url: pub(`${AUTHOR}/posters/r.jpg`) },
      { user_id: VICTIM, media_url: pub(`${VICTIM}/posts/v.jpg`) },
      { user_id: AUTHOR, media_url: pub(`${VICTIM}/posts/v2.jpg`) },
    ],
    [],
    AUTHOR,
    PROJECT,
  );
  assert.deepEqual(ev.profilesPaths.sort(), [`${AUTHOR}/posters/r.jpg`, `${AUTHOR}/posts/r.jpg`]);
  assert.deepEqual(ev.clipKeys, [`clips/${AUTHOR}/r.mp4`]);
});

test("evidenceToKeep: a reported person's own avatar/cover, not someone else's", () => {
  const avatar = pub(`${AUTHOR}/avatar-9f8e7d6c-1111-4222-8333-944445555666.jpg`);
  const ev = evidenceToKeep(
    [],
    [avatar, pub(`${VICTIM}/avatar-9f8e7d6c-1111-4222-8333-944445555666.jpg`), null],
    AUTHOR,
    PROJECT,
  );
  assert.deepEqual(ev.profilesPaths, [`${AUTHOR}/avatar-9f8e7d6c-1111-4222-8333-944445555666.jpg`]);
  assert.deepEqual(ev.clipKeys, []);
});

test("orgKeysNamedIn finds the club's keys inside JSON, and only that club's", () => {
  const meta = { previous: { logo: `orgs/${ORG}/logo/old.png` }, other: `orgs/${OTHER_ORG}/logo/x.png` };
  const snap = { media_url: `orgs/${ORG}/posts/p.jpg`, text: "no key here" };
  const found = orgKeysNamedIn([meta, snap, null, "plain"], ORG);
  assert.deepEqual(Array.from(found).sort(), [`orgs/${ORG}/logo/old.png`, `orgs/${ORG}/posts/p.jpg`]);
  assert.equal(orgKeysNamedIn([meta], "not-a-uuid").size, 0);
});

test("orgKeysNamedIn keeps an event cover named by an event report or an event takedown (Oct 23, 2026)", () => {
  const cover = `orgs/${ORG}/events/4b1c2d3e-1111-4222-8333-944445555666.jpg`;
  const snap = { id: "e", title: "Mixer", org_id: ORG, cover_key: cover };
  const takedown = { slots: ["cover"], previous: { cover }, paths: [], org_id: ORG };
  assert.deepEqual(Array.from(orgKeysNamedIn([snap], ORG)), [cover]);
  assert.deepEqual(Array.from(orgKeysNamedIn([takedown], ORG)), [cover]);
  assert.equal(orgKeysNamedIn([{ cover_key: `orgs/${OTHER_ORG}/events/x.jpg` }], ORG).size, 0, "another club's");
});
