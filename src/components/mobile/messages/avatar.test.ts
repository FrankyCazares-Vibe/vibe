/**
 * Tests for `avatar.ts` (handoffs/chat-redesign/wave-2-contracts.md 1.4).
 *
 * Run with:
 *   node --test src/components/mobile/messages/avatar.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./avatar.ts";
const { CLUB_GRADIENTS, PERSON_COLORS, clubGradient, personColor } = (await import(specifier)) as typeof import("./avatar");

const IDS = [
  "2f1c9a4e-6b7d-4c8e-9f0a-1b2c3d4e5f60",
  "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "salsa-club",
  "",
];

test("the sets are the mockups' values, in their order", () => {
  assert.deepEqual(CLUB_GRADIENTS, [
    "linear-gradient(145deg, #C23A72, #962858)",
    "linear-gradient(145deg, #1F7580, #155158)",
    "linear-gradient(145deg, #337A5A, #245942)",
    "linear-gradient(145deg, #8A6A22, #664C14)",
  ]);
  assert.deepEqual(PERSON_COLORS, [
    { bg: "#2E4A5A", ink: "#CFE6F2" },
    { bg: "#4A3A5E", ink: "#E6D8F5" },
    { bg: "#5E4A2A", ink: "#F5E1B8" },
    { bg: "#5A3A2E", ink: "#FFD3C2" },
    { bg: "#2A4550", ink: "#CFE6F2" },
    { bg: "#2F4A3A", ink: "#CDEBD9" },
  ]);
});

test("clubGradient: stable per id, always a member of the set, never throws", () => {
  for (const id of IDS) {
    const first = clubGradient(id);
    assert.equal(clubGradient(id), first);
    assert.ok(CLUB_GRADIENTS.includes(first), `${JSON.stringify(id)} → ${first}`);
  }
});

test("personColor: stable per id, always a member of the set, never throws", () => {
  for (const id of IDS) {
    const first = personColor(id);
    assert.deepEqual(personColor(id), first);
    assert.ok(PERSON_COLORS.includes(first), `${JSON.stringify(id)} → ${JSON.stringify(first)}`);
  }
});

test("the hash spreads uuid-shaped ids over every bucket", () => {
  const ids: string[] = [];
  for (let i = 0; i < 400; i++) {
    const hex = i.toString(16).padStart(12, "0");
    ids.push(`a1b2c3d4-e5f6-4a7b-8c9d-${hex}`);
  }
  const clubs = new Set(ids.map(clubGradient));
  const people = new Set(ids.map(personColor));
  assert.equal(clubs.size, CLUB_GRADIENTS.length);
  assert.equal(people.size, PERSON_COLORS.length);
  // No bucket starves: at least a tenth of its fair share.
  const clubCount = new Map<string, number>();
  for (const id of ids) clubCount.set(clubGradient(id), (clubCount.get(clubGradient(id)) ?? 0) + 1);
  for (const n of clubCount.values()) assert.ok(n >= ids.length / CLUB_GRADIENTS.length / 10);
});

test("two ids that differ in one character can land on different buckets", () => {
  const a = "2f1c9a4e-6b7d-4c8e-9f0a-1b2c3d4e5f60";
  const seen = new Set<string>();
  for (const last of "0123456789abcdef") seen.add(clubGradient(a.slice(0, -1) + last));
  assert.ok(seen.size > 1);
});
