import { NextResponse } from "next/server";

import { changeHandleForUser } from "@/lib/profile/handle-change";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
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
 * Validation, cooldown, and the write all live in `changeHandleForUser`
 * so /api/me/profile's `handle` branch can't drift from this route.
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

  const rl = await rateLimit(`handle-change:${user.id}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const result = await changeHandleForUser(user.id, body.handle);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.cooldown_days_left !== undefined
          ? { cooldown_days_left: result.cooldown_days_left }
          : {}),
      },
      { status: result.status },
    );
  }
  if (result.unchanged) {
    return NextResponse.json({ ok: true, handle: result.handle, unchanged: true });
  }
  return NextResponse.json({
    ok: true,
    handle: result.handle,
    handle_changed_at: result.handle_changed_at,
    cooldown_days: result.cooldown_days,
  });
}
