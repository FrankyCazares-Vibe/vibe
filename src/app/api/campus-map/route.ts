import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Campus map summary — what powers the Map tab's overview view.
 *
 * Returns:
 *   - `you`: the viewer's identity used for "you are here"
 *   - `majors`: every major represented at the viewer's school, with
 *      total members, count of viewer's existing connections in that
 *      major, and count of "mutuals" (people you share at least one
 *      mutual-follow connection with but aren't connected to yet)
 *   - `orgs`: orgs at the school, sorted by recent activity, for the
 *      "org center" cluster
 *
 * The mutuals math uses one extra query: pull every connection row where
 * the follower is one of the viewer's existing connections, then count
 * how many of those land on each candidate. Cheap because the viewer's
 * connection set is small (Dunbar) and the index on `follower_id` is hot.
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

  // Viewer identity — needed for "you are here" and the school filter.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("id,name,handle,major,school,avatar_url")
    .eq("id", user.id)
    .single();
  if (meErr || !me) {
    console.error("[campus-map]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const school = (me.school ?? "").trim();
  if (!school) {
    // No campus on the viewer's profile yet. Honest empty payload; the
    // client turns `reason` into a "pick your campus" prompt. (Until S55
    // this branch returned a fabricated roster of majors and orgs.)
    return NextResponse.json({
      ok: true,
      you: me,
      majors: [],
      orgs: [],
      reason: "no_school",
    });
  }

  // 1. All users at the school. Used for the major aggregation and as the
  // candidate pool for the mutuals math.
  const { data: schoolUsers, error: usersErr } = await supabase
    .from("users")
    .select("id,major")
    .eq("school", school);
  if (usersErr) {
    console.error("[campus-map users]", usersErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const peers = (schoolUsers ?? []).filter((u) => u.id !== me.id);
  const peerIds = new Set(peers.map((u) => u.id));
  const majorByUser = new Map<string, string>();
  for (const u of peers) {
    if (u.major) majorByUser.set(u.id, u.major);
  }

  // 2. Viewer's mutual connections (the "connected" set) — both directions
  // present in `connections`.
  const [outRes, inRes] = await Promise.all([
    supabase.from("connections").select("following_id").eq("follower_id", me.id),
    supabase.from("connections").select("follower_id").eq("following_id", me.id),
  ]);
  const outIds = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const inIds = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const myConnections = new Set<string>();
  for (const id of outIds) if (inIds.has(id)) myConnections.add(id);

  // 3. Friends-of-friends: every connection row where the follower is one
  // of my mutuals. Their `following_id`s are users I share a mutual with.
  const mutualSecondHop = new Set<string>();
  if (myConnections.size > 0) {
    const { data: hop } = await supabase
      .from("connections")
      .select("following_id")
      .in("follower_id", Array.from(myConnections));
    for (const row of hop ?? []) {
      const id = (row as { following_id: string }).following_id;
      if (id !== me.id && !myConnections.has(id) && peerIds.has(id)) {
        mutualSecondHop.add(id);
      }
    }
  }

  // 4. Aggregate by major.
  const majorTotals = new Map<string, number>();
  const majorConnected = new Map<string, number>();
  const majorMutuals = new Map<string, number>();
  for (const u of peers) {
    const m = (u.major ?? "").trim();
    if (!m) continue;
    majorTotals.set(m, (majorTotals.get(m) ?? 0) + 1);
    if (myConnections.has(u.id)) {
      majorConnected.set(m, (majorConnected.get(m) ?? 0) + 1);
    } else if (mutualSecondHop.has(u.id)) {
      majorMutuals.set(m, (majorMutuals.get(m) ?? 0) + 1);
    }
  }

  const majors = Array.from(majorTotals.entries())
    .map(([name, total]) => ({
      name,
      total,
      connected: majorConnected.get(name) ?? 0,
      mutuals: majorMutuals.get(name) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  // 5. Verified orgs at this school. We don't have a school column on
  // orgs (they're cross-school by design), so we filter to orgs the
  // viewer or peers belong to via org_members membership.
  const { data: orgs, error: orgsErr } = await supabase
    .from("orgs")
    .select("id,handle,name,logo_url,verified,is_public,last_activity_at")
    .order("last_activity_at", { ascending: false })
    .limit(20);
  if (orgsErr) {
    console.error("[campus-map orgs]", orgsErr);
  }

  // Member counts per org (for sizing).
  let orgMembers = new Map<string, number>();
  if (orgs && orgs.length > 0) {
    const { data: rows } = await supabase
      .from("org_members")
      .select("org_id")
      .in(
        "org_id",
        orgs.map((o) => o.id),
      );
    for (const row of rows ?? []) {
      const id = (row as { org_id: string }).org_id;
      orgMembers.set(id, (orgMembers.get(id) ?? 0) + 1);
    }
  } else {
    orgMembers = new Map();
  }

  const orgsOut = (orgs ?? []).map((o) => ({
    id: o.id,
    handle: o.handle,
    name: o.name,
    logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
    verified: !!o.verified,
    is_public: !!o.is_public,
    member_count: orgMembers.get(o.id) ?? 0,
  }));

  // Real data only. A campus with no peers yet returns empty arrays and the
  // client shows its "no zones yet" state instead of a fake roster.
  return NextResponse.json({
    ok: true,
    you: {
      id: me.id,
      name: me.name,
      handle: me.handle,
      major: me.major,
      avatar_url: me.avatar_url,
    },
    majors,
    orgs: orgsOut,
  });
}
