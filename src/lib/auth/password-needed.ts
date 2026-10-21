import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";

/**
 * "Does this account still owe a password?" (pre-registration fix, Oct 2026).
 *
 * Anyone could sign up with a student's school address before the student
 * did, and choose the password. The database now removes that password at
 * the first confirmation of the address (`auth_hooks.first_confirm_drops_password`,
 * migration 20261022110000), because whoever chose it had not proven the
 * inbox; the confirmation just did. The same trigger stamps
 * `public.users.password_needed_at` and clears the first signer's Terms tick.
 *
 * These two reads only FINISH setup: `/auth/terms` sends a flagged account
 * with no password to the choose screen, and `POST /api/me/accept-terms`
 * refuses consent until a password exists. The database wipe is the
 * security, so every doubt here reads as "nothing owed" and nobody is ever
 * detoured on a guess. No hot page gate reads either one.
 *
 * Service role only: the column has no grants to the API roles, and the
 * function refuses `anon` and `authenticated` from inside.
 */

const FLAG_COLUMN = "password_needed_at";

/**
 * The time a first confirmation removed an early password, or null.
 *
 * ANY read error (the column not there yet, before migration 20261022100000,
 * or a blip) reads as "nothing owed". A separate one-column read on purpose:
 * no existing select changes, so nothing else can break while the column is
 * missing. The missing column is expected during a deploy and stays quiet;
 * anything else is logged.
 */
export async function readPasswordFlag(service: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await service.from("users").select(FLAG_COLUMN).eq("id", userId).maybeSingle();
    if (error) {
      if (!isMissingColumnError(error, [FLAG_COLUMN])) {
        console.warn("[password-needed] flag read failed", error.code ?? error.message);
      }
      return null;
    }
    const value = (data as Record<string, unknown> | null)?.[FLAG_COLUMN];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch (err) {
    console.warn("[password-needed] flag read threw", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Is there no password stored for this account right now?
 *
 * true = none stored; false = one exists; null = could not tell (an error,
 * or an answer that is not a boolean). Callers do not detour on null.
 * Runs `public.account_password_missing`, which only the service role may
 * call (it reads `auth.users`, which the API never exposes).
 */
export async function passwordMissing(service: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await service.rpc("account_password_missing", { p_user: userId });
    if (error) {
      console.warn("[password-needed] password check failed", error.code ?? error.message);
      return null;
    }
    return typeof data === "boolean" ? data : null;
  } catch (err) {
    console.warn("[password-needed] password check threw", err instanceof Error ? err.message : err);
    return null;
  }
}
