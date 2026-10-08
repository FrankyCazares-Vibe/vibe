import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { isSchoolEmail } from "@/lib/auth/school-email-domains";

/**
 * The yearly school check-in (school email first, S75; Franky, Oct 8:
 * "yearly check-in and 90 days"). A school closes a graduate's inbox and
 * nothing tells us, so once a year an account that SIGNS IN with a school
 * email and has NO personal email is sent a code at that address.
 *
 *   typed in                    → fine for another year
 *   not typed in within 14 days → a 90-day countdown starts, shown in the app
 *   a personal email added      → the check-in and the countdown end for good
 *   day 90 with neither         → the account is deleted (the daily job)
 *
 * This file is the rules and the code; the job is /api/cron/school-checkin,
 * the person's side is /api/me/school-checkin. An account is never in scope
 * when it signs in with a personal email (every account made before school
 * email first) or holds a personal email.
 */

export const CHECKIN_EVERY_DAYS = 365;
export const CHECKIN_ANSWER_DAYS = 14;
export const CHECKIN_GRACE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const LABEL = "vibe-school-checkin-v1";
const CODE_RE = /^\d{8}$/;

/** What the rules read of an account. */
export type CheckinRow = {
  email: string | null;
  school_verified: boolean | null;
  personal_email: string | null;
  created_at: string | null;
  school_confirmed_at: string | null;
  school_checkin_sent_at: string | null;
  school_grace_ends_at: string | null;
};

/**
 * Where an account stands:
 *   exempt     not in scope (see above), or its dates cannot be read
 *   ok         proven within the year
 *   due        a year has passed: the job sends the check-in
 *   waiting    a check-in is out, inside its 14 days
 *   overdue    14 days passed unanswered: the job starts the countdown
 *   grace      the countdown is running
 *   expired    the countdown ended: the job deletes the account
 */
export type CheckinStage = "exempt" | "ok" | "due" | "waiting" | "overdue" | "grace" | "expired";

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** The one rule. Pure. */
export function checkinStage(row: CheckinRow, now: Date): CheckinStage {
  if (!row.school_verified || row.personal_email) return "exempt";
  if (!row.email || !isSchoolEmail(row.email)) return "exempt";
  const nowMs = now.getTime();

  const graceEnds = time(row.school_grace_ends_at);
  if (row.school_grace_ends_at) {
    // A date that cannot be read never deletes anyone.
    if (graceEnds === null) return "exempt";
    return nowMs >= graceEnds ? "expired" : "grace";
  }
  const sent = time(row.school_checkin_sent_at);
  if (row.school_checkin_sent_at) {
    if (sent === null) return "exempt";
    return nowMs >= sent + CHECKIN_ANSWER_DAYS * DAY_MS ? "overdue" : "waiting";
  }
  // Never checked in: the year counts from the day the account was made
  // (a school-first account proves its inbox at sign-up).
  const proven = time(row.school_confirmed_at) ?? time(row.created_at);
  if (proven === null) return "exempt";
  return nowMs >= proven + CHECKIN_EVERY_DAYS * DAY_MS ? "due" : "ok";
}

/** The countdown's last day for a check-in that just went overdue. */
export function graceEndsAt(now: Date): string {
  return new Date(now.getTime() + CHECKIN_GRACE_DAYS * DAY_MS).toISOString();
}

function secret(): string {
  const s = process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim();
  if (!s || s.length < 16) throw new Error("Set SCHOOL_EMAIL_VERIFY_SECRET (min 16 chars) for email codes.");
  return s;
}

/**
 * The check-in's 8-digit code: one per check-in, bound to the account, the
 * address and the moment the check-in was opened (`school_checkin_sent_at`),
 * so it works until that check-in is answered or the account is gone, and a
 * reminder repeats it. Guesses are bounded by the route's fail-closed limits.
 */
export function checkinCode(userId: string, email: string, sentAt: string): string {
  const digest = createHmac("sha256", secret())
    .update(`${LABEL}|${userId}|${email.trim().toLowerCase()}|${new Date(sentAt).getTime()}`)
    .digest();
  return String(digest.readUIntBE(0, 5) % 10 ** 8).padStart(8, "0");
}

/** Digits only, exactly 8 (callers strip spaces and dashes first). Constant-time. */
export function verifyCheckinCode(userId: string, email: string, sentAt: string, code: string): boolean {
  if (!CODE_RE.test(code)) return false;
  const expected = Buffer.from(checkinCode(userId, email, sentAt), "utf8");
  const given = Buffer.from(code, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
