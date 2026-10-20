/**
 * Tests for `hidden-gate.ts` (S67 security wave 2, the hidden-club 404 Low).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/hidden-gate.test.ts
 *
 * The module has only a type import, so it loads through a dynamic import of
 * its ".ts" path (same pattern as `join-state.test.ts`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./hidden-gate.ts";
const { officerGate } = (await import(specifier)) as typeof import("./hidden-gate");

// The owner and officers (`admin`): clubs have no mods since 20261021100000.
const OFFICERS = ["owner", "admin"] as const;
const OWNER_ADMIN = ["owner", "admin"] as const;
const OWNER_ONLY = ["owner"] as const;

test("a stranger to a hidden club gets 404, never 403", () => {
  assert.equal(officerGate({ hidden: true, role: null, allowed: OFFICERS }), "not_found");
  assert.equal(officerGate({ hidden: true, role: null, allowed: OWNER_ADMIN }), "not_found");
});

test("a stranger to a visible club gets the honest 403", () => {
  assert.equal(officerGate({ hidden: false, role: null, allowed: OFFICERS }), "forbidden");
});

test("a plain member of a hidden club knows it exists, so 403", () => {
  assert.equal(officerGate({ hidden: true, role: "member", allowed: OFFICERS }), "forbidden");
  assert.equal(officerGate({ hidden: false, role: "member", allowed: OFFICERS }), "forbidden");
});

test("an officer on an owner-only list is forbidden, hidden or not", () => {
  assert.equal(officerGate({ hidden: true, role: "admin", allowed: OWNER_ONLY }), "forbidden");
  assert.equal(officerGate({ hidden: false, role: "admin", allowed: OWNER_ONLY }), "forbidden");
  assert.equal(officerGate({ hidden: true, role: "owner", allowed: OWNER_ONLY }), "ok");
});

test("an allowed role passes, hidden or not (each route keeps its own hidden rules)", () => {
  for (const role of OFFICERS) {
    assert.equal(officerGate({ hidden: true, role, allowed: OFFICERS }), "ok", role);
    assert.equal(officerGate({ hidden: false, role, allowed: OFFICERS }), "ok", role);
  }
  assert.equal(officerGate({ hidden: false, role: "admin", allowed: OWNER_ADMIN }), "ok");
});

test("an empty allow-list lets nobody through", () => {
  assert.equal(officerGate({ hidden: false, role: "owner", allowed: [] }), "forbidden");
  assert.equal(officerGate({ hidden: true, role: null, allowed: [] }), "not_found");
});

// ── Cases carried over from the old `src/lib/club-routes/gate.test.ts` when
// its gate folded into `officerGate` (integration I1). The club chat, club
// post and club settings routes now call `officerGate` directly and handle
// the reads around it themselves: a failed club read is a 500 and a missing
// club a 404 BEFORE the gate; the settings routes let the owner by
// `orgs.owner_id` through BEFORE the gate; a failed membership read is passed
// in as `role: null` and then refused as below.

test("a failed membership read (passed as role null) is the stranger's 404 on a hidden club", () => {
  // The routes answer this 404 before they look at the read error, so a
  // flaky roster read never confirms that a hidden club exists.
  assert.equal(officerGate({ hidden: true, role: null, allowed: OWNER_ADMIN }), "not_found");
});

test("on a visible club a failed membership read is never 'ok' (the routes turn it into a 500)", () => {
  // `forbidden` here is what the routes replace with a 500 when the read
  // errored: never a guessed refusal, and never a pass.
  assert.equal(officerGate({ hidden: false, role: null, allowed: OWNER_ADMIN }), "forbidden");
  assert.equal(officerGate({ hidden: false, role: null, allowed: [] }), "forbidden");
});

test("an owner-only route (empty allow-list) gives an admin of a hidden club a 403, not a 404", () => {
  // They are inside the club, so the honest refusal; only strangers get 404.
  assert.equal(officerGate({ hidden: true, role: "admin", allowed: [] }), "forbidden");
  assert.equal(officerGate({ hidden: true, role: "member", allowed: [] }), "forbidden");
});

test("members who aren't owner/admin get 403 on hidden and visible clubs alike", () => {
  for (const hidden of [true, false]) {
    assert.equal(officerGate({ hidden, role: "member", allowed: OWNER_ADMIN }), "forbidden", `member hidden=${hidden}`);
  }
});
