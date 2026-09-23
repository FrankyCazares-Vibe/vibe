/**
 * The moderation vocabulary, in one place: the report codes (plan §Reports),
 * and at the bottom the restriction reason codes and the sentence each one
 * shows the student on /account/suspended.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT. Every report is a target type, a reason
 * code and, for a human, a plain-English name for each. Those four lists are
 * the only thing the report route, the admin queue, the admin alert email and
 * the reason pickers all have to agree about, and today they each carry their
 * own copy — the alert's labels, the route's allow-lists, the pickers' arrays.
 * One drift ("sexual_content" in a picker, "sexual" in the CHECK) files a
 * report nobody can see. So the lists are here and the reading and writing is
 * not: POST /api/me/reports owns filing a report, GET /api/admin/reports owns
 * the queue, and neither is worth a second implementation behind a helper.
 *
 * PURE ON PURPOSE — no `server-only`, no `@/` import. The reason picker is a
 * client component and the alert builder is a server module; both import from
 * here, and a `server-only` marker would shut the pickers out and push them
 * straight back to private copies.
 *
 * THE CODES ARE THE DATABASE'S. `reports.target_type` and `reports.reason_code`
 * are CHECK-constrained columns (20260506100000_safety_block_mute_report.sql,
 * widened by 20260923090000_moderation_foundation.sql). Adding a value here
 * without adding it there files nothing; the insert is simply refused.
 */

/** Everything a student can report. Matches the widened `target_type` CHECK. */
export const REPORT_TARGET_TYPES = [
  "post",
  "comment",
  "message",
  "user",
  "channel",
  "org",
  "event",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * Why they reported it. Unchanged since the table was created — these are the
 * codes production rows already hold, so they are not up for renaming.
 */
export const REPORT_REASON_CODES = [
  "spam",
  "harassment",
  "sexual",
  "hate",
  "self_harm",
  "other",
] as const;

export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

/** Where a report sits in the queue. `open` is the default the table writes. */
export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

const TARGET_SET: ReadonlySet<string> = new Set(REPORT_TARGET_TYPES);
const REASON_SET: ReadonlySet<string> = new Set(REPORT_REASON_CODES);
const STATUS_SET: ReadonlySet<string> = new Set(REPORT_STATUSES);

/** Narrowing guards, so a route validates a body against the same list. */
export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === "string" && TARGET_SET.has(value);
}

export function isReportReasonCode(value: unknown): value is ReportReasonCode {
  return typeof value === "string" && REASON_SET.has(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

/**
 * "a post", "a club" — written to drop into a sentence ("Someone reported a
 * post on Vibe"), which is why each one carries its article.
 */
const TARGET_LABELS: Readonly<Record<ReportTargetType, string>> = {
  post: "a post",
  comment: "a comment",
  message: "a message",
  user: "a person",
  channel: "a chat",
  org: "a club",
  event: "an event",
};

/**
 * The reason picker's words, and the admin queue's. Plain, and never an
 * accusation: these name what was reported, not what was proven.
 */
const REASON_LABELS: Readonly<Record<ReportReasonCode, string>> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  sexual: "Sexual content",
  hate: "Hate or a slur",
  self_harm: "Self-harm",
  other: "Something else",
};

/**
 * A target type in words. An unknown code — a row written by a newer client
 * against an older deploy — reads as "something" rather than leaking a column
 * value into a sentence a person has to read.
 */
export function reportTargetLabel(targetType: string): string {
  return isReportTargetType(targetType) ? TARGET_LABELS[targetType] : "something";
}

/** A reason in words, with the same fallback for a code we don't know. */
export function reportReasonLabel(reasonCode: string): string {
  return isReportReasonCode(reasonCode) ? REASON_LABELS[reasonCode] : "Something else";
}

/**
 * The picker, in display order: `other` last because it is the escape hatch,
 * and the rest in the order a student is most likely to want them.
 */
export function reportReasonOptions(): Array<{ code: ReportReasonCode; label: string }> {
  return REPORT_REASON_CODES.map((code) => ({ code, label: REASON_LABELS[code] }));
}

/**
 * Why an account was restricted — a DIFFERENT vocabulary from the report
 * reasons above, and it lives here for the same reason they do.
 *
 * `account_restrictions.reason_code` has no CHECK: the column takes any token,
 * and POST /api/admin/users/[id]/restrict only checks its shape. What the
 * student is actually shown is the sentence below, on /account/suspended. So a
 * code that isn't in this list is not refused anywhere — it just quietly costs
 * that student the plain reason Franky's decision 1 promises them, and leaves
 * them reading the fallback. The restrict picker must offer THESE codes.
 *
 * Written to the student, so each one is a whole sentence, says what happened
 * and not what they are, and carries no accusation beyond the finding itself.
 */
export const RESTRICTION_REASON_CODES = [
  "spam",
  "harassment",
  "sexual",
  "hate",
  "self_harm",
  "impersonation",
  "ban_evasion",
] as const;

export type RestrictionReasonCode = (typeof RESTRICTION_REASON_CODES)[number];

const RESTRICTION_REASON_SET: ReadonlySet<string> = new Set(RESTRICTION_REASON_CODES);

const RESTRICTION_REASON_LINES: Readonly<Record<RestrictionReasonCode, string>> = {
  spam: "Spam, or pretending to be a lot of people.",
  harassment: "Harassing or bullying someone.",
  sexual: "Sexual content.",
  hate: "Hate speech.",
  self_harm: "Content about hurting yourself or someone else.",
  impersonation: "Pretending to be someone else.",
  ban_evasion: "Coming back after a ban.",
};

/** Says nothing specific, but never says nothing: the student still gets a sentence. */
export const RESTRICTION_REASON_FALLBACK = "Something on your account broke the Vibe rules.";

export function isRestrictionReasonCode(value: unknown): value is RestrictionReasonCode {
  return typeof value === "string" && RESTRICTION_REASON_SET.has(value);
}

/** The line /account/suspended shows. An unknown code reads as the fallback. */
export function restrictionReasonLine(reasonCode: string | null | undefined): string {
  return isRestrictionReasonCode(reasonCode)
    ? RESTRICTION_REASON_LINES[reasonCode]
    : RESTRICTION_REASON_FALLBACK;
}

/** The restrict picker, in the order a moderator is most likely to want them. */
export function restrictionReasonOptions(): Array<{
  code: RestrictionReasonCode;
  line: string;
}> {
  return RESTRICTION_REASON_CODES.map((code) => ({
    code,
    line: RESTRICTION_REASON_LINES[code],
  }));
}
