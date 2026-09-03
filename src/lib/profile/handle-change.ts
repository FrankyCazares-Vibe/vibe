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

/**
 * Single code path for changing a user's handle. Used by /api/me/handle and
 * the `handle` branch of /api/me/profile so both share the same format rules,
 * reserved list, and 14-day cooldown.
 *
 * Writes go through the service role: `users.handle` / `handle_changed_at`
 * are no longer self-updatable via RLS (a direct PostgREST update could
 * otherwise skip the cooldown and the reserved list).
 */
export async function changeHandleForUser(
  userId: string,
  rawHandle: unknown,
): Promise<HandleChangeResult> {
  const v = validateHandle(rawHandle);
  if (!v.ok) {
    return { ok: false, status: 400, error: v.reason };
  }

  const service = createSupabaseServiceClient();

  const { data: me, error: meErr } = await service
    .from("users")
    .select("handle,handle_changed_at")
    .eq("id", userId)
    .single();
  if (meErr || !me) {
    console.error("[handle-change read self]", meErr);
    return { ok: false, status: 404, error: "Profile not found" };
  }

  if (me.handle === v.handle) {
    // No-op: don't re-arm the cooldown for a save-without-change.
    return { ok: true, handle: v.handle, unchanged: true };
  }

  const daysLeft = handleCooldownDaysLeft(me.handle_changed_at);
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
    .update({ handle: v.handle, handle_changed_at: nowIso })
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

  return {
    ok: true,
    handle: v.handle,
    unchanged: false,
    handle_changed_at: nowIso,
    cooldown_days: HANDLE_COOLDOWN_DAYS,
  };
}
