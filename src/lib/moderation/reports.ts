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
 * widened by 20260923090000_moderation_foundation.sql; `intimate_image` and
 * `child_safety` added to the reason CHECK by 20260927140000). Adding a value here
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
 * Why they reported it. The first six are the codes the table was created
 * with; production rows hold them, so they are not up for renaming.
 *
 * `intimate_image` (S67 security wave, report #4) is the TAKE IT DOWN Act
 * reason: a nude or sexual picture of someone, shared without their consent.
 * `child_safety` (S67 repair round) is child sexual abuse or exploitation,
 * which /legal/child-safety used to send to "Sexual content". Both sit right
 * after `sexual` so a student looking for "sexual" sees them too, and their
 * reports go to the top of the admin queue (see
 * {@link REPORT_PRIORITY_REASON_CODES}). The CHECK learned both in
 * 20260927140000_reports_intimate_image_reason.sql — ship that migration
 * before this code, or the new choices file nothing.
 */
export const REPORT_REASON_CODES = [
  "spam",
  "harassment",
  "sexual",
  "intimate_image",
  "child_safety",
  "under_18",
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
 * What a report about an EVENT keeps as evidence (`reports.target_snapshot`),
 * read by POST /api/me/reports with the reporter's own client. Here rather
 * than in the route so the test can hold it: two things lean on it.
 *   - `cover_key` (Oct 23, 2026): the cover photo's R2 key. The picture is
 *     often the very thing reported, and the club-deletion sweep
 *     (clubKeysToKeep) keeps every key an open report's snapshot names.
 *   - `org_id`: whose event it was. Once a club is deleted its events go with
 *     it, and that sweep finds the club's open event reports by this field.
 * The key is never shown to a student: reports are service-role only.
 */
export const EVENT_SNAPSHOT_COLUMNS = "id,title,description,creator_id,org_id,starts_at,cover_key";

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
  intimate_image: "An intimate image shared without consent",
  child_safety: "Child sexual abuse or exploitation",
  under_18: "This person is under 18",
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
 * Reasons that jump the admin queue, most urgent first. Everything not listed
 * keeps the queue's normal newest-first order. The published copy
 * (/legal/community, /legal/child-safety, /support) says "reports of child
 * exploitation or self-harm go first", and this list is what makes it true:
 *   - child_safety:   child sexual abuse or exploitation. The most serious
 *                     report on Vibe; the law may require a report to NCMEC.
 *   - self_harm:      someone may be about to hurt themselves.
 *   - intimate_image: has a legal clock on it (the TAKE IT DOWN Act: gone
 *                     within 48 hours of a valid request).
 *   - sexual:         a STAND-IN. The desktop report sheet
 *                     (public/html/_safetyActions.js) and the phone profile
 *                     menu (ProfileMobile.tsx) keep their own reason lists
 *                     without the two new choices, and the published copy
 *                     tells those students to pick "Sexual content" instead.
 *                     Drop it once every picker offers child_safety and
 *                     intimate_image.
 */
export const REPORT_PRIORITY_REASON_CODES: readonly ReportReasonCode[] = [
  "child_safety",
  "self_harm",
  "intimate_image",
  "sexual",
];

const PRIORITY_RANK: ReadonlyMap<string, number> = new Map(
  REPORT_PRIORITY_REASON_CODES.map((code, i) => [code, i]),
);

/** Does a report with this reason go to the top of the queue? */
export function isPriorityReportReason(reasonCode: unknown): boolean {
  return typeof reasonCode === "string" && PRIORITY_RANK.has(reasonCode);
}

/** The admin queue's key for one reported thing: "post:<uuid>". */
export function reportTargetKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * The order the admin queue shows reported things in. Pure, so it is tested.
 *
 * Takes report rows in the order they were read (newest first) and returns
 * each reported thing's key once. A thing with ANY priority report comes
 * first, the most urgent reason first; inside the same rank, and for
 * everything else, the order the rows came in is kept, so the rest of the
 * queue still reads newest first.
 */
export function orderReportTargetKeys(
  rows: ReadonlyArray<{ target_type: string; target_id: string; reason_code: string }>,
): string[] {
  // Every reason not on the priority list shares one rank, after all of them.
  const normal = REPORT_PRIORITY_REASON_CODES.length;
  const firstSeen = new Map<string, number>();
  const rank = new Map<string, number>();
  for (const r of rows) {
    const key = reportTargetKey(r.target_type, r.target_id);
    if (!firstSeen.has(key)) firstSeen.set(key, firstSeen.size);
    const rowRank = PRIORITY_RANK.get(r.reason_code) ?? normal;
    if (rowRank < (rank.get(key) ?? normal)) rank.set(key, rowRank);
  }
  const rankOf = (key: string) => rank.get(key) ?? normal;
  return [...firstSeen.keys()].sort(
    (a, b) => rankOf(a) - rankOf(b) || firstSeen.get(a)! - firstSeen.get(b)!,
  );
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
