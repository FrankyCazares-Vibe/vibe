import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/profile-views — counts + recent viewer list for the signed-in
 * user's profile. Three numbers (today / 7d / 30d / all-time) and a recent-
 * viewer list capped at 25.
 *
 * Premium gate (future): the COUNT is free, the VIEWER LIST gets gated
 * behind a `premium` flag once we wire billing. For now we return the
 * viewer list to everyone but stamp `premium: false` so the client can
 * choose to blur / lock the names in the UI — the data layer already
 * supports the eventual paywall without a schema churn.
 *
 * Hot-path read; ~3 SQL roundtrips. Owners only — RLS does the rest.
 */
const RECENT_LIMIT = 25;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // All-time counter: denormalized on users.profile_view_count.
  const meRes = await supabase
    .from("users")
    .select("profile_view_count")
    .eq("id", user.id)
    .maybeSingle();
  const allTime = (meRes.data?.profile_view_count as number | null) ?? 0;

  // Window helpers in UTC — match the `viewed_on` column semantics in
  // the dedupe ledger. Dates are stored without a time component there.
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayDate = iso(utcToday);
  const sevenDaysAgo = iso(new Date(utcToday.getTime() - 6 * 86400000));
  const thirtyDaysAgo = iso(new Date(utcToday.getTime() - 29 * 86400000));

  const [todayRes, sevenRes, thirtyRes, recentRes] = await Promise.all([
    supabase
      .from("profile_views")
      .select("viewer_user_id", { count: "exact", head: true })
      .eq("profile_user_id", user.id)
      .gte("viewed_on", todayDate),
    supabase
      .from("profile_views")
      .select("viewer_user_id", { count: "exact", head: true })
      .eq("profile_user_id", user.id)
      .gte("viewed_on", sevenDaysAgo),
    supabase
      .from("profile_views")
      .select("viewer_user_id", { count: "exact", head: true })
      .eq("profile_user_id", user.id)
      .gte("viewed_on", thirtyDaysAgo),
    supabase
      .from("profile_views")
      .select(
        "viewer_user_id,viewed_on,first_viewed_at," +
          "viewer:users!profile_views_viewer_user_id_fkey(id,handle,name,avatar_url)",
      )
      .eq("profile_user_id", user.id)
      .order("first_viewed_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  type RecentRow = {
    viewer_user_id: string;
    viewed_on: string;
    first_viewed_at: string;
    viewer: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
  };
  const recent = ((recentRes.data ?? []) as unknown as RecentRow[])
    .filter((r) => r.viewer)
    .map((r) => ({
      id: r.viewer!.id,
      handle: r.viewer!.handle,
      name: r.viewer!.name,
      avatar_url: r.viewer!.avatar_url,
      viewed_on: r.viewed_on,
      first_viewed_at: r.first_viewed_at,
    }));

  return NextResponse.json({
    ok: true,
    counts: {
      today: todayRes.count ?? 0,
      seven_days: sevenRes.count ?? 0,
      thirty_days: thirtyRes.count ?? 0,
      all_time: allTime,
    },
    recent,
    /** When the premium paywall ships, set this from the user's billing
     * tier. Today everyone is `false` and clients can show a "premium soon"
     * teaser over the recent-viewer list. */
    premium: false,
  });
}
