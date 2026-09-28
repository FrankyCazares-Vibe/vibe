/**
 * Tests for the profile-photo replace rules (`profile-photo-replace.ts`).
 *
 * Run with:
 *   node --test src/lib/media/profile-photo-replace.test.ts
 *
 * WHY THE RESOLVE HOOK: profile-photo-replace.ts imports ./profile-image-key
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
  throw new Error("profile-photo-replace.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { ownProfilePhotoPath, newProfilePhotoPaths, staleProfilePhotoPaths } = await import(
  "./profile-photo-replace"
);

const PROJECT = "https://abcd1234.supabase.co";
const ME = "df5ab44e-1111-4222-8333-944445555666";
const OTHER = "0a1b2c3d-1111-4222-8333-944445555666";
const url = (path: string) => `${PROJECT}/storage/v1/object/public/profiles/${path}`;

const A1 = `${ME}/avatar-11111111-2222-4333-8444-555555555555.jpg`;
const A2 = `${ME}/avatar-99999999-2222-4333-8444-555555555555.png`;
const B1 = `${ME}/banner-11111111-2222-4333-8444-555555555555.jpg`;
const B2 = `${ME}/banner-99999999-2222-4333-8444-555555555555.webp`;

test("ownProfilePhotoPath: only my own avatar/cover files", () => {
  assert.equal(ownProfilePhotoPath(url(A1), ME, PROJECT), A1);
  assert.equal(ownProfilePhotoPath(url(B1), ME, PROJECT), B1);
  // Another student's photo, my post photo / work logo / poster: refused.
  assert.equal(ownProfilePhotoPath(url(`${OTHER}/avatar-x.jpg`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/posts/post-x.jpg`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/logos/logo-x.png`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/posters/poster-x.jpg`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/resume-x.pdf`), ME, PROJECT), null);
  // Spellings that aren't the plain public URL.
  assert.equal(ownProfilePhotoPath(`${url(A1)}?v=1`, ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(`${url(A1)}#x`, ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/../${OTHER}/avatar-x.jpg`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(`${ME}/avatar-%2e.jpg`), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(A1).replace("https:", "http:"), ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(url(A1).replace("abcd1234", "ABCD1234"), ME, PROJECT), null);
  assert.equal(
    ownProfilePhotoPath(`https://evil.example/storage/v1/object/public/profiles/${A1}`, ME, PROJECT),
    null,
  );
  assert.equal(ownProfilePhotoPath(null, ME, PROJECT), null);
  assert.equal(ownProfilePhotoPath(42, ME, PROJECT), null);
});

test("newProfilePhotoPaths: files the row didn't name before", () => {
  const before = { avatar_url: url(A1), banner_url: url(B1) };
  assert.deepEqual(newProfilePhotoPaths(before, { avatar_url: url(A1) }, ME, PROJECT), []);
  assert.deepEqual(newProfilePhotoPaths(before, { avatar_url: url(A2) }, ME, PROJECT), [A2]);
  // The cover reused as the photo: already known.
  assert.deepEqual(newProfilePhotoPaths(before, { avatar_url: url(B1) }, ME, PROJECT), []);
  assert.deepEqual(
    newProfilePhotoPaths(before, { avatar_url: url(A2), banner_url: url(B2) }, ME, PROJECT),
    [A2, B2],
  );
  // Clearing is not a new file.
  assert.deepEqual(newProfilePhotoPaths(before, { avatar_url: null }, ME, PROJECT), []);
  // Couldn't read the row: every incoming file is new.
  assert.deepEqual(newProfilePhotoPaths(null, { avatar_url: url(A1) }, ME, PROJECT), [A1]);
});

test("staleProfilePhotoPaths: replaced or removed files, never a live one", () => {
  const before = { avatar_url: url(A1), banner_url: url(B1) };
  // Same values: nothing.
  assert.deepEqual(staleProfilePhotoPaths(before, before, ME, PROJECT), []);
  // Photo replaced.
  assert.deepEqual(
    staleProfilePhotoPaths(before, { avatar_url: url(A2), banner_url: url(B1) }, ME, PROJECT),
    [A1],
  );
  // Both replaced.
  assert.deepEqual(
    staleProfilePhotoPaths(before, { avatar_url: url(A2), banner_url: url(B2) }, ME, PROJECT),
    [A1, B1],
  );
  // Photo removed (column cleared).
  assert.deepEqual(
    staleProfilePhotoPaths(before, { avatar_url: null, banner_url: url(B1) }, ME, PROJECT),
    [A1],
  );
  // The old photo moved to the cover: still named, so NOT stale.
  assert.deepEqual(
    staleProfilePhotoPaths(before, { avatar_url: url(A2), banner_url: url(A1) }, ME, PROJECT),
    [B1],
  );
  // Same file in both columns before, one column changes: still named.
  assert.deepEqual(
    staleProfilePhotoPaths(
      { avatar_url: url(A1), banner_url: url(A1) },
      { avatar_url: url(A2), banner_url: url(A1) },
      ME,
      PROJECT,
    ),
    [],
  );
  // Any spelling of the same file after the save keeps it.
  assert.deepEqual(
    staleProfilePhotoPaths(before, { avatar_url: `${url(A1)}?v=2`, banner_url: url(B1) }, ME, PROJECT),
    [],
  );
});

test("staleProfilePhotoPaths: never retires what isn't provably mine", () => {
  // A pre-B3 value naming another student's photo (0 live) is never retired.
  assert.deepEqual(
    staleProfilePhotoPaths(
      { avatar_url: url(`${OTHER}/avatar-x.jpg`) },
      { avatar_url: url(A2) },
      ME,
      PROJECT,
    ),
    [],
  );
  // My own post photo that sat in the avatar column is never retired as a photo.
  assert.deepEqual(
    staleProfilePhotoPaths(
      { avatar_url: url(`${ME}/posts/post-x.jpg`) },
      { avatar_url: url(A2) },
      ME,
      PROJECT,
    ),
    [],
  );
  // Without the saved row there is no proof: nothing.
  assert.deepEqual(staleProfilePhotoPaths({ avatar_url: url(A1) }, null, ME, PROJECT), []);
  assert.deepEqual(staleProfilePhotoPaths(null, { avatar_url: url(A2) }, ME, PROJECT), []);
});
