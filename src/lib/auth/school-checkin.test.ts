/**
 * The yearly school check-in's one rule and its code
 * (src/lib/auth/school-checkin.ts).
 *
 * Run with:
 *   node --test src/lib/auth/school-checkin.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("school-checkin.test.ts needs Node >= 22.15 (module.registerHooks)");
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
const path = "./school-checkin.ts";
const { CHECKIN_ANSWER_DAYS, CHECKIN_EVERY_DAYS, CHECKIN_GRACE_DAYS, checkinCode, checkinStage, graceEndsAt, verifyCheckinCode } =
  (await import(path)) as typeof import("./school-checkin");
type CheckinRow = import("./school-checkin").CheckinRow;

const NOW = new Date("2028-01-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const row = (over: Partial<CheckinRow> = {}): CheckinRow => ({
  email: "student@iu.edu",
  school_verified: true,
  personal_email: null,
  created_at: daysAgo(30),
  school_confirmed_at: null,
  school_checkin_sent_at: null,
  school_grace_ends_at: null,
  ...over,
});

test("the numbers: a year, 14 days to answer, 90 days of countdown", () => {
  assert.deepEqual([CHECKIN_EVERY_DAYS, CHECKIN_ANSWER_DAYS, CHECKIN_GRACE_DAYS], [365, 14, 90]);
});

test("exempt: a personal sign-in email, a personal email on file, an unverified account", () => {
  assert.equal(checkinStage(row({ email: "me@gmail.com", created_at: daysAgo(900) }), NOW), "exempt");
  assert.equal(checkinStage(row({ personal_email: "me@gmail.com", created_at: daysAgo(900) }), NOW), "exempt");
  assert.equal(checkinStage(row({ school_verified: false, created_at: daysAgo(900) }), NOW), "exempt");
  assert.equal(checkinStage(row({ email: null }), NOW), "exempt");
  // Even at the end of a countdown: the personal email wins.
  assert.equal(checkinStage(row({ personal_email: "me@gmail.com", school_checkin_sent_at: daysAgo(200), school_grace_ends_at: daysAgo(1) }), NOW), "exempt");
});

test("ok, then due: the year counts from the last check-in, or from the day the account was made", () => {
  assert.equal(checkinStage(row({ created_at: daysAgo(364) }), NOW), "ok");
  assert.equal(checkinStage(row({ created_at: daysAgo(365) }), NOW), "due");
  assert.equal(checkinStage(row({ created_at: daysAgo(900), school_confirmed_at: daysAgo(10) }), NOW), "ok");
  assert.equal(checkinStage(row({ created_at: daysAgo(900), school_confirmed_at: daysAgo(366) }), NOW), "due");
});

test("waiting, overdue, grace, expired", () => {
  assert.equal(checkinStage(row({ school_checkin_sent_at: daysAgo(13) }), NOW), "waiting");
  assert.equal(checkinStage(row({ school_checkin_sent_at: daysAgo(14) }), NOW), "overdue");
  assert.equal(checkinStage(row({ school_checkin_sent_at: daysAgo(40), school_grace_ends_at: daysAhead(64) }), NOW), "grace");
  assert.equal(checkinStage(row({ school_checkin_sent_at: daysAgo(104), school_grace_ends_at: daysAgo(0) }), NOW), "expired");
});

test("a date that cannot be read never deletes anyone", () => {
  assert.equal(checkinStage(row({ school_checkin_sent_at: daysAgo(200), school_grace_ends_at: "not a date" }), NOW), "exempt");
  assert.equal(checkinStage(row({ school_checkin_sent_at: "not a date" }), NOW), "exempt");
  assert.equal(checkinStage(row({ created_at: null }), NOW), "exempt");
});

test("graceEndsAt is 90 days out", () => {
  assert.equal(graceEndsAt(NOW), daysAhead(90));
});

test("the code: 8 digits, one per check-in, bound to the account and the address", () => {
  const sent = daysAgo(3);
  const code = checkinCode("user-1", "Student@IU.edu", sent);
  assert.match(code, /^\d{8}$/);
  assert.equal(verifyCheckinCode("user-1", "student@iu.edu", sent, code), true);
  assert.equal(verifyCheckinCode("user-2", "student@iu.edu", sent, code), false);
  assert.equal(verifyCheckinCode("user-1", "other@iu.edu", sent, code), false);
  assert.equal(verifyCheckinCode("user-1", "student@iu.edu", daysAgo(4), code), false, "another check-in's code");
  for (const bad of ["", "1234567", "1234 5678", "abcdefgh"]) assert.equal(verifyCheckinCode("user-1", "student@iu.edu", sent, bad), false, bad);
});
