import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recipientHash, redactAddresses } from "@/lib/email/send-log-core";
import { sendWaitlistInviteEmail } from "@/lib/email/resend-transactional";

import { generateAccessCode } from "./access-code";
import {
  DEFAULT_WAITLIST_CONFIRM_DAILY_CAP,
  DEFAULT_WAITLIST_DAILY_CAP,
  WAITLIST_ADMIN_COLUMNS,
  parseDailyCap,
  type WaitlistAdminDbRow,
} from "./admin-view";
import { waitlistLeaveUrl, waitlistSignupUrl } from "./email-content";
import { WAITLIST_NOTICE_VERSION, type WaitlistFormValue } from "./form";
import { runSendAccessCode, type SendCodeResult } from "./send-code-core";
import { CONFIRM_WINDOW_DAYS, mintManageToken, type WaitlistPublicRow } from "./tokens";
import { waitlistPastLine, type WaitlistEmailBudget, type WaitlistIssueCodeResult } from "./types";

/**
 * Every service-role read and write of the waitlist (BUILD.md section 3d).
 * The tables have RLS on and no policies, so only this file (through the
 * routes) reaches them. Nothing here logs an address, a token or a code;
 * errors are thrown with the database's message and the routes decide what
 * the caller sees.
 */

const WAITLIST_KINDS = ["waitlist_confirm", "waitlist_invite"] as const;
export type WaitlistEmailKind = (typeof WAITLIST_KINDS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;
/** The admin list's ceiling; one more row is read to know it was cut. */
export const WAITLIST_LIST_MAX = 2000;

function fail(where: string, message: string): never {
  throw new Error(`[waitlist-store] ${where}: ${message}`);
}

let warnedNoSecret = false;

/** The address's `email_sends` key (the send log's keyed hash), or null without the secret. */
function sendLogHash(email: string): string | null {
  const hash = recipientHash(email, process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim() ?? null);
  if (!hash && !warnedNoSecret) {
    warnedNoSecret = true;
    console.warn("[waitlist] SCHOOL_EMAIL_VERIFY_SECRET is missing: send-log rows can't be matched to an address");
  }
  return hash;
}

// ---------------------------------------------------------------------------
// The daily email budgets and the reveal list
// ---------------------------------------------------------------------------

/**
 * One kind's cap: `WAITLIST_EMAIL_DAILY_CAP` for access codes (default 40),
 * `WAITLIST_CONFIRM_DAILY_CAP` for the form's confirm emails (default 30).
 */
export function waitlistDailyCap(kind: WaitlistEmailKind): number {
  return kind === "waitlist_invite"
    ? parseDailyCap(process.env.WAITLIST_EMAIL_DAILY_CAP, DEFAULT_WAITLIST_DAILY_CAP)
    : parseDailyCap(process.env.WAITLIST_CONFIRM_DAILY_CAP, DEFAULT_WAITLIST_CONFIRM_DAILY_CAP);
}

/**
 * One kind's emails Resend accepted in the trailing 24 hours, from the send
 * log. Each kind has its own allowance, so form traffic can never use up the
 * founders' access-code sends. A dev-log "send" writes no row, so it costs
 * nothing locally. Removing a person forgets their send rows' address but
 * keeps the rows, so a removal never gives the day's budget back.
 */
export async function readWaitlistBudget(service: SupabaseClient, kind: WaitlistEmailKind): Promise<WaitlistEmailBudget> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await service
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("ok", true)
    .gte("created_at", since);
  if (error) fail("budget", error.message);
  return { used: count ?? 0, cap: waitlistDailyCap(kind) };
}

/** User ids allowed to see full addresses (`app_settings.waitlist_email_viewers`). */
export async function readEmailViewers(service: SupabaseClient): Promise<string[]> {
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "waitlist_email_viewers")
    .maybeSingle();
  if (error) fail("viewers", error.message);
  const value = (data as { value?: unknown } | null)?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// ---------------------------------------------------------------------------
// The public form and the manage token
// ---------------------------------------------------------------------------

/**
 * True when an account already signs in with, or verified, one of these
 * addresses. Each is matched with `.eq`, never inside an `in.(…)` list, so a
 * typed address can't become PostgREST filter syntax (the admin users
 * route's rule).
 */
export async function accountExistsFor(service: SupabaseClient, addresses: string[]): Promise<boolean> {
  const list = [...new Set(addresses.filter(Boolean))];
  const reads = list.flatMap((address) => [
    service.from("users").select("id").eq("email", address).limit(1),
    service.from("users").select("id").eq("school_email", address).limit(1),
  ]);
  const results = await Promise.all(reads);
  const failed = results.find((r) => r.error);
  if (failed?.error) fail("account", failed.error.message);
  return results.some((r) => (r.data?.length ?? 0) > 0);
}

type KeyRow = { id: string; confirmed_at: string | null; code_hash: string | null; redeemed_at: string | null };

/**
 * An entry past its line counts as gone before the daily purge reaches it
 * (20261003160000): `waitlist_drop_if_due` deletes this person's entry if it
 * is past its line, and its send-log rows forget the address, as the purge
 * would. The form and "Add someone" call this before they look the person
 * up, so someone joining again gets a fresh entry, as the pages promise
 * ("you can join again"). True when an entry went. Never throws: a failure
 * is logged (without the address) and the lookup goes on as before, so a
 * submit still saves; the purge deletes the entry within a day either way.
 */
export async function dropWaitlistEntryIfDue(service: SupabaseClient, emailKey: string): Promise<boolean> {
  try {
    const { data, error } = await service.rpc("waitlist_drop_if_due", { p_email_key: emailKey });
    if (error) fail("drop", error.message);
    if (typeof data !== "string" || !data) return false;
    await forgetSends(service, [data]);
    return true;
  } catch (err) {
    console.error("[waitlist] drop", redactAddresses(err instanceof Error ? err.message : String(err)));
    return false;
  }
}

/** The row for one person (`email_key`), or null. */
export async function findByEmailKey(service: SupabaseClient, emailKey: string): Promise<KeyRow | null> {
  const { data, error } = await service
    .from("waitlist")
    .select("id, confirmed_at, code_hash, redeemed_at")
    .eq("email_key", emailKey)
    .maybeSingle();
  if (error) fail("find", error.message);
  return (data as KeyRow | null) ?? null;
}

/**
 * A new row from the form, with the consents stamped now. `tokenHash` is
 * null when no confirm email will go (the day's budget is spent).
 * "exists" when the same person got in first (a unique clash on the key).
 */
export async function insertFormRow(
  service: SupabaseClient,
  value: WaitlistFormValue,
  emailKey: string,
  tokenHash: string | null,
): Promise<"inserted" | "exists"> {
  const now = new Date().toISOString();
  const { error } = await service.from("waitlist").insert({
    email: value.email,
    email_key: emailKey,
    school_system: value.schoolSystem,
    origin: "form",
    name: value.name,
    class_year: value.classYear,
    major: value.major,
    clubs: value.clubs,
    is_officer: value.isOfficer,
    officer_club: value.officerClub,
    wish: value.wish,
    source: value.source,
    age_attested_at: now,
    consent_invite_at: now,
    consent_news_at: value.consentNews ? now : null,
    notice_version: WAITLIST_NOTICE_VERSION,
    manage_token_hash: tokenHash,
    confirm_sent_at: tokenHash ? now : null,
  });
  if (error?.code === "23505") return "exists";
  if (error) fail("insert", error.message);
  return "inserted";
}

/**
 * A fresh confirm link for a row that is still unconfirmed, carrying THIS
 * submit's answers. Anyone can type anyone's address, so the answers belong
 * to the newest link: whoever confirms confirms what was sent with the link
 * they tapped, and the older link stops working. False when the row was
 * confirmed or given a code meanwhile (then nothing changes).
 *
 * It also restarts the entry's clock: the new `manage_token_hash` fires the
 * database trigger `waitlist_restart_clock` (20261003170000), which makes
 * `created_at` now for an entry still unconfirmed, with no code. So someone
 * who confirms after signing up a second time gets the full time, not what
 * was left from the first. A confirmed entry keeps its date.
 */
export async function renewConfirmToken(
  service: SupabaseClient,
  id: string,
  tokenHash: string,
  value: WaitlistFormValue,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("waitlist")
    .update({
      email: value.email,
      school_system: value.schoolSystem,
      name: value.name,
      class_year: value.classYear,
      major: value.major,
      clubs: value.clubs,
      is_officer: value.isOfficer,
      officer_club: value.officerClub,
      wish: value.wish,
      source: value.source,
      age_attested_at: now,
      consent_invite_at: now,
      consent_news_at: value.consentNews ? now : null,
      notice_version: WAITLIST_NOTICE_VERSION,
      manage_token_hash: tokenHash,
      confirm_sent_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .is("confirmed_at", null)
    .is("code_hash", null)
    .select("id");
  if (error) fail("renew", error.message);
  return (data?.length ?? 0) > 0;
}

const PUBLIC_COLUMNS =
  "id, email, origin, created_at, confirmed_at, confirm_sent_at, code_hash, code_expires_at, redeemed_at";
export type WaitlistTokenRow = WaitlistPublicRow & { id: string; email: string; origin: string; created_at: string };

/**
 * The row a `?token=` belongs to, or null: the confirm email's token
 * (`manage_token_hash`) or the invite email's (`invite_token_hash`). An
 * invite has its own token, so the first email's link keeps showing the
 * person's state after they are let in. `hash` is 64 hex (hashManageToken),
 * so it is safe inside the `or` filter.
 */
export async function findByTokenHash(service: SupabaseClient, hash: string): Promise<WaitlistTokenRow | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const { data, error } = await service
    .from("waitlist")
    .select(PUBLIC_COLUMNS)
    .or(`manage_token_hash.eq.${hash},invite_token_hash.eq.${hash}`)
    .limit(1)
    .maybeSingle();
  if (error) fail("token", error.message);
  return (data as WaitlistTokenRow | null) ?? null;
}

/**
 * {@link findByTokenHash} for the confirm page's status and confirm routes:
 * an entry past its line is gone (null, "This link no longer works"), even
 * before the purge deletes it, so nobody is told their spot is confirmed on
 * an entry about to vanish. "Take me off the list" uses the plain lookup and
 * deletes it either way.
 */
export async function findLiveByTokenHash(service: SupabaseClient, hash: string): Promise<WaitlistTokenRow | null> {
  const row = await findByTokenHash(service, hash);
  return row && !waitlistPastLine(row, new Date()) ? row : null;
}

/**
 * Confirm the spot: sets `confirmed_at` only when it is empty and the
 * newest confirm email is under 7 days old. Idempotent; the caller re-reads.
 */
export async function confirmByManageHash(service: SupabaseClient, hash: string): Promise<void> {
  const now = new Date();
  const { error } = await service
    .from("waitlist")
    .update({ confirmed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("manage_token_hash", hash)
    .is("confirmed_at", null)
    .gt("confirm_sent_at", new Date(now.getTime() - CONFIRM_WINDOW_DAYS * DAY_MS).toISOString());
  if (error) fail("confirm", error.message);
}

/**
 * Forget which addresses the waitlist send-log rows were for: the keyed hash
 * goes, the rows stay (as email_sends_forget_recipient does for a deleted
 * account), so the day's counts and budgets never go back down. Hashes are
 * 64 hex, so they are safe inside the `in.(…)` list; 100 per request.
 */
async function forgetSends(service: SupabaseClient, emails: string[]): Promise<void> {
  const hashes = [...new Set(emails.map(sendLogHash).filter((h): h is string => !!h))];
  for (let i = 0; i < hashes.length; i += 100) {
    const { error } = await service
      .from("email_sends")
      .update({ recipient_hash: null })
      .in("recipient_hash", hashes.slice(i, i + 100))
      .in("kind", [...WAITLIST_KINDS]);
    if (error) fail("forget sends", error.message);
  }
}

/**
 * Take a person off the list: their send-log rows forget the address first
 * (the account-deletion trigger never reaches a row with no account), then
 * the row goes. Throws if either fails, so a retry finishes the job.
 */
export async function deleteWaitlistRow(service: SupabaseClient, id: string, email: string): Promise<void> {
  await forgetSends(service, [email]);
  const { error } = await service.from("waitlist").delete().eq("id", id);
  if (error) fail("delete", error.message);
}

/**
 * An account is being deleted (DELETE /api/me): the waitlist row its code
 * redeemed goes, with its send-log addresses. The database trigger
 * waitlist_forget_user deletes the row anyway; this adds the send log,
 * whose key the database can't compute.
 */
export async function forgetWaitlistForUser(service: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await service.from("waitlist").select("id, email").eq("redeemed_user_id", userId);
  if (error) fail("forget user", error.message);
  for (const row of (data ?? []) as { id: string; email: string }[]) {
    await deleteWaitlistRow(service, row.id, row.email);
  }
}

const PURGE_PAGE = 1000;
const PURGE_MAX_PAGES = 5;
const PURGE_EVERY_MS = 60 * 60 * 1000;
let lastPurge = 0;

/**
 * Retention, the founders' rule (20261003140000, 20261003150000; one
 * deletion moment, `waitlist_deletes_at`, since 20261003160000; two days of
 * margin since 20261003170000): the pages promise up to 40 days (30 for an
 * unconfirmed entry), and `waitlist_purge_expired` deletes two days early so
 * a late daily cron still keeps that promise: every entry 38 days after it
 * joined, whatever its state, and an unconfirmed form entry with no code 28
 * days after its last confirm email
 * (anyone can type anyone's address; that row is a stranger's typing).
 * types.ts holds both pairs of numbers; retention.test.ts ties them to the
 * SQL. It returns the deleted addresses; their send-log rows then forget them
 * here, because the key is a server secret. If that step fails, the database
 * still forgets every waitlist send-log hash at 38 days. An account made
 * with a code keeps its non-personal `user_cohorts` tag. Returns how many
 * entries went. The one purge behind all three callers: the form's
 * background step, the admin Waitlist tab and the daily Vercel Cron.
 */
export async function purgeExpiredWaitlist(service: SupabaseClient): Promise<number> {
  let total = 0;
  for (let page = 0; page < PURGE_MAX_PAGES; page++) {
    const { data, error } = await service.rpc("waitlist_purge_expired", { p_limit: PURGE_PAGE });
    if (error) fail("purge", error.message);
    const emails = ((data ?? []) as { email: string }[]).map((r) => r.email);
    total += emails.length;
    await forgetSends(service, emails);
    if (emails.length < PURGE_PAGE) break;
  }
  return total;
}

/**
 * {@link purgeExpiredWaitlist} at most once an hour per server instance, for
 * the form's background step and the admin tab. Never throws: a failure is
 * logged (without addresses) and the daily cron is the backstop.
 */
export async function purgeExpiredWaitlistIfDue(service: SupabaseClient): Promise<void> {
  if (Date.now() - lastPurge < PURGE_EVERY_MS) return;
  lastPurge = Date.now();
  try {
    await purgeExpiredWaitlist(service);
  } catch (err) {
    console.error("[waitlist] purge", redactAddresses(err instanceof Error ? err.message : String(err)));
  }
}

// ---------------------------------------------------------------------------
// The founders' list
// ---------------------------------------------------------------------------

/** Newest first, at most {@link WAITLIST_LIST_MAX}, plus the joined accounts' handles. */
export async function listWaitlist(service: SupabaseClient): Promise<{
  rows: WaitlistAdminDbRow[];
  truncated: boolean;
  handles: Map<string, string>;
}> {
  const { data, error } = await service
    .from("waitlist")
    .select(WAITLIST_ADMIN_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(WAITLIST_LIST_MAX + 1);
  if (error) fail("list", error.message);
  const all = (data ?? []) as unknown as WaitlistAdminDbRow[];
  const rows = all.slice(0, WAITLIST_LIST_MAX);
  const ids = [...new Set(rows.map((r) => r.redeemed_user_id).filter((v): v is string => !!v))];
  const handles = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const page = await service.from("users").select("id, handle").in("id", ids.slice(i, i + 200));
    if (page.error) fail("handles", page.error.message);
    for (const u of (page.data ?? []) as { id: string; handle: string | null }[]) {
      if (u.handle) handles.set(u.id, u.handle);
    }
  }
  return { rows, truncated: all.length > WAITLIST_LIST_MAX, handles };
}

/** The address and name behind a row id, for a send, a removal or a reveal. */
export async function getWaitlistContact(
  service: SupabaseClient,
  id: string,
): Promise<{ id: string; email: string; name: string; origin: string } | null> {
  const { data, error } = await service.from("waitlist").select("id, email, name, origin").eq("id", id).maybeSingle();
  if (error) fail("contact", error.message);
  return (data as { id: string; email: string; name: string; origin: string } | null) ?? null;
}

/**
 * A founder's hand-added row: already confirmed, no consents needed
 * (`origin = 'founder'`). "exists" carries the id already holding the key.
 * An entry past its line is dropped first ({@link dropWaitlistEntryIfDue}),
 * so the person comes back as a fresh row, never the dying one.
 */
export async function insertFounderRow(
  service: SupabaseClient,
  v: { email: string; emailKey: string; schoolSystem: "iu" | "purdue" | null; name: string;
       isOfficer: boolean; officerClub: string | null; clubs: string | null; batch: string | null },
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; existingId: string | null }> {
  await dropWaitlistEntryIfDue(service, v.emailKey);
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("waitlist")
    .insert({
      email: v.email, email_key: v.emailKey, school_system: v.schoolSystem, origin: "founder",
      name: v.name, is_officer: v.isOfficer, officer_club: v.officerClub, clubs: v.clubs,
      batch: v.batch, added_by: actorId, confirmed_at: now,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const existing = await findByEmailKey(service, v.emailKey);
    return { ok: false, existingId: existing?.id ?? null };
  }
  if (error) fail("add", error.message);
  return { ok: true, id: (data as { id: string }).id };
}

// ---------------------------------------------------------------------------
// Access codes
// ---------------------------------------------------------------------------

/**
 * Give a row a fresh code through `public.waitlist_issue_code` (only the
 * hash is stored), with the invite email's own token hash. A `code_taken`
 * clash makes a new code and tries again, up to three times. Batch mode
 * (`single = false`) needs a confirmed row with no code; single mode
 * replaces any code, except on a row whose code made a confirmed account
 * ("joined"). No mode gives a code to an entry past its deletion moment
 * ("entry_expired") or less than 24 hours from it ("entry_expiring",
 * 20261003160000), and a code ends no later than that moment
 * (20261003150000). Throws on a database error.
 */
export async function issueAccessCode(
  service: SupabaseClient,
  opts: { id: string; actorId: string; batch: string | null; single: boolean; inviteTokenHash: string },
): Promise<{ ok: true; code: string; email: string; name: string; expiresAt: string } | { ok: false; reason: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateAccessCode();
    const { data, error } = await service.rpc("waitlist_issue_code", {
      p_id: opts.id,
      p_code: code,
      p_actor: opts.actorId,
      p_batch: opts.batch ?? "",
      p_single: opts.single,
      p_invite_token_hash: opts.inviteTokenHash,
    });
    if (error) fail("issue", error.message);
    const result = data as WaitlistIssueCodeResult | null;
    if (result?.ok) return { ok: true, code, email: result.email, name: result.name, expiresAt: result.expires_at };
    if (result?.reason !== "code_taken") return { ok: false, reason: result?.reason ?? "unknown" };
  }
  return { ok: false, reason: "code_taken" };
}

/**
 * Undo a code whose email failed (only while it is still this code and
 * unused): the database puts back the code, claim, redemption and invite
 * token it replaced (20261003120000).
 */
export async function revokeAccessCode(service: SupabaseClient, id: string, code: string): Promise<boolean> {
  const { data, error } = await service.rpc("waitlist_revoke_code", { p_id: id, p_code: code });
  if (error) fail("revoke", error.message);
  return data === true;
}

export type { SendCodeResult };

/**
 * Issue a code and email it: the code, the "Create your account" link and
 * the invite's own "Take me off the list" link (its own token, so the
 * confirm email's link keeps working). A failed send revokes the code, which
 * restores what the person had before. "skipped" is the database saying no
 * (not_found, not_confirmed, already_invited, joined, entry_expired, entry_expiring). The steps and their
 * order are in send-code-core.ts (unit-tested).
 */
export function sendAccessCode(
  service: SupabaseClient,
  opts: { id: string; actorId: string; batch: string | null; single: boolean; site: string },
): Promise<SendCodeResult> {
  return runSendAccessCode({
    mintToken: () => mintManageToken(),
    issue: (inviteTokenHash) => issueAccessCode(service, { ...opts, inviteTokenHash }),
    send: (issued, inviteToken) =>
      sendWaitlistInviteEmail(
        issued.email,
        issued.name,
        issued.code,
        issued.expiresAt,
        waitlistSignupUrl(opts.site, issued.code),
        waitlistLeaveUrl(opts.site, inviteToken),
      ),
    revoke: (code) => revokeAccessCode(service, opts.id, code),
    logError: (message, detail) =>
      console.error(message, detail === null ? "" : redactAddresses(detail instanceof Error ? detail.message : String(detail))),
  });
}
