/**
 * Tests for the report vocabulary (`reports.ts`): the intimate-image reason
 * (S67 security wave, report #4) and the admin queue's priority order.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/moderation/reports.test.ts
 *
 * WHY THE RESOLVE HOOK: this file imports "./reports" extensionless, which
 * is what Next and tsc expect; Node's type stripping adds no extension. Same
 * pattern as text-filter.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("reports.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const {
  REPORT_PRIORITY_REASON_CODES,
  REPORT_REASON_CODES,
  isPriorityReportReason,
  isReportReasonCode,
  orderReportTargetKeys,
  reportReasonLabel,
  reportReasonOptions,
  reportTargetKey,
} = await import("./reports");

// The codes the database's reports_reason_code_check allows after
// 20260927140000_reports_intimate_image_reason.sql. If this list and the
// code list drift, a picker offers a reason the insert refuses.
const CHECK_CODES = [
  "spam",
  "harassment",
  "sexual",
  "intimate_image",
  "child_safety",
  "hate",
  "self_harm",
  "other",
];

test("the reason list matches the database CHECK, one for one", () => {
  assert.deepEqual([...REPORT_REASON_CODES].sort(), [...CHECK_CODES].sort());
});

test("intimate_image is a real reason with its plain-English label", () => {
  assert.equal(isReportReasonCode("intimate_image"), true);
  assert.equal(reportReasonLabel("intimate_image"), "An intimate image shared without consent");
});

test("child_safety is a real reason with its plain-English label", () => {
  assert.equal(isReportReasonCode("child_safety"), true);
  assert.equal(reportReasonLabel("child_safety"), "Child sexual abuse or exploitation");
});

test("the picker offers intimate_image then child_safety right after sexual, and other stays last", () => {
  const codes = reportReasonOptions().map((o) => o.code);
  assert.equal(codes.indexOf("intimate_image"), codes.indexOf("sexual") + 1);
  assert.equal(codes.indexOf("child_safety"), codes.indexOf("sexual") + 2);
  assert.equal(codes[codes.length - 1], "other");
  // Every option has a label, none is the unknown-code fallback by accident.
  for (const o of reportReasonOptions()) {
    assert.ok(o.label.length > 0);
    if (o.code !== "other") assert.notEqual(o.label, "Something else");
  }
});

test("the existing codes keep their labels (production rows hold them)", () => {
  assert.equal(reportReasonLabel("sexual"), "Sexual content");
  assert.equal(reportReasonLabel("spam"), "Spam");
  assert.equal(reportReasonLabel("not_a_code"), "Something else");
});

test("child safety, self-harm, intimate images and (as a stand-in) sexual content jump the queue", () => {
  // The published copy says "reports of child exploitation or self-harm go
  // first"; this is the list that makes it true, most urgent first.
  assert.deepEqual(
    [...REPORT_PRIORITY_REASON_CODES],
    ["child_safety", "self_harm", "intimate_image", "sexual"],
  );
  for (const code of ["child_safety", "self_harm", "intimate_image", "sexual"]) {
    assert.equal(isPriorityReportReason(code), true, code);
  }
  for (const code of ["spam", "harassment", "hate", "other", "not_a_code", ""]) {
    assert.equal(isPriorityReportReason(code), false, code);
  }
  assert.equal(isPriorityReportReason(null), false);
  assert.equal(isPriorityReportReason(42), false);
});

test("every priority reason is a real reason the database accepts", () => {
  for (const code of REPORT_PRIORITY_REASON_CODES) assert.ok(CHECK_CODES.includes(code), code);
});

test("reportTargetKey is type:id", () => {
  assert.equal(reportTargetKey("post", "abc"), "post:abc");
});

const row = (target_type: string, target_id: string, reason_code: string) => ({
  target_type,
  target_id,
  reason_code,
});

test("with no priority report the order is the order the rows came in", () => {
  const keys = orderReportTargetKeys([
    row("post", "a", "spam"),
    row("comment", "b", "hate"),
    row("post", "a", "harassment"),
    row("user", "c", "other"),
  ]);
  assert.deepEqual(keys, ["post:a", "comment:b", "user:c"]);
});

test("a thing with an intimate-image report goes first, even when its report is oldest", () => {
  const keys = orderReportTargetKeys([
    row("post", "a", "spam"),
    row("comment", "b", "hate"),
    row("message", "m", "intimate_image"),
  ]);
  assert.deepEqual(keys, ["message:m", "post:a", "comment:b"]);
});

test("one priority report among several lifts the whole thing", () => {
  const keys = orderReportTargetKeys([
    row("post", "a", "spam"),
    row("post", "z", "spam"),
    row("post", "z", "intimate_image"),
  ]);
  assert.deepEqual(keys, ["post:z", "post:a"]);
});

test("two priority things keep their newest-first order between them", () => {
  const keys = orderReportTargetKeys([
    row("post", "a", "spam"),
    row("post", "x", "intimate_image"),
    row("post", "b", "spam"),
    row("message", "y", "intimate_image"),
  ]);
  assert.deepEqual(keys, ["post:x", "message:y", "post:a", "post:b"]);
});

test("the same id under two types is two things", () => {
  const keys = orderReportTargetKeys([
    row("post", "same", "spam"),
    row("comment", "same", "intimate_image"),
  ]);
  assert.deepEqual(keys, ["comment:same", "post:same"]);
});

test("an empty page is an empty list", () => {
  assert.deepEqual(orderReportTargetKeys([]), []);
});

test("between priority things, the more urgent reason goes first, whatever the age", () => {
  // Rows arrive newest first: the sexual-content report is the newest, the
  // child-safety report the oldest.
  const keys = orderReportTargetKeys([
    row("post", "s", "sexual"),
    row("post", "n", "spam"),
    row("message", "i", "intimate_image"),
    row("post", "h", "self_harm"),
    row("user", "c", "child_safety"),
  ]);
  assert.deepEqual(keys, ["user:c", "post:h", "message:i", "post:s", "post:n"]);
});

test("a thing reported for sexual content AND child safety ranks as child safety", () => {
  const keys = orderReportTargetKeys([
    row("post", "a", "self_harm"),
    row("post", "b", "sexual"),
    row("post", "b", "child_safety"),
  ]);
  assert.deepEqual(keys, ["post:b", "post:a"]);
});
