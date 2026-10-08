import "server-only";

import { applySchoolEmailVerification } from "@/lib/auth/school-email-apply";
import { isSchoolEmail } from "@/lib/auth/school-email-domains";
import { normalizeSchoolEmail } from "@/lib/auth/school-email-token";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * School email first (S75, Franky): a person signs up WITH their school
 * email, so confirming that sign-up IS the school check. No second email, no
 * second code.
 *
 * Called by every gate that would otherwise send an unverified account to
 * the "verify your school email" screen (`enforceCampusAccess`,
 * `enforceSchoolEmailPage`, GET /api/me/onboarding-state). When the
 * account's own sign-in email is a school address AND the sign-in system has
 * confirmed it (the typed code or the tapped link, `email_confirmed_at`), it
 * writes the school email the same way the school-email routes do
 * (`applySchoolEmailVerification`: one account per address, the ban check,
 * the school system) and answers true.
 *
 * False for everything else, and the caller carries on as before: a personal
 * sign-in email (every account made before this, the review accounts), an
 * unconfirmed one, an address another account already verified, a banned
 * address, a server that cannot check. Never throws.
 *
 * The proof is the same one the school screen asks for: control of that
 * inbox. `email_confirmed_at` is read from the session's user as the
 * sign-in system reports it, never from the request.
 */
export async function verifySchoolFromSignInEmail(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<boolean> {
  try {
    if (!user.email || !user.email_confirmed_at) return false;
    if (!isSchoolEmail(user.email)) return false;
    const email = normalizeSchoolEmail(user.email);
    if (!email) return false;
    if (!isSupabaseServiceConfigured()) return false;
    const result = await applySchoolEmailVerification(user.id, email);
    if (result.status !== 200 || !result.body.ok) {
      // The status and code only: never the address.
      console.error("[school-sign-in] not applied", result.status, result.body.code ?? "");
      return false;
    }
    return true;
  } catch (err) {
    console.error("[school-sign-in]", err instanceof Error ? err.message : "failed");
    return false;
  }
}
