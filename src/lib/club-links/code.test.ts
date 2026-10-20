/**
 * Tests for the club link codes (`code.ts`). The module has no imports, so it
 * loads through a dynamic import of its ".ts" path (tsc refuses a literal
 * ".ts" specifier; the pattern of the waitlist's access-code.test.ts).
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

const specifier = "./code.ts";
const {
  CLUB_LINK_ALPHABET,
  clubLinkUrl,
  generateClubLinkCode,
  normalizeClubLinkCode,
  suggestClubHandle,
} = (await import(specifier)) as typeof import("./code");

// The shared vectors: the same cases as the POST-CHECK of
// supabase/migrations/20261021110000_club_links.sql.
test("normalise: hyphens, spaces and case", () => {
  assert.equal(normalizeClubLinkCode("k7q2-m9xd-ab3c-dE4f"), "K7Q2M9XDAB3CDE4F");
});

test("normalise: O reads as 0, I and L as 1", () => {
  assert.equal(normalizeClubLinkCode("OIL0 1234 5678 9ABC"), "0110123456789ABC");
});

test("normalise: the wrong length, a U, or not a string is not a code", () => {
  assert.equal(normalizeClubLinkCode("K7Q2M9XDAB3CDE4"), null);
  assert.equal(normalizeClubLinkCode("K7Q2M9XDAB3CDE4FU"), null);
  assert.equal(normalizeClubLinkCode("K7Q2M9XDAB3CDE4U"), null);
  assert.equal(normalizeClubLinkCode(42), null);
  assert.equal(normalizeClubLinkCode("K".repeat(65)), null);
});

test("generate: 16 alphabet characters that read back as themselves", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateClubLinkCode();
    assert.equal(code.length, 16);
    for (const ch of code) assert.ok(CLUB_LINK_ALPHABET.includes(ch));
    assert.equal(normalizeClubLinkCode(code), code);
  }
});

test("generate: every byte keeps its low five bits", () => {
  const code = generateClubLinkCode(() => new Uint8Array(16).fill(255));
  assert.equal(code, "Z".repeat(16));
  assert.throws(() => generateClubLinkCode(() => new Uint8Array(3)));
});

test("url: no double slash", () => {
  assert.equal(clubLinkUrl("https://connectvibe.app/", "K7Q2M9XDAB3CDE4F"), "https://connectvibe.app/c/K7Q2M9XDAB3CDE4F");
});

test("handle: from a club's name", () => {
  assert.equal(suggestClubHandle("Sixty-Four Chess"), "sixtyfourchess");
  assert.equal(suggestClubHandle("Café & Code"), "cafeandcode");
  assert.equal(suggestClubHandle("!!"), null);
  assert.equal(suggestClubHandle("a".repeat(40))?.length, 31);
});

test("hash: SHA-256 of club: and the normalised code, as public.club_link_hash gives it", () => {
  // Read from the local database (public.club_link_hash('k7q2-m9xd-ab3c-de4f'),
  // Oct 21, 2026); store.ts hashClubLinkCode computes it this way.
  const normalized = normalizeClubLinkCode("k7q2-m9xd-ab3c-de4f");
  const hash = createHash("sha256").update(`club:${normalized}`, "utf8").digest("hex");
  assert.equal(hash, "e7525067feca7b295946cc63f346233a1193dcede6699c9b9510c1056cd37992");
});
