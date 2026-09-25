import { NextResponse } from "next/server";

import { loadBadgeCounts } from "@/lib/push/badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/badge — the number for the app icon (plan §7 2D).
 *
 * `{ ok: true, total, notifications, messages }`: unread notifications plus
 * unread DM and group threads, by the one rule in src/lib/push/badge.ts that
 * every push also carries. The app asks on focus and after marking things
 * read, so the icon clears without waiting for the next push.
 *
 * Read-only, like /api/me/notifications/count: no rate limit and no Terms or
 * restriction gate (a restricted student may still read what they have). It
 * reads with the student's own client, so RLS scopes every row to them.
 * Fails closed: a read error is a 500, never a made-up zero.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const counts = await loadBadgeCounts(supabase, user.id);
  if (!counts.ok) {
    console.error("[me/badge]", counts.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    total: counts.total,
    notifications: counts.notifications,
    messages: counts.messages,
  });
}
