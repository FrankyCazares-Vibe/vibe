import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
const WINDOW_DAYS = 7;
const POST_SCAN_LIMIT = 500;

/**
 * Trending hashtags — viewer's school, last 7 days. Counts each tag across
 * posts and clips authored by users at the same school.
 *
 * We do the aggregation in JS rather than via a Postgres array_agg /
 * unnest function to keep this dependency-free and easy to ship without a
 * migration. At <500 posts/week per school the cost is negligible; if a
 * school grows past that, swap to a SQL view.
 *
 * If the viewer has no `school` set, returns the global top tags so the
 * onboarding-incomplete state still shows something useful.
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

  const { data: me } = await supabase
    .from("users")
    .select("school")
    .eq("id", user.id)
    .single();
  const school = (me?.school ?? "").trim();

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("posts")
    .select(
      "tags," +
        "author:users!posts_user_id_fkey!inner(school)",
    )
    .in("type", ["post", "clip"])
    .gte("created_at", since)
    .limit(POST_SCAN_LIMIT);

  if (school) query = query.eq("author.school", school);

  const { data, error } = await query;
  if (error) {
    console.error("[trending/hashtags]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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

  return NextResponse.json({ ok: true, trending, school });
}
