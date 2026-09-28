/**
 * Tests for `group-rules.ts` (S67 security wave 2, batch A2).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/messages/group-rules.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./group-rules.ts";
const {
  GROUP_ADD_REFUSED,
  GROUP_CREATE_REFUSED,
  GROUP_FULL,
  MAX_GROUP_MEMBERS,
  groupAddDecision,
  groupSizeAllowed,
} = (await import(specifier)) as typeof import("./group-rules");

test("the cap is 50, the number the create route has always used", () => {
  assert.equal(MAX_GROUP_MEMBERS, 50);
  assert.equal(GROUP_FULL, "This chat is full (50 people).");
});

test("an add: already a member wins, even in a full chat or across a block", () => {
  assert.deepEqual(groupAddDecision({ memberCount: 50, targetIsMember: true, blocked: true }), {
    kind: "already",
  });
  assert.deepEqual(groupAddDecision({ memberCount: 3, targetIsMember: true, blocked: false }), {
    kind: "already",
  });
});

test("an add: a full chat says only that it is full", () => {
  assert.deepEqual(groupAddDecision({ memberCount: 50, targetIsMember: false, blocked: false }), {
    kind: "full",
  });
  assert.deepEqual(groupAddDecision({ memberCount: 51, targetIsMember: false, blocked: true }), {
    kind: "full",
  });
  // A count that can't be trusted fails closed.
  assert.deepEqual(groupAddDecision({ memberCount: Number.NaN, targetIsMember: false, blocked: false }), {
    kind: "full",
  });
});

test("an add: a block with anyone in the chat is refused; otherwise added", () => {
  assert.deepEqual(groupAddDecision({ memberCount: 49, targetIsMember: false, blocked: true }), {
    kind: "refused",
  });
  assert.deepEqual(groupAddDecision({ memberCount: 49, targetIsMember: false, blocked: false }), {
    kind: "add",
  });
  assert.deepEqual(groupAddDecision({ memberCount: 1, targetIsMember: false, blocked: false }), {
    kind: "add",
  });
});

test("a new group holds at most 49 invitees plus its creator", () => {
  assert.equal(groupSizeAllowed(2), true);
  assert.equal(groupSizeAllowed(49), true);
  assert.equal(groupSizeAllowed(50), false);
  assert.equal(groupSizeAllowed(Number.POSITIVE_INFINITY), false);
  assert.equal(groupSizeAllowed(-1), false);
});

test("the refusal copy never names a block, and is plain English", () => {
  for (const line of [GROUP_ADD_REFUSED, GROUP_CREATE_REFUSED, GROUP_FULL]) {
    assert.doesNotMatch(line, /block/i);
    assert.match(line, /^[A-Z].*\.$/);
  }
});

test("both group routes import the one cap (no private copy left behind)", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const create = read("../../app/api/me/threads/route.ts");
  const add = read("../../app/api/me/threads/[id]/members/route.ts");
  for (const src of [create, add]) {
    assert.match(src, /from "@\/lib\/messages\/group-rules"/);
    assert.doesNotMatch(src, /const MAX_GROUP_MEMBERS\s*=/);
  }
});
