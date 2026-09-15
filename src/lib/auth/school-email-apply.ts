import "server-only";

import {
  isSchoolEmail,
  schoolEmailDomainsLabel,
} from "@/lib/auth/school-email-token";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ApplyResult = {
  status: 200 | 400 | 409 | 500;
  body: { ok: boolean; message?: string; error?: string };
};

/**
 * P1-006 — write users.school_email + school_verified (service role) once the
 * caller has proven inbox access, by link (confirm) or typed code
 * (confirm-code). Both routes authenticate the session and bind the proof to
 * `userId` BEFORE calling this; nothing here checks who is asking.
 *
 * `email` must already be canonical (normalizeSchoolEmail / token payload).
 */
export async function applySchoolEmailVerification(
  userId: string,
  email: string,
): Promise<ApplyResult> {
  const admin = createSupabaseServiceClient();

  // Idempotent: a re-click of an already-consumed link is a no-op.
  const { data: current } = await admin
    .from("users")
    .select("school_email, school_verified")
    .eq("id", userId)
    .maybeSingle();

  if (
    current?.school_verified === true &&
    typeof current.school_email === "string" &&
    current.school_email.toLowerCase() === email
  ) {
    return { status: 200, body: { ok: true, message: "School email verified." } };
  }

  // Re-check the allowlist before writing: a token minted before the list
  // changed (48h TTL) must not verify an address that is no longer allowed.
  // Sits after the idempotent branch so already-verified rows are untouched.
  if (!isSchoolEmail(email)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `That address isn't an IU email (${schoolEmailDomainsLabel()}). Request a new link with your IU address.`,
      },
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

  const { error } = await admin
    .from("users")
    .update({
      school_email: email,
      school_verified: true,
    })
    .eq("id", userId);

  if (error) {
    console.error("[school-email/apply]", error);
    return { status: 500, body: { ok: false, error: "Could not update profile." } };
  }

  return { status: 200, body: { ok: true, message: "School email verified." } };
}
