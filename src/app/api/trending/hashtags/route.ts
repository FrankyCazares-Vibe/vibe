import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { legacyLabel } from "@/lib/iu/campuses";
import { campusScopeError, feedLaneFor, feedLaneOrFilter } from "@/lib/iu/community-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TRENDING_MIN_AUTHORS, countTrendingTags, type TrendingRow } from "@/lib/trending/count-tags";

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
 * `?campus=<id>` (S67 wave 1, for wave 4's "view any campus"): the strip's
 * trending follows the campus the student is looking at, resolved through
 * `resolveCampusRequest` like the map, search and stats routes. A campus the
 * viewer may not name answers `campusScopeError` (403 `campus_not_in_system`
 * for a viewer with no university, 400 `unknown_campus`), the same body the
 * other four routes send. No `?campus=` means the viewer's own campus, as
 * before. The student's RSVP chips are not affected — they come from
 * `/api/me/upcoming-events` and are theirs wherever they look.
 *
 * THE COUNT IS PEOPLE (S67 security wave B, B4; report #10). `count` is how
 * many different authors used the tag in the window (`countTrendingTags`),
 * so a tag repeated in one post, or posted twenty times by one student,
 * counts once; the chip says "N people this week". A tag that fails the
 * stored-tag grammar or the tag word filter is never counted: `authenticated`
 * can still write `posts.tags` directly, and the database can't run the word
 * list. The response shape is unchanged.
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
  const scope = campusReady ? resolveCampusRequest(url.searchParams.get("campus"), viewer) : null;
  if (scope?.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Published, not removed: the SELECT policy's `OR user_id = auth.uid()`
  // branch would otherwise count the viewer's own drafts and removed posts in
  // their own strip. Newest first, so the scan cap keeps the latest week.
  let query = supabase
    .from("posts")
    .select("tags,user_id")
    .eq("type", "post")
    .eq("status", "published")
    .is("removed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(POST_SCAN_LIMIT);

  // `forbidden` already answered above, so `scope` is a real lane here; null
  // only when M1 is unapplied, which keeps the pre-campus global count.
  if (scope) {
    const laneFilter = feedLaneOrFilter(feedLaneFor(scope, viewer));
    if (laneFilter) query = query.or(laneFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[trending/hashtags]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReadonlyArray<TrendingRow>;
  const trending = countTrendingTags(rows, { limit, minAuthors: TRENDING_MIN_AUTHORS });

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
