import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Counts for the Otto corner-ring dot AND the stats tiles.
 *
 * Returns:
 *   - `unread` — total unread notifications (drives the corner-ring dot)
 *   - `totals` — per-type breakdown for the last 30 days, used by the
 *               profile hero status line and the side-panel stats grid
 *
 * Five small COUNT queries instead of one keeps each cheap and lets
 * Postgres use the existing indexes. Polled every ~30s by Otto so we
 * keep this fast.
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

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const countByType = (t: string) =>
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", t)
      .gte("created_at", since);

  const [unreadRes, followRes, connRes, likeRes, commentRes, mentionRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    countByType("follow"),
    countByType("connection"),
    countByType("like"),
    countByType("comment"),
    countByType("mention"),
  ]);

  const firstErr = [unreadRes, followRes, connRes, likeRes, commentRes, mentionRes].find(
    (r) => r.error,
  )?.error;
  if (firstErr) {
    console.error("[me/notifications/count]", firstErr);
    return NextResponse.json({ ok: false, error: firstErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    unread: unreadRes.count ?? 0,
    totals: {
      follow:     followRes.count  ?? 0,
      connection: connRes.count    ?? 0,
      like:       likeRes.count    ?? 0,
      comment:    commentRes.count ?? 0,
      mention:    mentionRes.count ?? 0,
    },
    window_days: 30,
  });
}
