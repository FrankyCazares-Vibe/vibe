import "server-only";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * Is sign-up open for everyone? The launch switch is the `signup_open` row of
 * `public.app_settings` (one SQL update, no deploy); the database gate
 * (`auth_hooks.hook_waitlist_gate`) reads the same row, so this only decides what
 * the site's buttons say. It never lets anyone in.
 *
 * `override` (the dev-only `?signup=` value from `parseSignupOverride`) wins
 * when it is not null. Otherwise `public.signup_is_open()` is asked through
 * the service client, remembered for 30 seconds per server instance (a plain
 * module memo; no Next cache API). No service key, an error or a non-boolean
 * answer all mean false, the closed wording, and are not remembered, so the
 * next request asks again.
 */
const MEMO_MS = 30_000;

let memo: { value: boolean; at: number } | null = null;
let inFlight: Promise<boolean> | null = null;

async function readSwitch(): Promise<boolean | null> {
  if (!isSupabaseServiceConfigured()) return null;
  try {
    const { data, error } = await createSupabaseServiceClient().rpc("signup_is_open");
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

export async function isSignupOpen(override?: boolean | null): Promise<boolean> {
  if (override === true || override === false) return override;
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return memo.value;
  if (!inFlight) {
    inFlight = readSwitch()
      .then((value) => {
        if (value === null) return false;
        memo = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
