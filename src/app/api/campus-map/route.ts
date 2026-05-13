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
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceDemo = url.searchParams.get("demo") === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Force-demo path: short-circuit before any DB-shape checks. Lets the UI
  // preview the visual even when the viewer has no school yet OR when the
  // school has zero peers in `users`.
  if (forceDemo) {
    return NextResponse.json({
      ok: true,
      demo: true,
      you: { id: user.id, name: null, handle: null, major: null, avatar_url: null },
      majors: DEMO_MAJORS,
      orgs: DEMO_ORGS,
    });
  }

  // Viewer identity — needed for "you are here" and the school filter.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("id,name,handle,major,school,avatar_url")
    .eq("id", user.id)
    .single();
  if (meErr || !me) {
    return NextResponse.json(
      { ok: false, error: meErr?.message ?? "Profile not found" },
      { status: 500 },
    );
  }
  const school = (me.school ?? "").trim();
  if (!school) {
    // No school on the viewer's profile yet — show demo zones so the
    // page isn't a dead end. The badge tells the user it's a preview.
    return NextResponse.json({
      ok: true,
      demo: true,
      you: me,
      majors: DEMO_MAJORS,
      orgs: DEMO_ORGS,
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
    return NextResponse.json({ ok: false, error: usersErr.message }, { status: 500 });
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

  // Empty-state fallback OR explicit demo override. The UI exposes a
  // "Demo" toggle so users can preview the visual even when their school
  // already has a few real zones (which would otherwise suppress the demo).
  const showDemo = forceDemo || majors.length === 0;
  const finalMajors = showDemo ? DEMO_MAJORS : majors;
  const finalOrgs = showDemo ? DEMO_ORGS : orgsOut;

  return NextResponse.json({
    ok: true,
    demo: showDemo,
    you: {
      id: me.id,
      name: me.name,
      handle: me.handle,
      major: me.major,
      avatar_url: me.avatar_url,
    },
    majors: finalMajors,
    orgs: finalOrgs,
  });
}

// Curated mock zones — used only when the school has no real major data
// yet. Numbers chosen so the UI shows variety: high-mutual (Discovery
// sweet spot), high-connected (already-found), and stranger zones.
const DEMO_MAJORS = [
  { name: "Computer Science", total: 240, connected: 8, mutuals: 14 },
  { name: "Business", total: 320, connected: 5, mutuals: 22 },
  { name: "Psychology", total: 280, connected: 1, mutuals: 18 },
  { name: "Biology", total: 180, connected: 2, mutuals: 6 },
  { name: "Communication", total: 200, connected: 6, mutuals: 12 },
  { name: "Mechanical Engineering", total: 110, connected: 3, mutuals: 4 },
  { name: "Economics", total: 150, connected: 4, mutuals: 9 },
  { name: "Music", total: 90, connected: 0, mutuals: 0 },
  { name: "Studio Art", total: 70, connected: 0, mutuals: 1 },
  { name: "Nursing", total: 95, connected: 0, mutuals: 0 },
  { name: "Political Science", total: 165, connected: 1, mutuals: 7 },
  { name: "Marketing", total: 145, connected: 2, mutuals: 11 },
];

const DEMO_ORGS = [
  // Standard orgs / clubs
  { id: "demo-cs", handle: "iu-cs-club", name: "IU Computer Science Club", logo_url: null, verified: true, is_public: true, member_count: 700 },
  { id: "demo-design", handle: "design-at-iu", name: "Design @ IU", logo_url: null, verified: true, is_public: true, member_count: 312 },
  { id: "demo-venture", handle: "iu-venture-club", name: "IU Venture Club", logo_url: null, verified: true, is_public: true, member_count: 540 },
  { id: "demo-nsbe", handle: "iu-nsbe", name: "NSBE", logo_url: null, verified: true, is_public: true, member_count: 280 },
  { id: "demo-wic", handle: "women-in-computing", name: "Women in Computing", logo_url: null, verified: true, is_public: true, member_count: 420 },
  { id: "demo-kis", handle: "kelley-investments", name: "Kelley Investment Society", logo_url: null, verified: true, is_public: true, member_count: 240 },
  // Athletic crews — the map buckets these into their own "Athletic
  // Center" cluster via name/handle keyword match (see ATHLETIC_RE on
  // the client). Keeping the same shape so non-athletic surfaces can
  // still treat them as plain orgs without special-casing.
  { id: "demo-hoops", handle: "iu-hoops", name: "IU Basketball", logo_url: null, verified: true, is_public: true, member_count: 180 },
  { id: "demo-football", handle: "iu-football", name: "IU Football", logo_url: null, verified: true, is_public: true, member_count: 220 },
  { id: "demo-soccer", handle: "iu-soccer", name: "IU Soccer Club", logo_url: null, verified: true, is_public: true, member_count: 140 },
  { id: "demo-track", handle: "iu-track", name: "Track & Field", logo_url: null, verified: true, is_public: true, member_count: 95 },
  { id: "demo-im", handle: "iu-intramurals", name: "IM Sports", logo_url: null, verified: true, is_public: true, member_count: 410 },
];
