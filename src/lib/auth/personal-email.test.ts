/**
 * The personal-email code (src/lib/auth/personal-email.ts): the same scheme
 * as the school code, under its own label.
 *
 * Run with:
 *   node --test src/lib/auth/personal-email.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("personal-email.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

process.env.SCHOOL_EMAIL_VERIFY_SECRET = "test-secret-of-enough-length";
const path = "./personal-email.ts";
const { isSchoolAddress, normalizePersonalEmail, personalEmailCode, verifyPersonalEmailCode, PERSONAL_CODE_WINDOW_SEC } =
  (await import(path)) as typeof import("./personal-email");
const schoolPath = "./school-email-token.ts";
const { schoolEmailCode } = (await import(schoolPath)) as typeof import("./school-email-token");

const NOW = 1_800_000_000;

test("normalizePersonalEmail: trimmed and lowercased, or null", () => {
  assert.equal(normalizePersonalEmail("  Jordan.Lee@Gmail.com "), "jordan.lee@gmail.com");
  for (const bad of ["", "nope", "a@b", "a b@c.com", "a@b@c.com", null, 42, `${"x".repeat(250)}@a.com`]) {
    assert.equal(normalizePersonalEmail(bad), null, String(bad));
  }
});

test("a school address is not a personal one", () => {
  assert.equal(isSchoolAddress("someone@iu.edu"), true);
  assert.equal(isSchoolAddress("someone@gmail.com"), false);
});

test("the code: 8 digits, works in its window and the next, bound to the account and the address", () => {
  const code = personalEmailCode("user-1", "me@gmail.com", NOW);
  assert.match(code, /^\d{8}$/);
  assert.equal(verifyPersonalEmailCode("user-1", "me@gmail.com", code, NOW), true);
  assert.equal(verifyPersonalEmailCode("user-1", "me@gmail.com", code, NOW + PERSONAL_CODE_WINDOW_SEC), true);
  assert.equal(verifyPersonalEmailCode("user-1", "me@gmail.com", code, NOW + 2 * PERSONAL_CODE_WINDOW_SEC), false);
  assert.equal(verifyPersonalEmailCode("user-2", "me@gmail.com", code, NOW), false);
  assert.equal(verifyPersonalEmailCode("user-1", "other@gmail.com", code, NOW), false);
  for (const bad of ["", "1234567", "123456789", "1234 5678", "abcdefgh"]) {
    assert.equal(verifyPersonalEmailCode("user-1", "me@gmail.com", bad, NOW), false, bad);
  }
});

test("a school code is never a personal code for the same account and address", () => {
  assert.notEqual(schoolEmailCode("user-1", "me@gmail.com", NOW), personalEmailCode("user-1", "me@gmail.com", NOW));
});
