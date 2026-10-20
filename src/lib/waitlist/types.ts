/**
 * Waitlist shared types and small pure helpers (BUILD.md sections 3c, 3d).
 * The server routes (batch B) and the pages (batch C) both import this file,
 * so: no `server-only`, no `node:` imports, erasable TypeScript only, and its
 * one import is type-only (erased at load).
 */

import type { WaitlistFormInput } from "./form";

export const WAITLIST_PATH = "/waitlist";
export const WAITLIST_CONFIRM_PATH = "/waitlist/confirm";
export const SIGNUP_PATH = "/auth/signup";

/**
 * Retention, the founders' rule of Oct 3: an entry is kept for UP TO this
 * many days after it joined the list, whatever its state. The number every
 * page and email says.
 */
export const WAITLIST_RETENTION_DAYS = 40;
/** An unconfirmed form entry goes sooner: up to this many days after its last confirm email. */
export const WAITLIST_UNCONFIRMED_RETENTION_DAYS = 30;
/**
 * How many days before the promise the purge deletes. Vercel's Hobby cron
 * runs once a day at any minute of its hour and is not retried, so two runs
 * can be about 25 hours apart and an entry can wait that long after its
 * line. Two days keeps the promise even when a run is late.
 */
export const WAITLIST_PURGE_MARGIN_DAYS = 2;
/**
 * When the purge actually deletes (`waitlist_deletes_at`, 20261003170000):
 * 38 days, or 28 for an unconfirmed entry. A code never outlives this
 * moment. retention.test.ts ties these to the SQL and to vercel.json.
 */
export const WAITLIST_PURGE_AFTER_DAYS = WAITLIST_RETENTION_DAYS - WAITLIST_PURGE_MARGIN_DAYS;
export const WAITLIST_UNCONFIRMED_PURGE_AFTER_DAYS = WAITLIST_UNCONFIRMED_RETENTION_DAYS - WAITLIST_PURGE_MARGIN_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The columns {@link waitlistDeletesAt} reads. */
export type WaitlistRetentionRow = {
  created_at: string;
  confirm_sent_at: string | null;
  confirmed_at: string | null;
  code_hash?: string | null;
  has_code?: boolean | null;
  origin: string;
};

/**
 * When the purge deletes this entry as things stand: 38 days after it
 * joined; an unconfirmed form entry with no code 28 days after its last
 * confirm email (or after joining, with none), if that is sooner. Null when
 * `created_at` can't be read. The page-side copy of the database's
 * `public.waitlist_deletes_at` (20261003170000), which the purge, the
 * one-person drop and `waitlist_issue_code` all read; the SQL check runs the
 * same vectors as admin-view.test.ts against it. Signing up again while
 * unconfirmed makes `created_at` now (trigger `waitlist_restart_clock`).
 */
export function waitlistDeletesAt(row: WaitlistRetentionRow): Date | null {
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created)) return null;
  const all = created + WAITLIST_PURGE_AFTER_DAYS * DAY_MS;
  const hasCode = row.has_code === true || (typeof row.code_hash === "string" && row.code_hash !== "");
  if (row.origin !== "form" || row.confirmed_at || hasCode) return new Date(all);
  const sent = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : NaN;
  const last = Number.isFinite(sent) ? Math.max(created, sent) : created;
  return new Date(Math.min(all, last + WAITLIST_UNCONFIRMED_PURGE_AFTER_DAYS * DAY_MS));
}

/**
 * True once an entry is past its line ({@link waitlistDeletesAt} before
 * `now`): the daily purge may not have reached it yet, but it counts as gone.
 * The form and "Add someone" drop it first (`waitlist_drop_if_due`), so the
 * same person joins again as a fresh entry, and a link from one of its
 * emails reads as unknown ("This link no longer works").
 */
export function waitlistPastLine(row: WaitlistRetentionRow, now: Date): boolean {
  const at = waitlistDeletesAt(row);
  return at !== null && at.getTime() < now.getTime();
}

// ---------------------------------------------------------------------------
// Batch names
// ---------------------------------------------------------------------------

/**
 * A batch name is one of these words and a number ("wave-1", "officers-2"),
 * never free text: it outlives the entry in `user_cohorts`, so it must never
 * carry a person's name. The database CHECKs hold the same pattern
 * (20261003150000; retention.test.ts compares them).
 */
export const WAITLIST_BATCH_PREFIXES = ["wave", "officers", "clubs", "friends", "test"] as const;
export const WAITLIST_BATCH_RE = /^(wave|officers|clubs|friends|test)-[0-9]{1,3}$/;
export const WAITLIST_BATCH_MAX_NUMBER = 999;

/** "wave" + "3" is "wave-3"; null for an unknown word or a number outside 1-999. */
export function waitlistBatchName(prefix: string, num: string | number): string | null {
  const n = typeof num === "number" ? num : /^\s*\d{1,3}\s*$/.test(num) ? Number(num) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > WAITLIST_BATCH_MAX_NUMBER) return null;
  const name = `${prefix}-${n}`;
  return WAITLIST_BATCH_RE.test(name) ? name : null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Where one person is, for the founders' list. */
export type WaitlistStatus = "unconfirmed" | "waiting" | "invited" | "expired" | "joined";

/** The columns {@link deriveWaitlistStatus} reads. A row may carry `code_hash` or a `has_code` flag. */
export type WaitlistStatusRow = {
  confirmed_at: string | null;
  code_hash?: string | null;
  has_code?: boolean | null;
  code_expires_at: string | null;
  redeemed_at: string | null;
};

/**
 * joined if the code made an account; else invited / expired if a code
 * exists (expired once `code_expires_at` is not after `now`); else waiting if
 * the email was confirmed; else unconfirmed.
 */
export function deriveWaitlistStatus(row: WaitlistStatusRow, now: Date): WaitlistStatus {
  if (row.redeemed_at) return "joined";
  const hasCode = row.has_code === true || (typeof row.code_hash === "string" && row.code_hash !== "");
  if (hasCode) {
    const expires = row.code_expires_at ? Date.parse(row.code_expires_at) : NaN;
    return Number.isFinite(expires) && expires > now.getTime() ? "invited" : "expired";
  }
  return row.confirmed_at ? "waiting" : "unconfirmed";
}

/**
 * What `/waitlist/confirm` may show for a `?token=`: the state only, never a
 * name or an address. `confirm_expired` = unconfirmed and the confirm email
 * is more than 7 days old.
 */
export type WaitlistPublicState =
  | "unconfirmed"
  | "confirm_expired"
  | "waiting"
  | "invited"
  | "invite_expired"
  | "joined"
  | "unknown";

// ---------------------------------------------------------------------------
// The gate's refusals
// ---------------------------------------------------------------------------

export const GATE_REFUSALS = [
  "access_code_required",
  "access_code_invalid",
  "access_code_expired",
  "access_code_used",
  "access_code_in_use",
  // A club link (setup or members'), 20261021120000_club_links_gate.sql.
  "club_link_invalid",
  "club_link_used",
  "club_link_expired",
  "club_link_off",
  "club_link_full",
  "club_link_in_use",
  "club_link_school_email",
] as const;
export type GateRefusal = (typeof GATE_REFUSALS)[number];

/** A refusal about a club link rather than an access code. */
export function isClubLinkRefusal(reason: GateRefusal): boolean {
  return reason.startsWith("club_link_");
}

const GATE_TAG_RE = /^\[vibe:([a-z_]+)\]/;

/**
 * The reason a sign-up was refused by `auth_hooks.hook_waitlist_gate`, or null
 * for any other error. The hook answers HTTP 403 with a message that starts
 * `[vibe:<reason>]`; supabase-js puts those in `error.status` and
 * `error.message`. The page shows its own copy for the reason, never the
 * message itself.
 */
export function parseGateRefusal(err: { status?: number; message?: string } | null | undefined): GateRefusal | null {
  if (!err || err.status !== 403 || typeof err.message !== "string") return null;
  const m = GATE_TAG_RE.exec(err.message.trim());
  if (!m) return null;
  return (GATE_REFUSALS as readonly string[]).includes(m[1]) ? (m[1] as GateRefusal) : null;
}

/**
 * The dev-only `?signup=open|closed` override for the local browser pass:
 * true / false, or null when absent, unknown, or in production.
 */
export function parseSignupOverride(
  value: string | null | undefined,
  nodeEnv: string | undefined,
): boolean | null {
  if (nodeEnv === "production") return null;
  if (value === "open") return true;
  if (value === "closed") return false;
  return null;
}

// ---------------------------------------------------------------------------
// Database function results
// ---------------------------------------------------------------------------

/**
 * What `public.waitlist_issue_code` returns. `code_taken`: a unique clash,
 * retry with a new code. `joined`: single mode on a row whose code already
 * made a confirmed account (20261003120000). `entry_expired`: the entry is
 * past its deletion moment (20261003150000); `entry_expiring`: less than 24
 * hours are left before it (20261003160000). `expires_at` is the code's real
 * end: 14 days, or the entry's deletion moment when that is sooner.
 */
export type WaitlistIssueCodeResult =
  | { ok: true; email: string; name: string; expires_at: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_confirmed"
        | "already_invited"
        | "joined"
        | "entry_expired"
        | "entry_expiring"
        | "bad_code"
        | "bad_token"
        | "code_taken";
    };

// ---------------------------------------------------------------------------
// Public routes (no session). All JSON.
// ---------------------------------------------------------------------------

/** POST /api/waitlist: body is {@link WaitlistFormInput}. */
export type WaitlistSubmitRequest = WaitlistFormInput;
export type WaitlistSubmitResponse =
  | { ok: true }
  | { ok: false; field: keyof WaitlistFormInput | "form"; error: string };

/** POST /api/waitlist/status, /confirm and /leave all take the `?token=` value. */
export type WaitlistTokenRequest = { token: string };
export type WaitlistStatusResponse =
  | { ok: true; state: WaitlistPublicState }
  | { ok: false; state: "unknown" };
export type WaitlistConfirmResponse =
  | { ok: true; state: WaitlistPublicState }
  | { ok: false; state: "unknown" | "confirm_expired" };
export type WaitlistLeaveResponse = { ok: true };

// ---------------------------------------------------------------------------
// Admin routes (requirePlatformAdmin). Errors: { ok: false, error, code }.
// ---------------------------------------------------------------------------

/** One kind's sends in the trailing 24 hours against its own cap. */
export type WaitlistEmailBudget = { used: number; cap: number };

export type AdminWaitlistRow = {
  id: string;
  /** First character + "*****" + "@" + domain. */
  maskedEmail: string;
  name: string;
  schoolSystem: "iu" | "purdue" | null;
  classYear: number | null;
  major: string | null;
  clubs: string | null;
  isOfficer: boolean;
  officerClub: string | null;
  wish: string | null;
  source: string | null;
  origin: "form" | "founder";
  newsOptIn: boolean;
  status: WaitlistStatus;
  createdAt: string;
  confirmedAt: string | null;
  codeIssuedAt: string | null;
  codeExpiresAt: string | null;
  /** When the purge deletes this entry as things stand ({@link waitlistDeletesAt}); null if unknown. */
  deletesAt: string | null;
  batch: string | null;
  inviteCount: number;
  joinedHandle: string | null;
};

/** GET /api/admin/waitlist: newest first, at most 2000 rows. */
export type AdminWaitlistList = {
  ok: true;
  rows: AdminWaitlistRow[];
  truncated: boolean;
  canReveal: boolean;
  /** Access-code emails (the founders' sends). */
  budget: WaitlistEmailBudget;
  /** The form's confirm emails, a separate allowance. */
  confirmBudget: WaitlistEmailBudget;
};

/** POST /api/admin/waitlist/invite: 1-25 ids. 409 `email_budget` carries `remaining`. */
export type AdminWaitlistInviteRequest = { ids: string[]; batch: string };
export type AdminWaitlistInviteOutcome = "sent" | "skipped" | "failed";
export type AdminWaitlistInviteResult = { id: string; outcome: AdminWaitlistInviteOutcome; reason?: string };
export type AdminWaitlistInviteResponse = {
  ok: true;
  results: AdminWaitlistInviteResult[];
  budget: WaitlistEmailBudget;
};

/**
 * POST /api/admin/waitlist/add. A person already on the list is not an
 * error: 200 with `existing: true` and their row's `id`, so the page can
 * take the founder straight to it.
 */
export type AdminWaitlistAddRequest = {
  email: string;
  name: string;
  isOfficer: boolean;
  officerClub?: string;
  clubs?: string;
  issueCode: boolean;
  batch?: string;
};
export type AdminWaitlistAddResponse = { ok: true; id: string; emailed: boolean; existing?: boolean };

/** POST /api/admin/waitlist/[id]/send-code. */
export type AdminWaitlistSendCodeRequest = { batch?: string };
/** send-code and remove. */
export type AdminWaitlistOkResponse = { ok: true };
/** POST /api/admin/waitlist/[id]/reveal: only for ids in `app_settings.waitlist_email_viewers`. */
export type AdminWaitlistRevealResponse = { ok: true; email: string };
