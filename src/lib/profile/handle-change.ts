import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import {
  HANDLE_COOLDOWN_DAYS,
  handleCooldownDaysLeft,
  validateHandle,
} from "@/lib/profile/handle";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type HandleChangeResult =
  | { ok: true; handle: string; unchanged: true }
  | { ok: true; handle: string; unchanged: false; handle_changed_at: string; cooldown_days: number }
  | { ok: false; status: number; error: string; cooldown_days_left?: number };

export type ChangeHandleOptions = {
  /**
   * The onboarding profile step (plan §3.3). While the user's onboarding is
   * NOT complete (`otto_answers` empty), skip the 14-day cooldown and write
   * `handle_changed_at = null`, so Back-and-edit stays free and the cooldown
   * starts at Finish (onboarding-complete stamps it). Once onboarding is
   * complete this flag changes nothing: same cooldown, same stamp.
   */
  onboarding?: boolean;
};

/** A claim made during onboarding: the handle is on the row, the cooldown clock is not started. */
export type HandleClaimedDuringOnboarding = {
  ok: true;
  handle: string;
  unchanged: false;
  handle_changed_at: null;
  cooldown_days: 0;
  onboarding: true;
};

/** Every result the options form of {@link changeHandleForUser} can return. */
export type ChangeHandleResult = HandleChangeResult | HandleClaimedDuringOnboarding;

export type HandleClaimPolicyInput = {
  onboarding?: boolean;
  /** `users.otto_answers` (only read for an onboarding claim). */
  ottoAnswers?: unknown;
  handleChangedAt: string | null | undefined;
};

export type HandleClaimPolicy =
  /** Onboarding claim before Finish: no cooldown check, write `handle_changed_at = null`. */
  | { freeClaim: true; cooldownDaysLeft: 0 }
  /** Every other change: the 14-day cooldown applies, write `handle_changed_at = now`. */
  | { freeClaim: false; cooldownDaysLeft: number };

/**
 * The cooldown / stamp decision for a handle change. Pure. A claim is free
 * only when it is an onboarding claim AND onboarding isn't complete
 * (`otto_answers` empty); otherwise it is exactly the default path.
 */
export function handleClaimPolicy(input: HandleClaimPolicyInput): HandleClaimPolicy {
  if (input.onboarding === true && !isOttoOnboardingComplete(input.ottoAnswers)) {
    return { freeClaim: true, cooldownDaysLeft: 0 };
  }
  return { freeClaim: false, cooldownDaysLeft: handleCooldownDaysLeft(input.handleChangedAt) };
}

/**
 * Single code path for changing a user's handle. Used by /api/me/handle and
 * the `handle` branch of /api/me/profile so both share the same format rules,
 * reserved list, and 14-day cooldown, and by /api/me/onboarding-step with
 * `{ onboarding: true }` (see {@link ChangeHandleOptions}).
 *
 * Writes go through the service role: `users.handle` / `handle_changed_at`
 * are no longer self-updatable via RLS (a direct PostgREST update could
 * otherwise skip the cooldown and the reserved list).
 */
export function changeHandleForUser(userId: string, rawHandle: unknown): Promise<HandleChangeResult>;
export function changeHandleForUser(
  userId: string,
  rawHandle: unknown,
  options: ChangeHandleOptions,
): Promise<ChangeHandleResult>;
export async function changeHandleForUser(
  userId: string,
  rawHandle: unknown,
  options: ChangeHandleOptions = {},
): Promise<ChangeHandleResult> {
  const v = validateHandle(rawHandle);
  if (!v.ok) {
    return { ok: false, status: 400, error: v.reason };
  }

  const service = createSupabaseServiceClient();
  const onboardingClaim = options.onboarding === true;

  // The default select is unchanged; only an onboarding claim also needs to
  // know whether onboarding is finished (`otto_answers` is service-role only).
  const selfColumns: string = onboardingClaim
    ? "handle,handle_changed_at,otto_answers"
    : "handle,handle_changed_at";
  const { data: meRow, error: meErr } = await service
    .from("users")
    .select(selfColumns)
    .eq("id", userId)
    .single();
  const me = meRow as
    | { handle: string | null; handle_changed_at: string | null; otto_answers?: unknown }
    | null;
  if (meErr || !me) {
    console.error("[handle-change read self]", meErr);
    return { ok: false, status: 404, error: "Profile not found" };
  }

  if (me.handle === v.handle) {
    // No-op: don't re-arm the cooldown for a save-without-change.
    return { ok: true, handle: v.handle, unchanged: true };
  }

  // Free, clock-off claim only while onboarding is genuinely unfinished. A
  // Finish landing between this read and the write below can at worst leave
  // one handle change without a cooldown stamp; the step route's 30 / 10 min
  // limiter bounds that.
  const { freeClaim, cooldownDaysLeft: daysLeft } = handleClaimPolicy({
    onboarding: onboardingClaim,
    ottoAnswers: me.otto_answers,
    handleChangedAt: me.handle_changed_at,
  });
  if (daysLeft > 0) {
    return {
      ok: false,
      status: 429,
      error: `You can change your handle again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      cooldown_days_left: daysLeft,
    };
  }

  const { data: taken, error: takenErr } = await service
    .from("users")
    .select("id")
    .eq("handle", v.handle)
    .maybeSingle();
  if (takenErr) {
    console.error("[handle-change check]", takenErr);
    return { ok: false, status: 500, error: "Could not check handle" };
  }
  if (taken && taken.id !== userId) {
    return { ok: false, status: 409, error: "Taken" };
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await service
    .from("users")
    .update({ handle: v.handle, handle_changed_at: freeClaim ? null : nowIso })
    .eq("id", userId);
  if (upErr) {
    if (/duplicate key|unique constraint/i.test(upErr.message ?? "")) {
      return { ok: false, status: 409, error: "Taken" };
    }
    if (/check constraint/i.test(upErr.message ?? "")) {
      return { ok: false, status: 400, error: "Letters, numbers, and underscore only" };
    }
    console.error("[handle-change write]", upErr);
    return { ok: false, status: 500, error: "Could not change handle" };
  }

  if (freeClaim) {
    return {
      ok: true,
      handle: v.handle,
      unchanged: false,
      handle_changed_at: null,
      cooldown_days: 0,
      onboarding: true,
    };
  }

  return {
    ok: true,
    handle: v.handle,
    unchanged: false,
    handle_changed_at: nowIso,
    cooldown_days: HANDLE_COOLDOWN_DAYS,
  };
}
