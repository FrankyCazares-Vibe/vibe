/**
 * Tests for `media-ownership.ts`: whose folder a stored media key sits in
 * (S67 security wave, batch b).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/media-ownership.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the same pattern as `edit.test.ts` next to it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./media-ownership.ts";
const {
  hasSafeMediaUrlShape,
  isChannelMediaKey,
  isOrgAssetKey,
  isOwnClipKey,
  ownClipKeysToDelete,
  postMediaKeyKind,
  messageEvidenceKeys,
  purgeableMessageMediaKeys,
} = (await import(specifier)) as typeof import("./media-ownership");

const ME = "df5ab44e-174f-4c53-a8bc-261c1c67e10b";
const THEM = "5ecad222-7b3d-4049-9175-0b6096e38012";
const ORG = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const OTHER_ORG = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CHAN = "7c482e80-c8a4-40fb-bfdc-dc1eda1c7166";
const OTHER_CHAN = "4db9fee4-0213-4219-9811-1a9a5d681325";
const FILE = "c5824e09-a885-4206-bde6-ce3fab9ffd42.mp4";

test("isOwnClipKey accepts the caller's own upload", () => {
  assert.equal(isOwnClipKey(`clips/${ME}/${FILE}`, ME), true);
  assert.equal(isOwnClipKey(`clips/${ME}/poster/${FILE}`, ME), true);
});

test("isOwnClipKey refuses another student's upload", () => {
  assert.equal(isOwnClipKey(`clips/${THEM}/${FILE}`, ME), false);
  // A longer id that merely starts with mine is a different folder.
  assert.equal(isOwnClipKey(`clips/${ME}x/${FILE}`, ME), false);
  assert.equal(isOwnClipKey(`clips/${ME}${FILE}`, ME), false);
});

test("isOwnClipKey refuses traversal and odd shapes", () => {
  for (const key of [
    `clips/${ME}/../${THEM}/${FILE}`,
    `clips/${ME}/..`,
    `clips/${ME}/a..b.mp4`,
    `/clips/${ME}/${FILE}`,
    `clips/${ME}/`,
    `clips/${ME}//${FILE}`,
    `clips/${ME}/${FILE}/`,
    `clips/${ME}/a\\b.mp4`,
    `clips/${ME}/a b.mp4`,
    `clips/${ME}/a%2e%2e.mp4`,
    `clips/${ME}/a\u0000.mp4`,
    `clips/${ME}/a\n.mp4`,
    `Clips/${ME}/${FILE}`,
    `clips/${ME.toUpperCase()}/${FILE}`,
    `https://example.com/clips/${ME}/${FILE}`,
    `clips/${ME}/${"a".repeat(1100)}`,
    "",
  ]) {
    assert.equal(isOwnClipKey(key, ME), false, key);
  }
});

test("isOwnClipKey refuses a missing or malformed owner id", () => {
  assert.equal(isOwnClipKey(`clips//${FILE}`, ""), false);
  assert.equal(isOwnClipKey(`clips/x/${FILE}`, "x"), false);
  assert.equal(isOwnClipKey(`clips/${ME}/${FILE}`, null), false);
  assert.equal(isOwnClipKey(`clips/${ME}/${FILE}`, undefined), false);
  assert.equal(isOwnClipKey(null, ME), false);
  assert.equal(isOwnClipKey(42, ME), false);
  // An id carrying a slash can't widen the folder.
  assert.equal(isOwnClipKey(`clips/${ME}/${FILE}`, `${ME.slice(0, 35)}/`), false);
});

test("isOrgAssetKey is scoped to that club", () => {
  assert.equal(isOrgAssetKey(`orgs/${ORG}/posts/${FILE}`, ORG), true);
  assert.equal(isOrgAssetKey(`orgs/${ORG}/logo/x.png`, ORG), true);
  assert.equal(isOrgAssetKey(`orgs/${OTHER_ORG}/posts/${FILE}`, ORG), false);
  assert.equal(isOrgAssetKey(`orgs/${ORG}/../${OTHER_ORG}/logo/x.png`, ORG), false);
  assert.equal(isOrgAssetKey(`orgs/${ORG}/`, ORG), false);
  assert.equal(isOrgAssetKey(`clips/${ORG}/x.png`, ORG), false);
  assert.equal(isOrgAssetKey(`orgs/${ORG}/x.png`, null), false);
});

test("isChannelMediaKey is one file directly in that chat's folder", () => {
  assert.equal(isChannelMediaKey(`messages/${CHAN}/${FILE}`, CHAN), true);
  assert.equal(isChannelMediaKey(`messages/${OTHER_CHAN}/${FILE}`, CHAN), false);
  assert.equal(isChannelMediaKey(`messages/${CHAN}/sub/${FILE}`, CHAN), false);
  assert.equal(isChannelMediaKey(`messages/${CHAN}/../${OTHER_CHAN}/${FILE}`, CHAN), false);
  assert.equal(isChannelMediaKey(`messages/${CHAN}/`, CHAN), false);
  assert.equal(isChannelMediaKey(`messages/${CHAN}/${FILE}`, ""), false);
});

test("hasSafeMediaUrlShape takes a plain https storage URL only", () => {
  const good = `https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/${ME}/post-${FILE}`;
  assert.equal(hasSafeMediaUrlShape(good), true);
  for (const url of [
    good.replace("https://", "http://"),
    `${good}?download=1`,
    `${good}#x`,
    good.replace("/profiles/", "/profiles/../"),
    good.replace("rqop", "RQOP"),
    "https://rqopjkimxbjkwdkpkbfq.supabase.co:8443/x.png",
    "https://evil.example/x.png\")",
    "https://evil.example/x y.png",
    "javascript:alert(1)",
    "https://host",
    `https://h.co/${"a".repeat(2100)}`,
    null,
  ]) {
    assert.equal(hasSafeMediaUrlShape(url), false, String(url));
  }
});

test("ownClipKeysToDelete keeps only the caller's own clip keys, once each", () => {
  const mine = `clips/${ME}/${FILE}`;
  const poster = `clips/${ME}/poster-${FILE}`;
  assert.deepEqual(ownClipKeysToDelete([mine, poster], ME), [mine, poster]);
  assert.deepEqual(ownClipKeysToDelete([mine, mine], ME), [mine]);
  // The attack: my post row pointing at their video erases nothing.
  assert.deepEqual(ownClipKeysToDelete([`clips/${THEM}/${FILE}`, null], ME), []);
  assert.deepEqual(
    ownClipKeysToDelete([`orgs/${ORG}/posts/${FILE}`, "https://h.co/x.png", undefined], ME),
    [],
  );
});

test("postMediaKeyKind signs the author's clips and the post's own club files only", () => {
  const personal = { user_id: ME, org_id: null };
  const club = { user_id: ME, org_id: ORG };
  assert.equal(postMediaKeyKind(`clips/${ME}/${FILE}`, personal), "clip");
  assert.equal(postMediaKeyKind(`clips/${THEM}/${FILE}`, personal), null);
  // Variant A: a personal post can't serve a (hidden) club's file.
  assert.equal(postMediaKeyKind(`orgs/${ORG}/posts/${FILE}`, personal), null);
  assert.equal(postMediaKeyKind(`orgs/${ORG}/posts/${FILE}`, club), "org");
  assert.equal(postMediaKeyKind(`orgs/${OTHER_ORG}/posts/${FILE}`, club), null);
  assert.equal(postMediaKeyKind(`clips/${ME}/${FILE}`, club), "clip");
  assert.equal(postMediaKeyKind("https://h.co/x.png", club), null);
});

test("purgeableMessageMediaKeys keeps own-chat keys nobody else references", () => {
  const own = `messages/${CHAN}/${FILE}`;
  const otherChat = `messages/${OTHER_CHAN}/${FILE}`;
  const theirs = `messages/${CHAN}/b-${FILE}`;
  const rows = [
    { channel_id: CHAN, media_url: own },
    { channel_id: CHAN, media_url: own },
    // Planted in my DM (CHAN) but naming another chat's file: skipped.
    { channel_id: CHAN, media_url: otherChat },
    // Planted in the same chat, naming another member's photo: shared.
    { channel_id: CHAN, media_url: theirs },
    { channel_id: CHAN, media_url: null },
    { channel_id: CHAN, media_url: "https://legacy.example/x.png" },
  ];
  const out = purgeableMessageMediaKeys(rows, new Set([theirs]));
  assert.deepEqual(out.keys, [own]);
  assert.equal(out.skipped, 2);
  assert.equal(out.shared, 1);
  assert.deepEqual(purgeableMessageMediaKeys([]).keys, []);
});

test("messageEvidenceKeys: the leaving student's reported and removed chat files, own rows only, keys of the right shape only", () => {
  const UID = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const CH = "33333333-3333-4333-8333-333333333333";
  const rows = [
    { user_id: UID, media_url: `messages/${CH}/a.jpg` },
    { user_id: UID, media_url: `messages/${CH}/a.jpg` }, // a report and a removal of the same message
    { user_id: UID, media_url: `messages/${CH}/b.mp4` },
    { user_id: OTHER, media_url: `messages/${CH}/theirs.jpg` }, // someone else's row never counts
    { user_id: UID, media_url: `clips/${UID}/not-a-chat-file.mp4` },
    { user_id: UID, media_url: "messages/not-a-channel/x.jpg" },
    { user_id: UID, media_url: null },
    { user_id: UID, media_url: 42 },
  ];
  assert.deepEqual(messageEvidenceKeys(rows, UID).sort(), [`messages/${CH}/a.jpg`, `messages/${CH}/b.mp4`]);
  assert.deepEqual(messageEvidenceKeys([], UID), []);
  assert.deepEqual(messageEvidenceKeys(rows, OTHER), [`messages/${CH}/theirs.jpg`]);
});

test("the evidence key shape is the same regex as src/lib/r2.ts MESSAGE_MEDIA_KEY_RE (copied, not imported)", async () => {
  const { readFileSync } = await import("node:fs");
  const r2 = readFileSync(new URL("../r2.ts", import.meta.url), "utf8");
  const own = readFileSync(new URL("./media-ownership.ts", import.meta.url), "utf8");
  const pick = (src: string, name: string) => {
    const m = src.match(new RegExp(`${name} = (/.+?/);`));
    assert.ok(m, `${name} not found`);
    return m[1];
  };
  assert.equal(pick(own, "EVIDENCE_MESSAGE_KEY_RE"), pick(r2, "MESSAGE_MEDIA_KEY_RE"));
});
