import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lightweight stats for the campus banner: total users on Vibe + how
 * many were pinging the heartbeat in the last 5 minutes ("active now").
 * Auth required so we don't leak the headcount to scrapers.
 *
 * Two `count: "exact", head: true` queries in parallel — cheap enough
 * to hit on every mount + the banner's 30s poll. If we later school-
 * scope the campus header, add a `?school=...` param and chain it onto
 * both queries.
 */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const [totalRes, activeRes] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("last_active_at", activeSince),
  ]);
  const firstErr = totalRes.error ?? activeRes.error;
  if (firstErr) {
    console.error("[stats/campus]", firstErr);
    return NextResponse.json({ ok: false, error: firstErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    totalUsers: totalRes.count ?? 0,
    activeNow: activeRes.count ?? 0,
    active_window_minutes: ACTIVE_WINDOW_MS / 60000,
  });
}
