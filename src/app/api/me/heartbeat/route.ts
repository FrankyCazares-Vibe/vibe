import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Heartbeat — bumps `users.last_active_at` for the signed-in viewer.
 *
 * Called by the campus banner on mount + every ~30s while the tab is
 * visible. Drives the "X active now" stats line by giving the campus
 * stats endpoint something to actually count. RLS already allows users
 * to UPDATE their own row, so no extra policy needed.
 *
 * No body, no response data — just `{ ok }`. Failures are silent on the
 * client; missing a beat for one cycle just makes the user fall out of
 * "active now" until the next ping.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("users")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    console.error("[me/heartbeat]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
