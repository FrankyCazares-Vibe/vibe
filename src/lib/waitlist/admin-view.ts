/**
 * The waitlist's admin side, pure (BUILD.md section 3d): masking, the row the
 * founders' list gets, the email budget, the one-person key, and the input
 * checks of the admin routes. No `server-only` and no `@/` imports, so the
 * node test runner loads it; but it reaches `node:crypto` through
 * identity.ts and send-log-core.ts, so it is SERVER code: a client component
 * imports types.ts (and batch C's view.ts), never this file.
 */

import {
  normalizeSchoolEmail,
  retiredIuDomainFor,
  schoolEmailHost,
  schoolEmailRejection,
  schoolIdentityDomainFor,
  schoolSystemForEmail,
} from "../auth/school-email-domains";
import { KNOWN_SCHOOL_EMAIL_DOMAINS, PUBLIC_EMAIL_PROVIDER_DOMAINS } from "../email/send-log-core";
import { canonicalSchoolIdentity } from "../moderation/identity";
import { isUuid } from "../pgrest";
import { WAITLIST_LIMITS } from "./form";
import { deriveWaitlistStatus, WAITLIST_BATCH_RE, waitlistDeletesAt, type AdminWaitlistRow } from "./types";

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const MASK = "*****";

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * `f*****@iu.edu`: the first character, five stars, and the domain. The
 * domain shows only when it says nothing about the person (a school domain
 * or subdomain, or a big public provider, the send log's rule M15); any
 * other host is masked the same way (`me@franky.dev` is `m*****@f*****.dev`),
 * because a personal domain is as good as the address. No `@` at all: stars.
 */
export function maskEmail(email: string): string {
  const v = typeof email === "string" ? email.trim().toLowerCase() : "";
  const at = v.lastIndexOf("@");
  if (at <= 0 || at === v.length - 1) return MASK;
  const first = Array.from(v.slice(0, at))[0];
  const host = v.slice(at + 1);
  const known =
    KNOWN_SCHOOL_EMAIL_DOMAINS.some((d) => hostMatches(host, d)) ||
    PUBLIC_EMAIL_PROVIDER_DOMAINS.includes(host);
  if (known) return `${first}${MASK}@${host}`;
  const dot = host.lastIndexOf(".");
  const tld = dot > 0 ? host.slice(dot) : "";
  return `${first}${MASK}@${Array.from(host)[0]}${MASK}${tld}`;
}

/**
 * `waitlist.email_key`: one person, one row. A school address folds `+tags`
 * and subdomains (`canonicalSchoolIdentity`: `A.B+1@mail.iu.edu` is
 * `a.b@iu.edu`); any other address (a founder adding an officer's Gmail) is
 * trimmed and lowercased only. Null when malformed, including a school
 * address with nothing before its `+` (`+x@iu.edu`).
 */
export function waitlistEmailKey(email: string): string | null {
  if (typeof email !== "string") return null;
  if (schoolIdentityDomainFor(email)) return canonicalSchoolIdentity(email);
  const host = schoolEmailHost(email);
  if (!host) return null;
  return `${email.trim().split("@")[0].toLowerCase()}@${host}`;
}

// ---------------------------------------------------------------------------
// The founders' list
// ---------------------------------------------------------------------------

/** The `waitlist` columns the admin list reads (server side; addresses never leave it). */
export const WAITLIST_ADMIN_COLUMNS =
  "id, email, name, school_system, class_year, major, clubs, is_officer, officer_club, wish, " +
  "source, origin, consent_news_at, created_at, confirm_sent_at, confirmed_at, code_hash, code_issued_at, " +
  "code_expires_at, batch, invite_count, redeemed_at, redeemed_user_id";

export type WaitlistAdminDbRow = {
  id: string;
  email: string;
  name: string;
  school_system: string | null;
  class_year: number | null;
  major: string | null;
  clubs: string | null;
  is_officer: boolean;
  officer_club: string | null;
  wish: string | null;
  source: string | null;
  origin: string;
  consent_news_at: string | null;
  created_at: string;
  confirm_sent_at: string | null;
  confirmed_at: string | null;
  code_hash: string | null;
  code_issued_at: string | null;
  code_expires_at: string | null;
  batch: string | null;
  invite_count: number;
  redeemed_at: string | null;
  redeemed_user_id: string | null;
};

/**
 * One database row as the founders' list shows it: a masked address, never
 * the address or any hash. `joinedHandle` is the handle of the account the
 * code made, shown only once the row is joined.
 */
export function toAdminWaitlistRow(
  row: WaitlistAdminDbRow,
  joinedHandle: string | null,
  now: Date,
): AdminWaitlistRow {
  const status = deriveWaitlistStatus(row, now);
  const system = row.school_system === "iu" || row.school_system === "purdue" ? row.school_system : null;
  const deletesAt = waitlistDeletesAt({ ...row, confirm_sent_at: row.confirm_sent_at ?? null });
  return {
    id: row.id,
    maskedEmail: maskEmail(row.email),
    name: row.name,
    schoolSystem: system,
    classYear: typeof row.class_year === "number" ? row.class_year : null,
    major: row.major ?? null,
    clubs: row.clubs ?? null,
    isOfficer: row.is_officer === true,
    officerClub: row.officer_club ?? null,
    wish: row.wish ?? null,
    source: row.source ?? null,
    origin: row.origin === "founder" ? "founder" : "form",
    newsOptIn: !!row.consent_news_at,
    status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
    codeIssuedAt: row.code_issued_at ?? null,
    codeExpiresAt: row.code_expires_at ?? null,
    deletesAt: deletesAt ? deletesAt.toISOString() : null,
    batch: row.batch ?? null,
    inviteCount: typeof row.invite_count === "number" ? row.invite_count : 0,
    joinedHandle: status === "joined" ? joinedHandle : null,
  };
}

// ---------------------------------------------------------------------------
// The daily email budget
// ---------------------------------------------------------------------------

/**
 * Two budgets, so the public form can never spend the founders' sends (the
 * review's top finding). `WAITLIST_EMAIL_DAILY_CAP` counts only access-code
 * emails (`waitlist_invite`); `WAITLIST_CONFIRM_DAILY_CAP` counts only the
 * form's confirm emails (`waitlist_confirm`). Each is a trailing 24 hours.
 */
export const DEFAULT_WAITLIST_DAILY_CAP = 40;
export const DEFAULT_WAITLIST_CONFIRM_DAILY_CAP = 30;
const MAX_WAITLIST_DAILY_CAP = 10_000;

/** A whole number of emails (0 allowed: it stops every send), else the fallback. */
export function parseDailyCap(raw: string | null | undefined, fallback: number = DEFAULT_WAITLIST_DAILY_CAP): number {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,6}$/.test(v)) return fallback;
  return Math.min(Number(v), MAX_WAITLIST_DAILY_CAP);
}

/** Emails left in the trailing 24 hours; never below zero, and zero for nonsense. */
export function remainingBudget(used: number, cap: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(cap)) return 0;
  return Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(used)));
}

// ---------------------------------------------------------------------------
// Admin route input checks. Failures carry the `adminFail` code and copy.
// ---------------------------------------------------------------------------

/** Most people one "Send codes" press may invite. */
export const WAITLIST_INVITE_MAX = 25;
// C0/C1 controls and the bidi overrides and isolates (form.ts's rule).
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;
// A local part with no space, quote, bracket or separator; the DB wants one "@".
const LOCAL_RE = /^[^\s@"(),:;<>[\]\\]{1,64}$/;

export type AdminInputError = { ok: false; code: string; error: string };

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function cleanText(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(CONTROL_RE, " ").trim() : "";
}

/**
 * A batch name: trimmed and lowercased, spaces and underscores become one
 * hyphen ("Officers 1" is `officers-1`), then the wave rule
 * (`WAITLIST_BATCH_RE`: wave, officers, clubs, friends or test, a hyphen and
 * 1-3 digits; the `waitlist.batch` and `user_cohorts.batch` CHECKs). Never
 * free text: the batch outlives the entry. Blank is null, or an error when
 * `required`.
 */
export function parseBatch(raw: unknown, required: boolean): { ok: true; batch: string | null } | AdminInputError {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return required
      ? { ok: false, code: "invalid_batch", error: "Name the batch." }
      : { ok: true, batch: null };
  }
  const v = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  if (!WAITLIST_BATCH_RE.test(v)) {
    return {
      ok: false,
      code: "invalid_batch",
      error: "A batch is a word and a number: wave-1, officers-1, clubs-1, friends-1 or test-1.",
    };
  }
  return { ok: true, batch: v };
}

/** `POST /api/admin/waitlist/invite`: `{ ids: 1-25 row ids, batch }`. Repeats count once. */
export function parseInviteRequest(raw: unknown): { ok: true; ids: string[]; batch: string } | AdminInputError {
  if (!isObject(raw)) return { ok: false, code: "invalid_body", error: "Invalid request" };
  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, code: "invalid_ids", error: "Pick at least one person." };
  }
  if (ids.length > WAITLIST_INVITE_MAX) {
    return { ok: false, code: "too_many", error: `Send codes to at most ${WAITLIST_INVITE_MAX} people at a time.` };
  }
  if (!ids.every((id) => isUuid(id))) return { ok: false, code: "invalid_ids", error: "Invalid id" };
  const batch = parseBatch(raw.batch, true);
  if (!batch.ok) return batch;
  const unique = [...new Set(ids.map((id) => (id as string).toLowerCase()))];
  return { ok: true, ids: unique, batch: batch.batch as string };
}

/** `POST /api/admin/waitlist/[id]/send-code`: an optional `{ batch }`; no body at all is fine. */
export function parseSendCodeRequest(raw: unknown): { ok: true; batch: string | null } | AdminInputError {
  if (raw === undefined || raw === null) return { ok: true, batch: null };
  if (!isObject(raw)) return { ok: false, code: "invalid_body", error: "Invalid request" };
  return parseBatch(raw.batch, false);
}

export type AdminAddValue = {
  /** Lowercased and trimmed (`normalizeSchoolEmail` form). The address mail goes to. */
  email: string;
  emailKey: string;
  schoolSystem: "iu" | "purdue" | null;
  name: string;
  isOfficer: boolean;
  officerClub: string | null;
  clubs: string | null;
  issueCode: boolean;
  batch: string | null;
};

/**
 * `POST /api/admin/waitlist/add`. Any real address, not only a school one
 * (officers write in from Gmail); a retired IU address is refused because
 * mail to it never arrives. `officerClub` is kept only for an officer.
 */
export function parseAddRequest(raw: unknown): { ok: true; value: AdminAddValue } | AdminInputError {
  if (!isObject(raw)) return { ok: false, code: "invalid_body", error: "Invalid request" };
  const typed = cleanText(raw.email);
  const email = typed.length <= WAITLIST_LIMITS.email ? normalizeSchoolEmail(typed) : null;
  const local = email ? email.slice(0, email.lastIndexOf("@")) : "";
  const host = email ? email.slice(email.lastIndexOf("@") + 1) : "";
  if (!email || !LOCAL_RE.test(local) || !host.includes(".")) {
    return { ok: false, code: "invalid_email", error: "That doesn't look like an email address." };
  }
  if (retiredIuDomainFor(email)) {
    const rejection = schoolEmailRejection(email, { context: "request" });
    return { ok: false, code: "invalid_email", error: rejection?.error ?? "Use an @iu.edu address." };
  }
  const emailKey = waitlistEmailKey(email);
  if (!emailKey) return { ok: false, code: "invalid_email", error: "That doesn't look like an email address." };

  const name = cleanText(raw.name);
  const officerClub = cleanText(raw.officerClub);
  const clubs = cleanText(raw.clubs);
  if (!name) return { ok: false, code: "invalid_name", error: "Add their name." };
  const tooLong = (s: string, max: number) => Array.from(s).length > max;
  if (tooLong(name, WAITLIST_LIMITS.name)) {
    return { ok: false, code: "invalid_name", error: `Keep the name under ${WAITLIST_LIMITS.name} characters.` };
  }
  if (tooLong(officerClub, WAITLIST_LIMITS.officerClub)) {
    return { ok: false, code: "invalid_officer_club", error: `Keep the club name under ${WAITLIST_LIMITS.officerClub} characters.` };
  }
  if (tooLong(clubs, WAITLIST_LIMITS.clubs)) {
    return { ok: false, code: "invalid_clubs", error: `Keep the clubs under ${WAITLIST_LIMITS.clubs} characters.` };
  }
  const batch = parseBatch(raw.batch, false);
  if (!batch.ok) return batch;
  const isOfficer = raw.isOfficer === true;
  return {
    ok: true,
    value: {
      email,
      emailKey,
      schoolSystem: schoolSystemForEmail(email),
      name,
      isOfficer,
      officerClub: isOfficer ? officerClub || null : null,
      clubs: clubs || null,
      issueCode: raw.issueCode === true,
      batch: batch.batch,
    },
  };
}
