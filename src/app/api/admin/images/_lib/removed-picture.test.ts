/**
 * Tests for `removed-picture.ts`: the club / group chat PATCH refusing a
 * picture Vibe's moderators took down (wave B follow-up P2).
 *
 * Run with:
 *   node --test src/app/api/admin/images/_lib/removed-picture.test.ts
 *
 * The module has NO imports; a variable ".ts" specifier keeps node's type
 * stripping and tsc (TS5097) both happy, the media-quarantine.test.ts pattern.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./removed-picture.ts";
const { canonicalPictureRef, firstRemovedPicture, removedPictureRefs, REMOVED_PICTURE_MESSAGE } = (await import(
  specifier
)) as typeof import("./removed-picture");

const ORG = "11111111-2222-4333-8444-555555555555";
const CHAN = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const LOGO = `orgs/${ORG}/logo/0b7f7a52-1d1e-4a6e-9d7e-2b1f0c3a9e11.jpg`;
const BANNER = `orgs/${ORG}/banner/5c1e8f7d-7a44-4f0b-b3a6-3e2d9c1b0a77.jpg`;
const NEW_LOGO = `orgs/${ORG}/logo/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.jpg`;
const GROUP = `groups/${CHAN}/3f2e1d0c-9b8a-4765-8432-10fedcba9876.png`;

function removal(id: string, slots: string[], previous: Record<string, unknown>) {
  return { id, action: "image_remove", meta: { slots, previous, paths: [], swept: [] } };
}
function restore(id: string, removalId: string, slots: string[]) {
  return { id, action: "image_restore", meta: { slots, removal_id: removalId, previous: {} } };
}

test("a removed club logo key is refused; a new upload's key is not", () => {
  const rows = [removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [LOGO]), LOGO);
  assert.equal(firstRemovedPicture(rows, [NEW_LOGO]), null);
});

test("the same picture sent back in the other slot is refused too", () => {
  const rows = [removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [undefined, LOGO]), LOGO, "removed logo sent as the banner");
});

test("a removed logo or banner sent as club post media is refused (media_url or thumbnail)", () => {
  // The club post route passes [media_url, media_thumbnail_url]; either may be "".
  const rows = [removal("r1", ["logo", "banner"], { logo: LOGO, banner: BANNER })];
  assert.equal(firstRemovedPicture(rows, [LOGO, ""]), LOGO, "removed logo as the post photo");
  assert.equal(firstRemovedPicture(rows, ["", BANNER]), BANNER, "removed banner as the thumbnail");
  const post = `orgs/${ORG}/posts/7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a.jpg`;
  assert.equal(firstRemovedPicture(rows, [post, ""]), null, "a new post upload passes");
});

test("a removed group chat photo is refused", () => {
  const rows = [removal("r1", ["photo"], { photo: GROUP })];
  assert.equal(firstRemovedPicture(rows, [GROUP]), GROUP);
});

test("spelling tricks that can reach the same object still match", () => {
  const rows = [removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [`  ${LOGO}  `]) !== null, true, "padding");
  assert.equal(firstRemovedPicture(rows, [LOGO.replace("/logo/", "//logo/")]) !== null, true, "double slash");
  assert.equal(firstRemovedPicture(rows, [LOGO.replace("/logo/", "/./logo/")]) !== null, true, "dot segment");
  const url = "https://abcd.supabase.co/storage/v1/object/public/profiles/x/logo.png";
  const urlRows = [removal("r2", ["banner"], { banner: url })];
  assert.equal(firstRemovedPicture(urlRows, [url.replace("https://abcd", "HTTPS://ABCD")]) !== null, true, "host case");
  assert.equal(firstRemovedPicture(urlRows, [url.replace("/public/", "/public//")]) !== null, true, "url double slash");
});

test("a removal the moderators put back no longer counts, for the slots it put back", () => {
  const rows = [restore("s1", "r1", ["logo"]), removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [LOGO]), null);
  // A put-back scoped to one slot leaves the other slot's picture removed.
  const both = [
    restore("s2", "r2", ["banner"]),
    removal("r2", ["avatar", "banner"], { avatar: LOGO, banner: BANNER }),
  ];
  assert.deepEqual([...removedPictureRefs(both)], [LOGO]);
});

test("a picture removed again after a put-back is refused again", () => {
  const rows = [
    removal("r3", ["logo"], { logo: LOGO }),
    restore("s1", "r1", ["logo"]),
    removal("r1", ["logo"], { logo: LOGO }),
  ];
  assert.equal(firstRemovedPicture(rows, [LOGO]), LOGO);
});

test("a restore naming another removal doesn't clear this one", () => {
  const rows = [restore("s9", "r-other", ["logo"]), removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [LOGO]), LOGO);
});

test("clearing, empty values, junk rows and no rows are never refused", () => {
  const rows = [removal("r1", ["logo"], { logo: LOGO })];
  assert.equal(firstRemovedPicture(rows, [null, "", "   ", undefined, 42]), null);
  assert.equal(firstRemovedPicture([], [LOGO]), null);
  const junk = [
    { id: "j1", action: "image_remove", meta: null },
    { id: "j2", action: "image_remove", meta: { slots: "logo", previous: { logo: LOGO } } },
    { id: "j3", action: "image_remove", meta: { slots: ["logo"], previous: [LOGO] } },
    { id: "j4", action: "post_remove", meta: { slots: ["logo"], previous: { logo: LOGO } } },
    { id: "j5", action: "image_remove", meta: { slots: ["logo"], previous: { banner: LOGO } } },
  ];
  assert.equal(firstRemovedPicture(junk, [LOGO]), null);
});

/* Event covers (Oct 23, 2026): the store joins the club's rows and its events' rows. */
const COVER = `orgs/${ORG}/events/2d3c4b5a-6f7e-4d8c-9b0a-1f2e3d4c5b6a.jpg`;
function eventRemoval(id: string, previous: Record<string, unknown>) {
  return { id, action: "image_remove", meta: { slots: ["cover"], previous, paths: [], swept: [], org_id: ORG } };
}

test("a removed event cover is refused as another event's cover, the logo or club post media", () => {
  const clubRows = [removal("r1", ["logo"], { logo: LOGO })];
  const eventRows = [eventRemoval("e1", { cover: COVER })];
  const rows = [...clubRows, ...eventRows];
  assert.equal(firstRemovedPicture(rows, [COVER]), COVER, "back as an event cover");
  assert.equal(firstRemovedPicture(rows, [undefined, COVER]), COVER, "as the banner");
  assert.equal(firstRemovedPicture(rows, [COVER, ""]), COVER, "as club post media");
  assert.equal(firstRemovedPicture(rows, [LOGO]), LOGO, "the club's own takedowns still count");
  const fresh = `orgs/${ORG}/events/0f1e2d3c-4b5a-4968-8776-655443322110.jpg`;
  assert.equal(firstRemovedPicture(rows, [fresh]), null, "a new cover upload passes");
  assert.notEqual(firstRemovedPicture(rows, [COVER.replace("/events/", "//events/")]), null, "spelling tricks too");
});

test("an event cover the moderators put back is let through, whichever list came first", () => {
  const back = { id: "s1", action: "image_restore", meta: { slots: ["cover"], removal_id: "e1", previous: {}, org_id: ORG } };
  assert.equal(firstRemovedPicture([eventRemoval("e1", { cover: COVER }), back], [COVER]), null);
  assert.equal(firstRemovedPicture([back, eventRemoval("e1", { cover: COVER })], [COVER]), null);
  // Removed again after the put-back: refused again.
  const again = eventRemoval("e2", { cover: COVER });
  assert.equal(firstRemovedPicture([again, back, eventRemoval("e1", { cover: COVER })], [COVER]), COVER);
});

test("canonicalPictureRef", () => {
  assert.equal(canonicalPictureRef(null), null);
  assert.equal(canonicalPictureRef(""), null);
  assert.equal(canonicalPictureRef("//"), null);
  assert.equal(canonicalPictureRef(` ${GROUP}/ `), GROUP);
  assert.equal(canonicalPictureRef("https://A.b/x//./y"), "https://a.b/x/y");
});

test("the refusal is a plain sentence", () => {
  assert.match(REMOVED_PICTURE_MESSAGE, /^[A-Z].*\.$/);
  assert.doesNotMatch(REMOVED_PICTURE_MESSAGE, /block/i);
});
