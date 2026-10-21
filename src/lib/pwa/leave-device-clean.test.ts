/**
 * The club model's per-account browser notes are cleared at sign-out and
 * account deletion with the other copies of your own information (wave-3
 * review, finding 4; Privacy Policy section 7, "Kept in your browser"). Read
 * as text: leave-device-clean.ts imports the push code, which this test does
 * not need to load.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/pwa/leave-device-clean.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const clean = repoFile("src/lib/pwa/leave-device-clean.ts");
const list = /const ACCOUNT_KEYS = \[([\s\S]*?)\] as const;/.exec(clean);
assert.ok(list, "ACCOUNT_KEYS is missing from leave-device-clean.ts");
const accountKeys = [...list[1].replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** The one storage key a file names with `<name> = "<key>"` (or single quotes). */
function keyNamed(path: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']+)\\1`).exec(repoFile(path));
  assert.ok(m, `${name} is missing from ${path}`);
  return m[2];
}

test("the club titles I've seen and the Boards I follow are cleared with my account's other notes", () => {
  const titles = keyNamed("src/components/profile/ClubsSection.tsx", "SEEN_TITLES_KEY");
  const boards = keyNamed("src/components/mobile/messages/home/board-seen.ts", "KEY");
  assert.equal(titles, "vibe.club-titles-seen.v1");
  assert.equal(boards, "vibe.followed-board-seen.v1");
  for (const key of [titles, boards]) assert.ok(accountKeys.includes(key), `${key} stays after sign-out`);
});

test("the club the Profile tab stands for is cleared at sign-out", () => {
  const switched = keyNamed("src/lib/orgs/club-switch.ts", "PROFILE_AS_CLUB_KEY");
  assert.equal(switched, "vibe.profile-as-club.v1");
  assert.ok(accountKeys.includes(switched), `${switched} stays after sign-out`);
  // The clubs I run are cached in page memory only (club-switch.ts), which a
  // sign-out's reload drops: nothing of them is kept in the browser.
  assert.doesNotMatch(repoFile("src/lib/orgs/club-switch.ts"), /sessionStorage\.(get|set)Item/);
});

test("the static profile writes the same titles key, so the same line clears it", () => {
  const html = repoFile("public/html/profile.html");
  const named = [...html.matchAll(/(["'])(vibe\.club-titles-seen\.v\d+)\1/g)].map((m) => m[2]);
  assert.ok(named.length > 0, "profile.html no longer names the titles key");
  for (const key of new Set(named)) assert.ok(accountKeys.includes(key), `${key} (profile.html) stays after sign-out`);
});

test("the policy no longer says these notes outlive sign-out", () => {
  const md = repoFile("handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md");
  const page = repoFile("src/app/legal/privacy/sections-6-8.tsx").replace(/\s+/g, " ");
  for (const text of [md, page]) assert.equal(/club titles you have already seen/.test(text), false);
});
