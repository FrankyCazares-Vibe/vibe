/**
 * Tests for `slot-token.ts`: the Photos panel's "what you looked at" token
 * (wave B follow-up P2, stale panel).
 *
 * Run with:
 *   node --test src/app/api/admin/images/_lib/slot-token.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./slot-token.ts";
const { isSlotToken, slotStillMatches, slotToken, STALE_PANEL_MESSAGE } = (await import(
  specifier
)) as typeof import("./slot-token");

const U = "df5ab44e-174f-4c53-a8bc-261c1c67e10b";
const P = `https://abcd.supabase.co/storage/v1/object/public/profiles/${U}/avatar-1.jpg`;
const Q = `https://abcd.supabase.co/storage/v1/object/public/profiles/${U}/avatar-2.jpg`;

test("same value, same token; a new photo changes it", () => {
  const t = slotToken("user", U, "avatar", P);
  assert.equal(isSlotToken(t), true);
  assert.equal(slotStillMatches(t, "user", U, "avatar", P), true);
  assert.equal(slotStillMatches(t, "user", U, "avatar", Q), false, "student set a new photo");
  assert.equal(slotStillMatches(t, "user", U, "avatar", null), false, "photo cleared since");
});

test("a token is bound to its slot and target", () => {
  const t = slotToken("user", U, "avatar", P);
  assert.equal(slotStillMatches(t, "user", U, "banner", P), false);
  assert.equal(slotStillMatches(t, "org", U, "avatar", P), false);
  assert.equal(slotStillMatches(t, "user", "00000000-0000-4000-8000-000000000000", "avatar", P), false);
});

test("an empty slot has a token of its own (null and undefined alike)", () => {
  assert.equal(slotToken("org", U, "logo", null), slotToken("org", U, "logo", undefined));
  assert.notEqual(slotToken("org", U, "logo", null), slotToken("org", U, "logo", ""));
});

test("isSlotToken refuses anything else", () => {
  for (const v of [undefined, null, 1, "", "abc", "G".repeat(32), "a".repeat(31), "a".repeat(33)]) {
    assert.equal(isSlotToken(v), false, String(v));
  }
});

test("the stale answer is a plain sentence", () => {
  assert.equal(STALE_PANEL_MESSAGE, "This photo changed since you opened the panel. Refresh and look again.");
});
