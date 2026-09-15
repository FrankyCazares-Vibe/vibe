import "server-only";

import {
  schoolEmailRejection,
  schoolSystemForEmail,
  schoolSystemPatch,
  type SchoolSystemPatch,
} from "@/lib/auth/school-email-domains";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ApplyResult = {
  status: 200 | 400 | 409 | 500;
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

  const { data: taken } = await admin
    .from("users")
    .select("id")
    .eq("school_email", email)
    .maybeSingle();

  if (taken && taken.id !== userId) {
    return {
      status: 409,
      body: { ok: false, error: "That school email was claimed by another account." },
    };
  }

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
