import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { legacyLabel } from "@/lib/iu/campuses";
import { feedLaneFor, feedLaneOrFilter } from "@/lib/iu/community-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
const WINDOW_DAYS = 7;
const POST_SCAN_LIMIT = 500;

/**
 * Trending hashtags — the viewer's campus, last 7 days.
 *
 * SCOPE (plan wave 2 B10, §2.4, critic A7). Counts each tag across exactly the
 * posts the FEED'S CAMPUS LANE shows — `feedLaneFor` + `feedLaneOrFilter` in
 * `community-scope.ts`, the one builder for that rule (B9 owns it; the strip
 * and the lane must never drift, which is how this codebase shipped
 * exact-match campus bugs twice, plan §2.1). That means posts stamped with a
 * campus in scope (`posts.campus_id`, set by the `posts_stamp_campus`
 * trigger), PLUS the campus-less legacy posts of the viewer's own university.
 * It no longer joins `users` to compare the legacy `school` label: an author
 * who moves campus doesn't retro-move their old posts, which is what "old
 * posts stay on the campus they were posted to" means (settled §3).
 *
 * The lane's followed-authors clause is deliberately left empty here: a
 * friend's post from another campus is their post, not a trend on yours.
 *
 * Both halves matter today: 10 of the 20 live posts carry `indianapolis`, the
 * other 10 predate M1 and are null-campus forever (the trigger pins null on
 * UPDATE), so dropping them would empty the strip.
 *
 * A viewer with no campus gets every campus in their university plus their
 * own legacy posts, rather than an empty strip (critic A7's definition of
 * scope `none`).
 *
 * We do the aggregation in JS rather than via a Postgres array_agg /
 * unnest function to keep this dependency-free and easy to ship without a
 * migration. At <500 posts/week per campus the cost is negligible; if a
 * campus grows past that, swap to a SQL view.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // `maybeSingle`, not `single`: a viewer with no `users` row got the global
  // strip before this change rather than a 500, and the strip must not start
  // failing on an edge case it used to survive (plan §6 compatibility).
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("campus_id,school_system")
    .eq("id", user.id)
    .maybeSingle();
  // M1 unapplied on this database: fall back to the global top tags, which is
  // exactly what a campus-less viewer saw before this change. Narrow on
  // purpose — any other error is a real failure.
  const campusReady = !(meErr && isMissingColumnError(meErr));
  if (meErr && campusReady) {
    console.error("[trending/hashtags me]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const viewer = scopeViewerFromRow(campusReady ? (me as Record<string, unknown> | null) : null);
  const scope = campusReady ? resolveCampusRequest(null, viewer) : null;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("posts")
    .select("tags")
    .eq("type", "post")
    .gte("created_at", since)
    .limit(POST_SCAN_LIMIT);

  // `resolveCampusRequest(null, …)` can't be forbidden — there's no `?campus=`
  // on the strip — but the type says it could, and narrowing is free.
  if (scope && scope.kind !== "forbidden") {
    const laneFilter = feedLaneOrFilter(feedLaneFor(scope, viewer));
    if (laneFilter) query = query.or(laneFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[trending/hashtags]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const tags = (row as unknown as { tags: string[] | null }).tags ?? [];
    for (const raw of tags) {
      if (typeof raw !== "string") continue;
      const t = raw.trim().toLowerCase().replace(/^#+/, "");
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const trending = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));

  // `school` keeps its old meaning for deployed bundles: the campus label,
  // or "" when there's no campus. `campus_id` is the additive new field.
  const campusId = scope?.kind === "campus" ? scope.campusId : null;
  return NextResponse.json({
    ok: true,
    trending,
    school: legacyLabel(campusId, viewer.system),
    campus_id: campusId,
  });
}
