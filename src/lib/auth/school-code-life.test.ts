/**
 * How long a school-email code works (school-code-life.ts), Nov 28, 2026:
 * a code that lands hours late still verifies, and the words every page and
 * the email say match the number the server uses.
 *
 * Run with:
 *   node --test src/lib/auth/school-code-life.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("school-code-life.test.ts needs Node >= 22.15 (module.registerHooks)");
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
const lifePath = "./school-code-life.ts";
const { SCHOOL_CODE_LIFE_WORDS, SCHOOL_CODE_WINDOW_SEC } = (await import(lifePath)) as typeof import("./school-code-life");
const tokenPath = "./school-email-token.ts";
const token = (await import(tokenPath)) as typeof import("./school-email-token");

const USER = "00000000-0000-4000-8000-000000000001";
const EMAIL = "student@iu.edu";
// The first second of a window, so "sent at" is the worst case: the code is
// guaranteed exactly one window, no more.
const SENT = Math.ceil(1_800_000_000 / SCHOOL_CODE_WINDOW_SEC) * SCHOOL_CODE_WINDOW_SEC + SCHOOL_CODE_WINDOW_SEC - 1;

test("the code lives 6 hours, and the words say so", () => {
  assert.equal(SCHOOL_CODE_WINDOW_SEC, 6 * 60 * 60);
  assert.equal(SCHOOL_CODE_LIFE_WORDS, `${SCHOOL_CODE_WINDOW_SEC / 3600} hours`);
  // The server's own export is the same number, not a second copy.
  assert.equal(token.SCHOOL_CODE_WINDOW_SEC, SCHOOL_CODE_WINDOW_SEC);
});

test("a code sent at the last second of a window still works 31 minutes and 5 h 59 min later", () => {
  const code = token.schoolEmailCode(USER, EMAIL, SENT);
  assert.ok(token.verifySchoolEmailCode(USER, EMAIL, code, SENT));
  // The old 30-minute window would have refused this one (Franky's ~30 min).
  assert.ok(token.verifySchoolEmailCode(USER, EMAIL, code, SENT + 31 * 60));
  assert.ok(token.verifySchoolEmailCode(USER, EMAIL, code, SENT + 5 * 3600 + 59 * 60));
});

test("and stops once two windows have passed", () => {
  const code = token.schoolEmailCode(USER, EMAIL, SENT);
  assert.equal(token.verifySchoolEmailCode(USER, EMAIL, code, SENT + 1 + SCHOOL_CODE_WINDOW_SEC), false);
});

test("a resend never cancels the first email's code", () => {
  const first = token.schoolEmailCode(USER, EMAIL, SENT);
  const resendAt = SENT + 2 * 3600;
  const second = token.schoolEmailCode(USER, EMAIL, resendAt);
  assert.ok(token.verifySchoolEmailCode(USER, EMAIL, first, resendAt));
  assert.ok(token.verifySchoolEmailCode(USER, EMAIL, second, resendAt));
});

test("the code is still bound to the account and the address", () => {
  const code = token.schoolEmailCode(USER, EMAIL, SENT);
  assert.equal(token.verifySchoolEmailCode("00000000-0000-4000-8000-000000000002", EMAIL, code, SENT), false);
  assert.equal(token.verifySchoolEmailCode(USER, "other@iu.edu", code, SENT), false);
});

test("no page or email still promises 30 minutes for the school code", () => {
  for (const file of [
    "app/auth/school-email/page.tsx",
    "app/api/auth/school-email/confirm-code/route.ts",
    "lib/email/resend-transactional.ts",
  ]) {
    const src = readFileSync(new URL(file, SRC_ROOT), "utf8");
    const school = file.endsWith("resend-transactional.ts")
      ? src.slice(src.indexOf("export async function sendSchoolVerificationEmail"), src.indexOf("export async function sendPersonalEmailCodeEmail"))
      : src;
    assert.doesNotMatch(school, /30 minutes/, `${file} still says 30 minutes`);
    assert.match(school, /SCHOOL_CODE_LIFE_WORDS/, `${file} says the life from school-code-life.ts`);
  }
});
