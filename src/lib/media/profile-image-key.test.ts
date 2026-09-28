import { test } from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097) and next build type-checks this file. A variable specifier
// keeps both happy (the media-quarantine.test.ts pattern).
const specifier = "./profile-image-key.ts";
const { ownProfileImageKey } = (await import(specifier)) as typeof import("./profile-image-key");

const PROJECT = "https://abcd1234.supabase.co";
const OWNER = "df5ab44e-1111-4222-8333-944445555666";
const VICTIM = "0a1b2c3d-1111-4222-8333-944445555666";
const UUID = "9f8e7d6c-1111-4222-8333-944445555666";
const pub = (path: string, origin = PROJECT) => `${origin}/storage/v1/object/public/profiles/${path}`;
const key = (ref: string | null | undefined, owner = OWNER, url: string | null = PROJECT) =>
  ownProfileImageKey(ref, owner, url);

test("every shape an upload writes today maps to its slot", () => {
  const cases: Array<[string, string]> = [
    [`${OWNER}/avatar-${UUID}.jpg`, "avatar"],
    [`${OWNER}/banner-${UUID}.jpg`, "banner"],
    [`${OWNER}/avatar-${UUID}.webp`, "avatar"],
    [`${OWNER}/banner-${UUID}.png`, "banner"],
    [`${OWNER}/logos/logo-${UUID}.jpg`, "logo"],
    [`${OWNER}/posts/post-${UUID}.jpg`, "post"],
    [`${OWNER}/posters/poster-${UUID}.jpg`, "poster"],
  ];
  for (const [path, slot] of cases) {
    assert.deepEqual(key(pub(path)), { path, slot }, `url ${path}`);
    assert.deepEqual(key(path), { path, slot }, `bare ${path}`);
  }
});

test("the folder decides inside a folder; a root file must be avatar-/banner- to be one", () => {
  // An avatar-named file under posts/ is a post photo, not a profile photo.
  assert.deepEqual(key(pub(`${OWNER}/posts/avatar-1.jpg`)), {
    path: `${OWNER}/posts/avatar-1.jpg`,
    slot: "post",
  });
  for (const file of [`resume-${UUID}.pdf`, "Avatar-1.jpg", "avatar-.jpg", "avatar-1", "avatar-1.toolong", "photo.jpg"]) {
    assert.deepEqual(key(pub(`${OWNER}/${file}`)), { path: `${OWNER}/${file}`, slot: "other" }, file);
  }
  assert.deepEqual(key(`${OWNER}/misc/a.jpg`), { path: `${OWNER}/misc/a.jpg`, slot: "other" });
});

test("a folder named like an Object.prototype member is just 'other'", () => {
  for (const folder of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.deepEqual(key(`${OWNER}/${folder}/a.jpg`), { path: `${OWNER}/${folder}/a.jpg`, slot: "other" });
  }
});

test("another student's file is never ours, by URL or bare path", () => {
  assert.equal(key(pub(`${VICTIM}/avatar-${UUID}.jpg`)), null);
  assert.equal(key(`${VICTIM}/avatar-${UUID}.jpg`), null);
  assert.equal(key(pub(`${VICTIM}/posts/post-1.jpg`)), null);
  // Upper-case copy of the owner's own folder: not the folder Postgres names.
  assert.equal(key(pub(`${OWNER.toUpperCase()}/avatar-1.jpg`)), null);
  // The owner id itself must be a lower-case UUID.
  assert.equal(key(pub(`${OWNER}/avatar-1.jpg`), OWNER.toUpperCase()), null);
  for (const bad of ["", "..", "not-a-uuid", `${OWNER}/..`]) {
    assert.equal(key(`${bad}/avatar-1.jpg`, bad), null, `owner ${JSON.stringify(bad)}`);
  }
});

test("another host, bucket, route or scheme is refused", () => {
  const path = `${OWNER}/avatar-1.jpg`;
  assert.equal(key(pub(path, "https://evil.example")), null);
  assert.equal(key(pub(path, "https://abcd1234.supabase.co.evil.example")), null);
  assert.equal(key(pub(path, "https://other.supabase.co")), null);
  assert.equal(key(pub(path, "http://abcd1234.supabase.co")), null);
  // Exact spelling only: the parser would normalise these to our origin.
  assert.equal(key(pub(path, "https://ABCD1234.supabase.co")), null);
  assert.equal(key(pub(path, "https://abcd1234.supabase.co:443")), null);
  assert.equal(key(pub(path, "https://user@abcd1234.supabase.co")), null);
  assert.equal(key(`${PROJECT}/storage/v1/object/public/resumes/${path}`), null);
  assert.equal(key(`${PROJECT}/storage/v1/object/sign/profiles/${path}`), null);
  assert.equal(key(`${PROJECT}/storage/v1/render/image/public/profiles/${path}`), null);
  assert.equal(key(`${PROJECT}/storage/v1/object/public/quarantine/${path}`), null);
  assert.equal(key(`/storage/v1/object/public/profiles/${path}`), null);
  assert.equal(key(`profiles/${path}`), null);
  assert.equal(key(`//abcd1234.supabase.co/storage/v1/object/public/profiles/${path}`), null);
});

test("queries, hashes, escapes, traversal, whitespace and odd segments are refused", () => {
  const bad = [
    `${OWNER}/avatar-1.jpg?v=1`,
    `${OWNER}/avatar-1.jpg#x`,
    `${OWNER}/avatar-1.jpg?`,
    `${OWNER}/%2e%2e/${VICTIM}/avatar-1.jpg`,
    `${OWNER}/avatar%2D1.jpg`,
    `${OWNER}/../${VICTIM}/avatar-1.jpg`,
    `${OWNER}/posts/../avatar-1.jpg`,
    `${OWNER}/posts/a..b.jpg`,
    `${OWNER}/./avatar-1.jpg`,
    `${OWNER}/.hidden`,
    `${OWNER}//avatar-1.jpg`,
    `${OWNER}/avatar-1.jpg/`,
    `${OWNER}/`,
    `${OWNER}/posts/a/b.jpg`,
    `${OWNER}/posts\\b.jpg`,
    `${OWNER}/avatar 1.jpg`,
    ` ${OWNER}/avatar-1.jpg`,
    `${OWNER}/avatar-1.jpg\n`,
    `${OWNER}/avatar-1.jpg `,
  ];
  for (const path of bad) {
    assert.equal(key(pub(path)), null, `url ${JSON.stringify(path)}`);
    assert.equal(key(path), null, `bare ${JSON.stringify(path)}`);
  }
  assert.equal(key(OWNER), null);
});

test("R2 keys, other URLs, junk and non-strings are refused", () => {
  const junk: unknown[] = [
    null,
    undefined,
    "",
    42,
    {},
    `orgs/${UUID}/logo/${UUID}.png`,
    `groups/${UUID}/${UUID}.jpg`,
    `clips/${OWNER}/a.mp4`,
    "https://example.com/avatar.jpg",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
  ];
  for (const ref of junk) {
    assert.equal(ownProfileImageKey(ref as string, OWNER, PROJECT), null, String(ref));
  }
  assert.equal(key(pub(`${OWNER}/posts/${"a".repeat(2048)}.jpg`)), null);
});

test("the project URL: origin only, http(s) only, bare paths need none", () => {
  const path = `${OWNER}/banner-1.jpg`;
  assert.deepEqual(key(pub(path), OWNER, `${PROJECT}/`), { path, slot: "banner" });
  assert.deepEqual(key(pub(path), OWNER, `${PROJECT}/rest/v1`), { path, slot: "banner" });
  // Local stack: plain http on a port is its own origin.
  const local = "http://127.0.0.1:54321";
  assert.deepEqual(key(pub(path, local), OWNER, local), { path, slot: "banner" });
  assert.equal(key(pub(path, local)), null);
  // A non-http project URL prints its origin as "null": never a match.
  assert.equal(key(`null/storage/v1/object/public/profiles/${path}`, OWNER, "file:///tmp/x"), null);
  for (const url of [null, "", "   ", "not a url"]) {
    assert.equal(key(pub(path), OWNER, url), null, `project ${JSON.stringify(url)}`);
    assert.deepEqual(key(path, OWNER, url), { path, slot: "banner" }, `bare with ${JSON.stringify(url)}`);
  }
});

test("the two-argument call reads NEXT_PUBLIC_SUPABASE_URL at call time", () => {
  const before = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
    const path = `${OWNER}/avatar-1.jpg`;
    assert.deepEqual(ownProfileImageKey(pub(path), OWNER), { path, slot: "avatar" });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://other.supabase.co";
    assert.equal(ownProfileImageKey(pub(path), OWNER), null);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal(ownProfileImageKey(pub(path), OWNER), null);
    assert.deepEqual(ownProfileImageKey(path, OWNER), { path, slot: "avatar" });
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = before;
  }
});
