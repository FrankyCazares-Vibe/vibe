/**
 * Tests for `room-names.ts` (handoffs/chat-redesign/wave-3-desktop/contract.md
 * 4c.3, section 9): `roomDisplayName`, `roomSlug`.
 *
 * Run with:
 *   node --test src/lib/chat/room-names.test.ts
 *
 * The module imports nothing, so no resolve hook is needed (the
 * `week.test.ts` pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./room-names.ts";
const names = (await import(specifier)) as typeof import("./room-names");
const { roomDisplayName, roomSlug } = names;

/** The rule the two room routes hold a name to (`channels/route.ts`, `channels/[channelId]/route.ts`). */
const ROUTE_RULE = /^[a-z0-9][a-z0-9_-]{1,30}$/;

test("roomDisplayName: the contract's three examples", () => {
  assert.equal(roomDisplayName("exec-only"), "Exec only");
  assert.equal(roomDisplayName("Alumni"), "Alumni");
  assert.equal(roomDisplayName(""), "");
});

test("roomDisplayName: '-' and '_' both become a space, and a run of them is one space", () => {
  assert.equal(roomDisplayName("rush_chairs"), "Rush chairs");
  assert.equal(roomDisplayName("study-group-2026"), "Study group 2026");
  assert.equal(roomDisplayName("a--b__c-_d"), "A b c d");
});

test("roomDisplayName: only the first letter changes; the rest is left as written", () => {
  assert.equal(roomDisplayName("officers"), "Officers");
  assert.equal(roomDisplayName("iU-alumni"), "IU alumni");
  assert.equal(roomDisplayName("2026-rush"), "2026 rush", "a digit first: nothing to upper-case");
});

test("roomDisplayName: a dash at either end leaves no space behind", () => {
  assert.equal(roomDisplayName("exec-"), "Exec");
  assert.equal(roomDisplayName("ab_"), "Ab");
  assert.equal(roomDisplayName("-exec"), "Exec");
  assert.equal(roomDisplayName("---"), "");
});

test("roomDisplayName: applied twice equals applied once", () => {
  const samples = ["exec-only", "Alumni", "", "rush_chairs", "a--b__c", "exec-", "-exec", "Exec only", "2026-rush", "  spaced  ", "---", "ünï-code"];
  for (const sample of samples) {
    const once = roomDisplayName(sample);
    assert.equal(roomDisplayName(once), once, JSON.stringify(sample));
  }
});

test("roomSlug: words become a slug the routes accept", () => {
  assert.equal(roomSlug("Exec only"), "exec-only");
  assert.equal(roomSlug("  Rush Chairs!  "), "rush-chairs");
  assert.equal(roomSlug("Study   group / 2026"), "study-group-2026", "a run of anything else is ONE dash");
  assert.equal(roomSlug("exec-only"), "exec-only", "a slug is its own slug");
  assert.equal(roomSlug("rush_chairs"), "rush_chairs", "an underscore is kept");
  assert.equal(roomSlug("Café"), "caf", "a letter outside a-z is not kept");
});

test("roomSlug: null when no accepted slug can be made", () => {
  assert.equal(roomSlug(""), null);
  assert.equal(roomSlug("   "), null);
  assert.equal(roomSlug("a"), null, "two characters at least");
  assert.equal(roomSlug("!!!"), null);
  assert.equal(roomSlug("?a?"), null, "one character left after the dashes are dropped");
  assert.equal(roomSlug("_exec"), null, "the first character must be a letter or a digit");
});

test("roomSlug: cut to 31 characters, and everything it answers passes the routes' rule", () => {
  assert.equal(roomSlug("x".repeat(40)), "x".repeat(31));
  assert.equal(roomSlug("ab"), "ab", "the shortest name");
  const inputs = ["Exec only", "Rush Chairs!", "x".repeat(40), "a".repeat(30) + " b c", "ab", "A_B-c", "Board of Directors (2026)"];
  for (const input of inputs) {
    const slug = roomSlug(input);
    assert.ok(slug !== null && ROUTE_RULE.test(slug), `${JSON.stringify(input)} -> ${String(slug)}`);
    assert.ok(slug.length <= 31);
  }
});

test("a slug round trip: words -> slug -> words -> the same slug", () => {
  for (const typed of ["Exec only", "Rush chairs", "Study group 2026", "Alumni"]) {
    const slug = roomSlug(typed);
    assert.ok(slug);
    assert.equal(roomDisplayName(slug), typed, "what the chip shows is what the officer typed");
    assert.equal(roomSlug(roomDisplayName(slug)), slug, "and saving that name again stores the same slug");
  }
});
