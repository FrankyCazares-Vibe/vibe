import "server-only";

import {
  schoolEmailRejection,
  schoolSystemForEmail,
  schoolSystemPatch,
  type SchoolSystemPatch,
} from "@/lib/auth/school-email-domains";
import { isMissingColumnError } from "@/lib/db/missing-column";
import {
  restrictionForSchoolIdentity,
  schoolIdentityConflict,
} from "@/lib/moderation/access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ApplyResult = {
  status: 200 | 400 | 403 | 409 | 500 | 503;
  body: { ok: boolean; message?: string; error?: string; code?: string };
};

type DbError = { code?: string; message?: string } | null;

// Deploy safety (plan §5.5): `users.school_system` / `campus_id` arrive with
// migration M1. Until it's applied, verification falls back to the legacy
// columns, but only for missing-column errors that name those columns
// (`isMissingColumnError`), so any other database error still fails loudly.

/** The M1 trigger `users_campus_in_system` rejected the campus for the new system. */
function isCampusNotInSystemError(error: DbError): boolean {
  return Boolean(error?.message?.includes("campus_not_in_system"));
}

let warnedMissingColumns = false;
function warnMissingColumnsOnce(error: DbError) {
  if (warnedMissingColumns) return;
  warnedMissingColumns = true;
  console.warn(
    "[school-email/apply] users.school_system / campus_id missing (migration M1 not applied?); verifying without them",
    error?.code ?? "",
  );
}

type CurrentRow = {
  school_email?: string | null;
  school_verified?: boolean | null;
  school_system?: unknown;
  campus_id?: unknown;
};

/** What a student sees when the address itself is restricted. Nothing about who. */
const RESTRICTED_IDENTITY: ApplyResult = {
  status: 403,
  body: {
    ok: false,
    code: "school_email_restricted",
    error: "This school email can't be used on Vibe. Questions: help@connectvibe.app",
  },
};

/** Can't tell whether this address is restricted right now — so nobody verifies. */
const RESTRICTION_CHECK_DOWN: ApplyResult = {
  status: 503,
  body: {
    ok: false,
    code: "restriction_check_failed",
    error: "We can't check this school email right now. Try again in a few minutes.",
  },
};

/**
 * Refuse a school address that belongs to a suspended or banned student. This
 * is what makes a ban outlive the account: the restriction is keyed on a hash
 * of the ADDRESS, so deleting the account and signing up again still can't
 * re-verify it.
 *
 * Nobody reaches this for free — the request route puts its two rate limits in
 * front of it, and the confirm routes need a signed token for their own
 * account — so it can't be used to ask which addresses are banned.
 *
 * The lookup itself is `restrictionForSchoolIdentity`
 * (src/lib/moderation/access.ts), which is also where the identity key is
 * derived. One derivation, one canonical form: a key that doesn't match the
 * admin side byte for byte is a ban that silently stops working. What this
 * function owns is the two sentences a student reads, so both callers say the
 * same thing:
 *  - restricted → 403 `school_email_restricted`, and nothing about whose it is.
 *  - can't tell (no pepper while some address IS restricted, or the read
 *    failed) → 503. A few minutes of "try again" beats handing a banned
 *    student their school email back.
 * A missing `account_restrictions` table is neither: code deploys before the
 * migration, so nothing is restricted yet and verification carries on.
 */
export async function schoolIdentityRestrictionGate(
  email: string,
): Promise<ApplyResult | null> {
  const check = await restrictionForSchoolIdentity(email);
  if (!check.ok) return RESTRICTION_CHECK_DOWN;
  return check.restricted ? RESTRICTED_IDENTITY : null;
}

/**
 * P1-006 — write users.school_email + school_verified (service role) once the
 * caller has proven inbox access, by link (confirm) or typed code
 * (confirm-code). Both routes authenticate the session and bind the proof to
 * `userId` BEFORE calling this; nothing here checks who is asking.
 *
 * `email` must already be canonical (normalizeSchoolEmail / token payload).
 *
 * Also stamps `users.school_system` from the domain (plan §2.1). Replacing a
 * verified address with one from the OTHER system is allowed (Franky Q1: a
 * Purdue Indianapolis student who verified with @iu.edu switches to
 * @purdue.edu); `schoolSystemPatch` keeps a shared campus, clears any other,
 * and never touches `campus_set_at` (critic B3).
 */
export async function applySchoolEmailVerification(
  userId: string,
  email: string,
): Promise<ApplyResult> {
  const admin = createSupabaseServiceClient();

  // Before M1 the new columns don't exist; read (and later write) without them.
  let legacyColumns = false;
  let { data: current, error: currentErr } = (await admin
    .from("users")
    .select("school_email, school_verified, school_system, campus_id")
    .eq("id", userId)
    .maybeSingle()) as { data: CurrentRow | null; error: DbError };
  if (isMissingColumnError(currentErr)) {
    warnMissingColumnsOnce(currentErr);
    legacyColumns = true;
    ({ data: current, error: currentErr } = (await admin
      .from("users")
      .select("school_email, school_verified")
      .eq("id", userId)
      .maybeSingle()) as { data: CurrentRow | null; error: DbError });
  }

  // Idempotent: a re-click of an already-consumed link is a no-op.
  if (
    current?.school_verified === true &&
    typeof current.school_email === "string" &&
    current.school_email.toLowerCase() === email
  ) {
    // Rows verified between M1 and this deploy have no system yet; stamp it
    // (best effort, only while still null) so the campus step can use it.
    // It's a fact about an address already verified, so not flag-gated.
    const system = schoolSystemForEmail(email, { purdueEnabled: true });
    if (!legacyColumns && current.school_system == null && system) {
      const { error: stampErr } = await admin
        .from("users")
        .update({ school_system: system })
        .eq("id", userId)
        .is("school_system", null);
      if (stampErr) console.error("[school-email/apply] stamp system", stampErr);
    }
    return { status: 200, body: { ok: true, message: "School email verified." } };
  }

  // Re-check the allowlist before writing: a token minted before the list
  // changed (48h TTL) must not verify an address that is no longer allowed.
  // Sits after the idempotent branch so already-verified rows are untouched.
  const rejection = schoolEmailRejection(email, { context: "verify" });
  const system = rejection ? null : schoolSystemForEmail(email);
  if (!system) {
    const denied =
      rejection ?? schoolEmailRejection(email, { context: "verify", domains: [] });
    return {
      status: 400,
      body: { ok: false, code: denied?.code, error: denied?.error },
    };
  }

  // Canonical, not exact: an exact match let the same student verify
  // `name+2@iu.edu` on a second account. Same status and same sentence as
  // before — clients match on both — plus a `code` they can branch on.
  const conflict = await schoolIdentityConflict(email, userId);
  if (!conflict.ok) {
    // The message is already logged where the read failed; repeating it here
    // would put a school address next to it.
    return { status: 500, body: { ok: false, error: "Could not update profile." } };
  }
  // The scan only reads rows that are already VERIFIED; `users_school_email_key`
  // is a plain unique index on the raw text and doesn't care. A row holding
  // this exact address unverified would pass the scan and then fail inside the
  // UPDATE below as a 500. One indexed lookup, only when the scan found
  // nothing, keeps it the sentence a student can act on.
  let takenBy = conflict.takenBy;
  if (!takenBy) {
    const { data: exact, error: exactErr } = (await admin
      .from("users")
      .select("id")
      .eq("school_email", email)
      .neq("id", userId)
      .maybeSingle()) as { data: { id: string } | null; error: DbError };
    if (exactErr) {
      // Code only: this query was filtered on a school address, and the error
      // text can carry it back.
      console.error("[school-email/apply] address lookup", exactErr.code);
      return { status: 500, body: { ok: false, error: "Could not update profile." } };
    }
    takenBy = exact?.id ?? null;
  }

  if (takenBy) {
    return {
      status: 409,
      body: {
        ok: false,
        code: "school_email_taken",
        error: "That school email was claimed by another account.",
      },
    };
  }

  // Links stay good for 48 hours, so an address can be banned between the
  // send and the click. Both confirm routes come through here, which is why
  // the check lives here and not only in the request route.
  const restricted = await schoolIdentityRestrictionGate(email);
  if (restricted) return restricted;

  const base = { school_email: email, school_verified: true };
  const systemPatch: SchoolSystemPatch | null = legacyColumns
    ? null
    : schoolSystemPatch(current, system);

  let { error } = await admin
    .from("users")
    .update({ ...base, ...systemPatch })
    .eq("id", userId);

  // The DB is the authority on which campuses a system may use: if the
  // trigger disagrees with the campus lib, clear the campus (the same rule,
  // applied by the DB) rather than failing verification.
  if (error && systemPatch && isCampusNotInSystemError(error)) {
    const cleared: SchoolSystemPatch = { ...systemPatch, campus_id: null };
    if ("school" in systemPatch) cleared.school = "";
    ({ error } = await admin
      .from("users")
      .update({ ...base, ...cleared })
      .eq("id", userId));
  }

  // Pre-M1 production: same update without the new columns.
  if (error && systemPatch && isMissingColumnError(error)) {
    warnMissingColumnsOnce(error);
    ({ error } = await admin.from("users").update(base).eq("id", userId));
  }

  if (error) {
    console.error("[school-email/apply]", error);
    return { status: 500, body: { ok: false, error: "Could not update profile." } };
  }

  return { status: 200, body: { ok: true, message: "School email verified." } };
}
