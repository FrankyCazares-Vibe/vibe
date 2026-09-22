/**
 * Tests for `password-rules.ts`, the 8–72 password length rules (E1b).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/auth/password-rules.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the pattern of `src/lib/posts/edit.test.ts`. tsc (without
 * `allowImportingTsExtensions`) refuses a literal ".ts" specifier, so the
 * specifier goes through a variable and the types come from `typeof import`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./password-rules.ts";
const {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_LONG_BYTES,
  PASSWORD_TOO_SHORT,
  isPasswordTooLongError,
  passwordByteLength,
  passwordLengthProblem,
} = (await import(specifier)) as typeof import("./password-rules");

test("the copy and limits are exact", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(MAX_PASSWORD_BYTES, 72);
  assert.equal(PASSWORD_HINT, "8–72 characters");
  assert.equal(PASSWORD_TOO_SHORT, "Password must be at least 8 characters.");
  assert.equal(PASSWORD_TOO_LONG, "Password must be 72 characters or fewer.");
});

test("short passwords", () => {
  assert.equal(passwordLengthProblem("")?.kind, "short");
  assert.equal(passwordLengthProblem("a".repeat(7))?.kind, "short");
  assert.equal(passwordLengthProblem("a".repeat(7))?.message, PASSWORD_TOO_SHORT);
  assert.equal(passwordLengthProblem("a".repeat(8)), null);
  // Code points, not UTF-16 units: four emoji are 8 units but 4 characters.
  assert.equal(passwordLengthProblem("😀".repeat(4))?.kind, "short");
});

test("the 72 cap in characters", () => {
  assert.equal(passwordLengthProblem("a1".repeat(36)), null);
  const long = passwordLengthProblem("a1".repeat(36) + "x");
  assert.equal(long?.kind, "long");
  assert.equal(long?.message, PASSWORD_TOO_LONG);
});

test("the 72 cap in bytes", () => {
  assert.equal(passwordByteLength("é".repeat(36)), 72);
  assert.equal(passwordLengthProblem("é".repeat(36)), null);
  const accents = passwordLengthProblem("é".repeat(37));
  assert.equal(accents?.kind, "long_bytes");
  assert.equal(accents?.message, PASSWORD_TOO_LONG_BYTES);
  assert.equal(passwordByteLength("😀".repeat(18)), 72);
  assert.equal(passwordLengthProblem("😀".repeat(18)), null);
  assert.equal(passwordLengthProblem("😀".repeat(19))?.kind, "long_bytes");
});

test("nothing trims the password", () => {
  assert.equal(passwordLengthProblem("       a"), null);
  assert.equal(passwordLengthProblem(" ".repeat(73))?.kind, "long");
});

test("isPasswordTooLongError matches GoTrue's refusal only", () => {
  assert.equal(
    isPasswordTooLongError({
      code: "validation_failed",
      message: "Password cannot be longer than 72 characters",
    }),
    true,
  );
  assert.equal(
    isPasswordTooLongError({ code: "weak_password", message: "Password is too weak" }),
    false,
  );
  assert.equal(
    isPasswordTooLongError({
      code: "validation_failed",
      message: "Unable to validate email address: invalid format",
    }),
    false,
  );
  assert.equal(isPasswordTooLongError({ code: "validation_failed", message: null }), false);
  assert.equal(isPasswordTooLongError(null), false);
  assert.equal(isPasswordTooLongError(undefined), false);
});
