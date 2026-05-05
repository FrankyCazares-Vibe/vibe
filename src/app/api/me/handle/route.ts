import { NextResponse } from "next/server";

import {
  HANDLE_COOLDOWN_DAYS,
  handleCooldownDaysLeft,
  validateHandle,
} from "@/lib/profile/handle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { handle?: unknown };

/**
 * Change the signed-in user's handle.
 *
 * Cooldown: 14 days between changes. The first claim (when
 * handle_changed_at IS NULL — i.e., still on the trigger-generated
 * 'u<uuid>' default) is free, so existing users can swap their ugly
 * auto-handle for a real one without waiting.
 *
 * Race-safety: we re-check uniqueness inside the UPDATE by relying on
 * the UNIQUE constraint on users.handle — the SELECT is just for the
 * nicer error message. If the constraint fires we surface "Taken".
 */
export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const v = validateHandle(body.handle);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.reason }, { status: 400 });
  }

  // Read current row for the cooldown check + no-op detection.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("handle,handle_changed_at")
    .eq("id", user.id)
    .single();
  if (meErr || !me) {
    console.error("[me/handle GET self]", meErr);
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  if (me.handle === v.handle) {
    // Same as current → no-op success. Don't bump handle_changed_at,
    // otherwise opening the editor and saving without changing anything
    // would re-arm the cooldown.
    return NextResponse.json({ ok: true, handle: v.handle, unchanged: true });
  }

  const daysLeft = handleCooldownDaysLeft(me.handle_changed_at);
  if (daysLeft > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `You can change your handle again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        cooldown_days_left: daysLeft,
      },
      { status: 429 },
    );
  }

  // Quick uniqueness check for a friendly error; the UNIQUE constraint
  // is the actual gate.
  const { data: taken, error: takenErr } = await supabase
    .from("users")
    .select("id")
    .eq("handle", v.handle)
    .maybeSingle();
  if (takenErr) {
    console.error("[me/handle PATCH check]", takenErr);
    return NextResponse.json({ ok: false, error: takenErr.message }, { status: 500 });
  }
  if (taken && taken.id !== user.id) {
    return NextResponse.json({ ok: false, error: "Taken" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("users")
    .update({ handle: v.handle, handle_changed_at: nowIso })
    .eq("id", user.id);

  if (upErr) {
    if (/duplicate key|unique constraint/i.test(upErr.message ?? "")) {
      return NextResponse.json({ ok: false, error: "Taken" }, { status: 409 });
    }
    if (/check constraint/i.test(upErr.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "Letters, numbers, and underscore only" },
        { status: 400 },
      );
    }
    console.error("[me/handle PATCH]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    handle: v.handle,
    handle_changed_at: nowIso,
    cooldown_days: HANDLE_COOLDOWN_DAYS,
  });
}
