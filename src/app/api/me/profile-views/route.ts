import { NextResponse } from "next/server";

import { hasPlus } from "@/lib/premium/require-plus";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/me/profile-views — how many people looked at your profile, and,
 * for Vibe+, who they were.
 *
 * "Counts are public, identities are private" (design principle 05), settled
 * for money in handoffs/2026-09-12-decisions.md §1 and §4. The counts are free
 * forever and exact. The viewer NAMES are the paid half, and a free account
 * does not receive them: `recent` is ABSENT FROM THE RESPONSE BODY, not
 * blurred by the client. Blurring client-side would leave every viewer's name
 * and avatar sitting in the network tab — a privacy failure, not just a
 * paywall hole. This is also why the free branch never joins `users` at all.
 *
 * Zero names free, not three: one rule, enforced in one place, no asterisk on
 * the principle.
 *
 *   free   → { counts, premium: false, viewer_identities: "locked", locked_count? }
 *   Vibe+  → { counts, premium: true,  viewer_identities: "visible", recent: [...] }
 *
 * `locked_count` is the number of DISTINCT PEOPLE who looked in the LAST SEVEN
 * DAYS — the same window as the `seven_days` tile, filtered the same way — so
 * the client can say something true ("3 people looked at your profile this
 * week, names locked") while receiving no identity whatsoever.
 *
 * THE WINDOW IS NOT AN IMPLEMENTATION DETAIL. The teaser this feeds is
 * specified as "N people looked at your profile this week", rendered only when
 * N > 0 (handoffs/2026-09-12-design-metrics-screens.md:109), and the decision
 * names the same sentence (handoffs/2026-09-12-decisions.md:39). An all-time
 * distinct count printed beside "Today 0 / 7 days 0" would be a locked row
 * contradicting the tiles next to it — a number the visible data denies.
 *
 * PEOPLE, NOT VIEWS. `counts.seven_days` counts ROWS in the dedupe ledger —
 * one per viewer per day — so one person who looked on Monday and again on
 * Thursday is 2 there and 1 here. The copy must therefore say "people" for
 * this number and "views" for the tile. Different questions, different
 * answers, not a bug.
 *
 * Omitted entirely when the query fails, and when the window holds a full page
 * of rows (see LOCKED_WINDOW_ROW_CAP): no number beats a wrong one. Zero is a
 * real answer and IS sent — absent means "we couldn't work it out", and the
 * client has to be able to tell those two apart.
 *
 * A refused count is a 500, not a zero. Three tiles reading 0 because a query
 * errored is a number the data does not support, and all three clients
 * already render their own "couldn't load" line for a failed read.
 *
 * Owners only — RLS `profile_views_owner_select` scopes every read here to the
 * caller's own profile, so this route cannot leak someone else's viewers even
 * if the entitlement branch were wrong.
 *
 * Hot-path read; 1 auth + 2 parallel + 4 parallel roundtrips.
 */
const RECENT_LIMIT = 25;

/**
 * Safety valve on the free tier's distinct-people count. The ledger's primary
 * key is (profile_user_id, viewer_user_id, viewed_on), so seven days hold at
 * most 7 rows per viewer — this page covers roughly 140 distinct viewers in a
 * week. Nothing on the pilot campus is near it (the busiest profile has 8 rows
 * ALL-TIME, verified live 2026-09-12). If a profile ever does exceed it, the
 * count is omitted rather than silently undercounted.
 */
const LOCKED_WINDOW_ROW_CAP = 1000;

type RecentViewer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  viewed_on: string;
  first_viewed_at: string;
};

/**
 * The paid half of the read, shaped by the entitlement before the query runs.
 * Two different SELECTs on purpose: the free branch asks the database only for
 * viewer ids, which it counts and discards, so the names never enter this
 * process, let alone the response.
 */
type ViewerSlice =
  | { ok: false }
  /** `distinct: null` = the query worked but no exact number can be stated. */
  | { ok: true; locked: true; distinct: number | null }
  | { ok: true; locked: false; recent: RecentViewer[] };

async function loadViewerSlice(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  plus: boolean,
  sevenDaysAgo: string,
): Promise<ViewerSlice> {
  if (!plus) {
    // Same window as the `seven_days` tile, so the locked row and the tile
    // beside it can never contradict each other. No ordering: this is a count
    // over a window, not a "most recent N", and sorting rows that are about to
    // collapse into a Set buys nothing.
    const res = await supabase
      .from("profile_views")
      .select("viewer_user_id")
      .eq("profile_user_id", userId)
      .gte("viewed_on", sevenDaysAgo)
      .limit(LOCKED_WINDOW_ROW_CAP);
    if (res.error) {
      console.error("[me/profile-views] locked count", res.error);
      return { ok: false };
    }
    const rows = (res.data ?? []) as unknown as Array<{ viewer_user_id: string }>;
    // A full page means there may be viewers past the end of it, so no exact
    // number of people can be stated. Say nothing rather than undercount.
    if (rows.length >= LOCKED_WINDOW_ROW_CAP) {
      return { ok: true, locked: true, distinct: null };
    }
    return { ok: true, locked: true, distinct: new Set(rows.map((r) => r.viewer_user_id)).size };
  }

  const res = await supabase
    .from("profile_views")
    .select(
      "viewer_user_id,viewed_on,first_viewed_at," +
        "viewer:users!profile_views_viewer_user_id_fkey(id,handle,name,avatar_url)",
    )
    .eq("profile_user_id", userId)
    .order("first_viewed_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (res.error) {
    console.error("[me/profile-views] recent", res.error);
    return { ok: false };
  }

  type RecentRow = {
    viewer_user_id: string;
    viewed_on: string;
    first_viewed_at: string;
    viewer: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
  };
  const recent = ((res.data ?? []) as unknown as RecentRow[])
    .filter((r) => r.viewer)
    .map((r) => ({
      id: r.viewer!.id,
      handle: r.viewer!.handle,
      name: r.viewer!.name,
      avatar_url: r.viewer!.avatar_url,
      viewed_on: r.viewed_on,
      first_viewed_at: r.first_viewed_at,
    }));
  return { ok: true, locked: false, recent };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // The entitlement decides the shape of the read, so it has to resolve
  // first — run it alongside the all-time counter rather than before it.
  // `hasPlus` never throws and fails closed: an unreadable entitlement is
  // free, which shows fewer names, never more.
  const [plus, meRes] = await Promise.all([
    hasPlus(user.id),
    // All-time counter: denormalized on users.profile_view_count.
    supabase.from("users").select("profile_view_count").eq("id", user.id).maybeSingle(),
  ]);

  // Window helpers in UTC — match the `viewed_on` column semantics in
  // the dedupe ledger. Dates are stored without a time component there.
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayDate = iso(utcToday);
  const sevenDaysAgo = iso(new Date(utcToday.getTime() - 6 * 86400000));
  const thirtyDaysAgo = iso(new Date(utcToday.getTime() - 29 * 86400000));

  const [todayRes, sevenRes, thirtyRes, viewers] = await Promise.all([
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
    loadViewerSlice(supabase, user.id, plus, sevenDaysAgo),
  ]);

  // A count that didn't come back is not a zero. Fail the read so the
  // clients show their "couldn't load" line instead of four honest-looking
  // tiles built out of nothing.
  const countErr = meRes.error || todayRes.error || sevenRes.error || thirtyRes.error;
  if (countErr) {
    console.error("[me/profile-views] counts", countErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const counts = {
    today: todayRes.count ?? 0,
    seven_days: sevenRes.count ?? 0,
    thirty_days: thirtyRes.count ?? 0,
    all_time: (meRes.data?.profile_view_count as number | null) ?? 0,
  };

  if (!plus) {
    // No `recent` key at all. The names are not withheld from the render —
    // they were never fetched, and they are not in this payload to un-blur.
    return NextResponse.json({
      ok: true,
      counts,
      premium: false,
      viewer_identities: "locked",
      ...(viewers.ok && viewers.locked && viewers.distinct !== null
        ? { locked_count: viewers.distinct }
        : {}),
    });
  }

  if (!viewers.ok) {
    // The counts are fine but the paid half isn't. Say so rather than send
    // `recent: []`, which a paying account would read as "nobody looked".
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    counts,
    premium: true,
    viewer_identities: "visible",
    recent: viewers.locked ? [] : viewers.recent,
  });
}
