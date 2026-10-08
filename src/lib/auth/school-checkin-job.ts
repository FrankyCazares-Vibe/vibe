import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkinCode, CHECKIN_EVERY_DAYS, checkinStage, graceEndsAt, type CheckinRow } from "@/lib/auth/school-checkin";
import { billingCustomerForUser } from "@/lib/billing/customers";
import { sendSchoolCheckinEmail } from "@/lib/email/resend-transactional";
import { purgeUserUploads } from "@/lib/profile/storage-purge";
import { forgetAllowlistAddress, forgetWaitlistForUser } from "@/lib/waitlist/store";

/**
 * The daily pass of the yearly school check-in (school-checkin.ts has the
 * rule; /api/cron/school-checkin calls this). For every account in scope:
 *
 *   due      → open a check-in and email its code
 *   overdue  → start the 90-day countdown and email the notice
 *   expired  → delete the account, ONLY when `deleteEnabled`
 *
 * SAFETY, in the order it matters:
 * - Nothing is deleted unless the caller passes `deleteEnabled` (the route
 *   reads SCHOOL_CHECKIN_DELETE_ENABLED). Off, an expired account is only
 *   counted (`would_delete`).
 * - Each account is read AGAIN right before it is deleted, and deleted only
 *   if it is still expired: a personal email added a minute ago wins.
 * - At most `MAX_DELETES` deletions and `MAX_SENDS` emails a run: a mistake
 *   in a date cannot empty the app or the day's email budget in one night.
 * - An account with a billing customer is never deleted here (a person
 *   closes a paid account; `skipped_billing`).
 * - Files first, account second, as DELETE /api/me does: a failed purge
 *   keeps the account for the next run.
 * - A check-in whose email could not be sent is closed again, so the 14
 *   days never run on a message nobody was sent.
 *
 * The answer and the logs carry counts only.
 */

const COLUMNS = "id, email, school_verified, personal_email, created_at, school_confirmed_at, school_checkin_sent_at, school_grace_ends_at";
const MAX_SENDS = 25;
const MAX_DELETES = 5;
const PAGE = 500;

type Row = CheckinRow & { id: string };

export type CheckinRunResult = {
  checkins_sent: number;
  countdowns_started: number;
  deleted: number;
  would_delete: number;
  skipped_billing: number;
  failed: number;
};

const dateInWords = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" });

export async function runSchoolCheckin(service: SupabaseClient, now: Date, opts: { deleteEnabled: boolean }): Promise<CheckinRunResult> {
  const out: CheckinRunResult = { checkins_sent: 0, countdowns_started: 0, deleted: 0, would_delete: 0, skipped_billing: 0, failed: 0 };
  const yearAgo = new Date(now.getTime() - CHECKIN_EVERY_DAYS * 86_400_000).toISOString();

  // Open check-ins and countdowns; then the accounts a year may have passed for.
  const [open, old] = await Promise.all([
    service.from("users").select(COLUMNS).eq("school_verified", true).is("personal_email", null).not("school_checkin_sent_at", "is", null).limit(PAGE),
    service
      .from("users")
      .select(COLUMNS)
      .eq("school_verified", true)
      .is("personal_email", null)
      .is("school_checkin_sent_at", null)
      .or(`school_confirmed_at.lt.${yearAgo},and(school_confirmed_at.is.null,created_at.lt.${yearAgo})`)
      .limit(PAGE),
  ]);
  if (open.error || old.error) throw new Error(`school-checkin read: ${(open.error ?? old.error)?.code ?? "failed"}`);
  const rows = [...((open.data ?? []) as unknown as Row[]), ...((old.data ?? []) as unknown as Row[])];

  for (const row of rows) {
    const stage = checkinStage(row, now);
    try {
      if (stage === "due" && out.checkins_sent < MAX_SENDS) {
        if (await openCheckin(service, row, now)) out.checkins_sent += 1;
      } else if (stage === "overdue") {
        if (await startCountdown(service, row, now)) out.countdowns_started += 1;
      } else if (stage === "expired") {
        if (!opts.deleteEnabled) out.would_delete += 1;
        else if (out.deleted < MAX_DELETES) {
          const result = await deleteExpired(service, row.id, now);
          if (result === "deleted") out.deleted += 1;
          else if (result === "billing") out.skipped_billing += 1;
        }
      }
    } catch (err) {
      out.failed += 1;
      // The step only: never an address.
      console.error("[school-checkin job]", stage, err instanceof Error ? err.message.slice(0, 120) : "failed");
    }
  }
  return out;
}

/** Open a check-in (only if none is open) and email its code; closed again when the email fails. */
async function openCheckin(service: SupabaseClient, row: Row, now: Date): Promise<boolean> {
  const sentAt = now.toISOString();
  const { data, error } = await service
    .from("users")
    .update({ school_checkin_sent_at: sentAt })
    .eq("id", row.id)
    .is("school_checkin_sent_at", null)
    .is("personal_email", null)
    .select("id");
  if (error) throw new Error(`open: ${error.code}`);
  if (!data || data.length === 0) return false;
  try {
    await sendSchoolCheckinEmail(row.email as string, checkinCode(row.id, row.email as string, sentAt), "checkin", null, row.id);
  } catch (err) {
    await service.from("users").update({ school_checkin_sent_at: null }).eq("id", row.id).eq("school_checkin_sent_at", sentAt);
    throw err;
  }
  return true;
}

/** Start the countdown (only if none runs). The notice is best effort: the app shows the date either way. */
async function startCountdown(service: SupabaseClient, row: Row, now: Date): Promise<boolean> {
  const ends = graceEndsAt(now);
  const { data, error } = await service
    .from("users")
    .update({ school_grace_ends_at: ends })
    .eq("id", row.id)
    .not("school_checkin_sent_at", "is", null)
    .is("school_grace_ends_at", null)
    .is("personal_email", null)
    .select("id");
  if (error) throw new Error(`countdown: ${error.code}`);
  if (!data || data.length === 0) return false;
  try {
    await sendSchoolCheckinEmail(row.email as string, checkinCode(row.id, row.email as string, row.school_checkin_sent_at as string), "countdown", dateInWords(ends), row.id);
  } catch {
    console.error("[school-checkin job] countdown notice not sent");
  }
  return true;
}

/** Delete one account whose countdown ended, if it is STILL expired on a fresh read. */
async function deleteExpired(service: SupabaseClient, userId: string, now: Date): Promise<"deleted" | "billing" | "kept"> {
  const { data, error } = await service.from("users").select(COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw new Error(`recheck: ${error.code}`);
  const fresh = data as unknown as Row | null;
  if (!fresh || checkinStage(fresh, now) !== "expired") return "kept";
  if (await billingCustomerForUser(userId)) return "billing";

  await purgeUserUploads(userId);
  try {
    await forgetWaitlistForUser(service, userId, [fresh.email]);
    await forgetAllowlistAddress(service, fresh.email);
  } catch {
    console.error("[school-checkin job] waitlist clean-up skipped");
  }
  const { error: deleteErr } = await service.auth.admin.deleteUser(userId);
  if (deleteErr) throw new Error("delete: auth");
  return "deleted";
}
