import "server-only";

import { getSiteUrl } from "@/lib/auth/site-url";
import { sendLogged } from "@/lib/email/send-log";
import type { EmailSendKind } from "@/lib/email/send-log-core";
import { createResendClient, isResendConfigured } from "@/lib/resend";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { reportReasonLabel, reportTargetLabel } from "./reports";

/**
 * "Somebody reported something" → email every platform admin (Franky
 * 2026-09-22 decision 3: all three founders moderate, every new report emails
 * all of them). Plan §Admin alerts.
 *
 * NOTHING HERE MAY FAIL A REPORT. The student filed it; that part is done and
 * saved. Every path below swallows its own failure and logs one line, and
 * `alertAdminsOfReport` never throws and never returns a reason the caller has
 * to handle. Locally RESEND_API_KEY is empty by ruling B4, so "not configured"
 * is the NORMAL path in development, not an error.
 *
 * NO ADDRESS EVER REACHES A LOG LINE, a thrown message or a moderation_actions
 * row (memory security model: never log an email, a token or a secret). The
 * recipient count is logged; the recipients are not. `sendLogged` stores only
 * a keyed hash and a coarse domain, which is the whole point of that helper.
 *
 * NO REPORTED TEXT IN THE EMAIL either. Target type, reason, how many open
 * reports the target has, and a link — an admin reads the actual content on
 * /admin, signed in, where it belongs. An inbox is not an audit boundary.
 */

/**
 * The send-log kind for these emails.
 *
 * NOT YET ACCEPTED BY THE STORE: `email_sends_kind_check` allows only
 * 'school_verification' and 'password_reset'
 * (supabase/migrations/20260922104000_email_sends.sql:145-146), and
 * `EMAIL_SEND_KINDS` in src/lib/email/send-log-core.ts:29 is the same pair.
 * Both are outside this batch's files. Until they are widened the email SENDS
 * and its log row is refused, costing one `[email-send-log] insert failed:`
 * line — which that helper is explicitly built to shrug off. The cast is the
 * honest shape of that gap, not a workaround for a type that is wrong.
 */
const ALERT_SEND_KIND: string = "moderation_alert";

/** No second alert for the same target inside this window. */
const ALERT_WINDOW_MINUTES = 60;

export type ReportAlert = {
  /** The report row that triggered this, stamped with `admin_alerted_at` on success. */
  reportId: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  /** How many open reports this target has, including the new one. */
  openCount: number;
};

/** Every platform admin's login address. Service role only — `users.email` is private. */
async function adminRecipients(): Promise<string[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select("email")
    .eq("is_platform_admin", true)
    .limit(50);
  if (error) {
    console.error("[moderation.alerts] admin lookup failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ email: string | null }>;
  return rows.map((r) => r.email?.trim() ?? "").filter((e) => e.length > 0);
}

/**
 * Has this target already been alerted on in the last hour? Reads the reports
 * on the same target rather than a separate table, because `admin_alerted_at`
 * lives on the report row that triggered the send.
 *
 * An unreadable store answers "no": we cannot prove an alert went out, so we
 * send one. The worst case is a duplicate email; the other way round, a report
 * nobody hears about.
 */
async function alertedRecently(targetType: string, targetId: string): Promise<boolean> {
  const since = new Date(Date.now() - ALERT_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await createSupabaseServiceClient()
    .from("reports")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .gt("admin_alerted_at", since)
    .limit(1);
  if (error) {
    console.error("[moderation.alerts] throttle read failed:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Remember that this report's alert went out, so the next hour stays quiet. */
async function stampAlerted(reportId: string): Promise<void> {
  const { error } = await createSupabaseServiceClient()
    .from("reports")
    .update({ admin_alerted_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) console.error("[moderation.alerts] stamp failed:", error.message);
}

/** Plain-text body. No student text, no reporter, no target id beyond the link. */
function alertText(alert: ReportAlert, link: string): string {
  const open =
    alert.openCount === 1 ? "1 open report" : `${alert.openCount} open reports`;
  return [
    `Someone reported ${reportTargetLabel(alert.targetType)} on Vibe.`,
    "",
    `Reason: ${reportReasonLabel(alert.reasonCode)}`,
    `This target now has ${open}.`,
    "",
    `Review it: ${link}`,
    "",
    "The report itself is on the admin page, signed in. It is not in this email.",
  ].join("\n");
}

/**
 * Email every platform admin about a new report. NEVER THROWS, never fails the
 * report, and returns what happened so a caller can log or test it — locally
 * the only way to assert an alert is the `email_sends` row, since
 * RESEND_API_KEY is empty (ruling B4).
 *
 * Skipped when: the target was already alerted on within the hour, there are
 * no platform admins (the local copy has none — seed one before expecting an
 * alert), or Resend is not configured.
 */
export async function alertAdminsOfReport(
  alert: ReportAlert,
): Promise<{ sent: number; skipped: "throttled" | "no_admins" | "not_configured" | null }> {
  try {
    if (await alertedRecently(alert.targetType, alert.targetId)) {
      return { sent: 0, skipped: "throttled" };
    }

    const recipients = await adminRecipients();
    if (recipients.length === 0) {
      console.error("[moderation.alerts] no platform admins to alert");
      return { sent: 0, skipped: "no_admins" };
    }

    // getFrom() in resend-transactional.ts THROWS on a missing RESEND_FROM and
    // is not exported, so the same two settings are checked here instead. A
    // report must never fail because email is not set up.
    const from = process.env.RESEND_FROM?.trim();
    if (!isResendConfigured() || !from) {
      console.warn("[moderation.alerts] email not configured; report saved, no alert sent");
      return { sent: 0, skipped: "not_configured" };
    }

    const link = `${getSiteUrl()}/admin?tab=reports`;
    const subject = "New report on Vibe";
    const text = alertText(alert, link);

    let sent = 0;
    // One send per admin, so one bad address cannot swallow the others and no
    // admin sees the others' addresses in a To: line.
    for (const to of recipients) {
      const outcome = await sendLogged(
        ALERT_SEND_KIND as EmailSendKind,
        to,
        null,
        () => createResendClient().emails.send({ from, to: [to], subject, text }),
      );
      if (outcome.ok) sent += 1;
      // outcome.errorMessage is provider text with addresses already redacted
      // by the send log; it is safe to print and the address itself is not.
      else console.error("[moderation.alerts] send failed:", outcome.errorCode);
    }

    if (sent > 0) await stampAlerted(alert.reportId);
    return { sent, skipped: null };
  } catch (err) {
    // Deliberately broad: a report is already saved by the time we get here.
    console.error("[moderation.alerts] unexpected", err instanceof Error ? err.message : err);
    return { sent: 0, skipped: null };
  }
}
