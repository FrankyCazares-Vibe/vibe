/**
 * Tests for the waitlist's shared helpers in `types.ts`: status derivation,
 * the gate refusal parser and the dev-only sign-up override.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/status.test.ts
 *
 * types.ts has one import and it is type-only (erased), so it loads through
 * a dynamic import of its ".ts" path, the pattern of password-rules.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./types.ts";
const {
  GATE_REFUSALS,
  SIGNUP_PATH,
  WAITLIST_CONFIRM_PATH,
  WAITLIST_PATH,
  deriveWaitlistStatus,
  parseGateRefusal,
  parseSignupOverride,
} = (await import(specifier)) as typeof import("./types");

const NOW = new Date("2026-10-03T12:00:00Z");
const BASE = { confirmed_at: null, code_hash: null, code_expires_at: null, redeemed_at: null };
const HASH = "a".repeat(64);

test("paths", () => {
  assert.equal(WAITLIST_PATH, "/waitlist");
  assert.equal(WAITLIST_CONFIRM_PATH, "/waitlist/confirm");
  assert.equal(SIGNUP_PATH, "/auth/signup");
});

test("deriveWaitlistStatus: each state", () => {
  assert.equal(deriveWaitlistStatus(BASE, NOW), "unconfirmed");
  assert.equal(deriveWaitlistStatus({ ...BASE, confirmed_at: "2026-10-01T00:00:00Z" }, NOW), "waiting");
  const coded = { ...BASE, confirmed_at: "2026-10-01T00:00:00Z", code_hash: HASH };
  assert.equal(deriveWaitlistStatus({ ...coded, code_expires_at: "2026-10-17T00:00:00Z" }, NOW), "invited");
  assert.equal(deriveWaitlistStatus({ ...coded, code_expires_at: "2026-10-02T00:00:00Z" }, NOW), "expired");
  assert.equal(deriveWaitlistStatus({ ...coded, code_expires_at: NOW.toISOString() }, NOW), "expired");
  assert.equal(
    deriveWaitlistStatus({ ...coded, code_expires_at: "2026-10-02T00:00:00Z", redeemed_at: "2026-10-01T09:00:00Z" }, NOW),
    "joined",
  );
});

test("deriveWaitlistStatus: an officer added by hand is invited before confirming; has_code works too", () => {
  assert.equal(
    deriveWaitlistStatus({ ...BASE, has_code: true, code_expires_at: "2026-10-17T00:00:00Z" }, NOW),
    "invited",
  );
  assert.equal(deriveWaitlistStatus({ ...BASE, has_code: false, confirmed_at: "2026-10-01T00:00:00Z" }, NOW), "waiting");
  // A code with no expiry is treated as expired, never as open forever.
  assert.equal(deriveWaitlistStatus({ ...BASE, code_hash: HASH }, NOW), "expired");
});

test("parseGateRefusal: the fourteen reasons (seven access code, seven club link), only on a 403 with the tag", () => {
  assert.equal(GATE_REFUSALS.length, 14);
  for (const reason of GATE_REFUSALS) {
    assert.equal(parseGateRefusal({ status: 403, message: `[vibe:${reason}] Some sentence.` }), reason);
  }
  assert.equal(parseGateRefusal({ status: 500, message: "[vibe:access_code_used] x" }), null);
  assert.equal(parseGateRefusal({ status: 403, message: "[vibe:something_else] x" }), null);
  assert.equal(parseGateRefusal({ status: 403, message: "Signups not allowed for this instance" }), null);
  assert.equal(parseGateRefusal({ status: 403, message: "x [vibe:access_code_used]" }), null);
  assert.equal(parseGateRefusal({ status: 403 }), null);
  assert.equal(parseGateRefusal(null), null);
  assert.equal(parseGateRefusal(undefined), null);
});

test("parseSignupOverride: open / closed outside production only", () => {
  assert.equal(parseSignupOverride("open", "development"), true);
  assert.equal(parseSignupOverride("closed", "development"), false);
  assert.equal(parseSignupOverride("closed", undefined), false);
  assert.equal(parseSignupOverride("CLOSED", "development"), null);
  assert.equal(parseSignupOverride("", "development"), null);
  assert.equal(parseSignupOverride(null, "development"), null);
  assert.equal(parseSignupOverride("open", "production"), null);
  assert.equal(parseSignupOverride("closed", "production"), null);
});
