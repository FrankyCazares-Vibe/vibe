/**
 * Tests for the waitlist manage token (`tokens.ts`): minting, hashing, the
 * token routes' input check and the state the confirm page may show.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/tokens.test.ts
 *
 * tokens.ts imports only `node:crypto` and a type (erased), so it loads
 * through a dynamic import of its ".ts" path, like status.test.ts.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const specifier = "./tokens.ts";
const {
  CONFIRM_WINDOW_DAYS,
  MANAGE_TOKEN_BYTES,
  confirmWindowOpen,
  hashManageToken,
  isManageToken,
  mintManageToken,
  parseTokenRequest,
  waitlistPublicState,
} = (await import(specifier)) as typeof import("./tokens");

const NOW = new Date("2026-10-03T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const ROW = { confirmed_at: null, confirm_sent_at: null, code_hash: null, code_expires_at: null, redeemed_at: null };
const HEX64 = /^[0-9a-f]{64}$/;

test("a minted token is 43 base64url characters and its hash is SHA-256 hex", () => {
  assert.equal(MANAGE_TOKEN_BYTES, 32);
  const { token, hash } = mintManageToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hash, HEX64);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(hashManageToken(token), hash);
  assert.ok(isManageToken(token));
});

test("minting is deterministic with an injected source, and fresh by default", () => {
  const fixed = (n: number) => new Uint8Array(n).fill(0xff);
  const a = mintManageToken(fixed);
  assert.equal(a.token, "_".repeat(42) + "8");
  assert.deepEqual(mintManageToken(fixed), a);
  assert.notEqual(mintManageToken().token, mintManageToken().token);
  assert.throws(() => mintManageToken((n) => new Uint8Array(n - 1)), /too few bytes/);
});

test("hashManageToken refuses anything not shaped like a token", () => {
  for (const bad of ["", "abc", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "=", "a".repeat(42) + "+", null, 42]) {
    assert.equal(hashManageToken(bad), null, String(bad));
    assert.equal(isManageToken(bad), false);
  }
});

test("parseTokenRequest: 400 shapes, unknown shapes, and good tokens", () => {
  for (const bad of [null, undefined, "x", 3, [], {}, { token: 5 }, { token: null }, { t: "x" }]) {
    assert.deepEqual(parseTokenRequest(bad), { ok: false });
  }
  assert.deepEqual(parseTokenRequest({ token: "nope" }), { ok: true, hash: null });
  const { token, hash } = mintManageToken();
  assert.deepEqual(parseTokenRequest({ token }), { ok: true, hash });
  // A pasted link often carries a trailing space or newline.
  assert.deepEqual(parseTokenRequest({ token: ` ${token}\n` }), { ok: true, hash });
});

test("the confirm window is 7 days from the newest confirm email", () => {
  assert.equal(CONFIRM_WINDOW_DAYS, 7);
  assert.equal(confirmWindowOpen({ ...ROW, confirm_sent_at: ago(6 * DAY) }, NOW), true);
  assert.equal(confirmWindowOpen({ ...ROW, confirm_sent_at: ago(7 * DAY) }, NOW), false);
  assert.equal(confirmWindowOpen({ ...ROW, confirm_sent_at: null }, NOW), false);
  assert.equal(confirmWindowOpen({ ...ROW, confirm_sent_at: "garbage" }, NOW), false);
  assert.equal(
    confirmWindowOpen({ ...ROW, confirm_sent_at: ago(DAY), confirmed_at: ago(1000) }, NOW),
    false,
  );
});

test("waitlistPublicState covers every state", () => {
  const hash = "a".repeat(64);
  assert.equal(waitlistPublicState(null, NOW), "unknown");
  assert.equal(waitlistPublicState({ ...ROW, confirm_sent_at: ago(DAY) }, NOW), "unconfirmed");
  assert.equal(waitlistPublicState({ ...ROW, confirm_sent_at: ago(8 * DAY) }, NOW), "confirm_expired");
  assert.equal(waitlistPublicState({ ...ROW }, NOW), "confirm_expired");
  assert.equal(waitlistPublicState({ ...ROW, confirmed_at: ago(DAY) }, NOW), "waiting");
  const coded = { ...ROW, confirmed_at: ago(DAY), code_hash: hash };
  assert.equal(waitlistPublicState({ ...coded, code_expires_at: ahead(DAY) }, NOW), "invited");
  assert.equal(waitlistPublicState({ ...coded, code_expires_at: ago(1) }, NOW), "invite_expired");
  assert.equal(waitlistPublicState({ ...coded, code_expires_at: null }, NOW), "invite_expired");
  // A founder's code on an unconfirmed row still reads as invited.
  assert.equal(waitlistPublicState({ ...ROW, code_hash: hash, code_expires_at: ahead(DAY) }, NOW), "invited");
  assert.equal(
    waitlistPublicState({ ...coded, code_expires_at: ago(DAY), redeemed_at: ago(2 * DAY) }, NOW),
    "joined",
  );
});
