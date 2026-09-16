import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { campusScopeError } from "@/lib/iu/community-scope";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Campus map summary — what powers the Map tab's overview view.
 *
 * Returns:
 *   - `you`: the viewer's identity used for "you are here"
 *   - `majors`: every major represented on the viewer's CAMPUS, with
 *      total members, count of viewer's existing connections in that
 *      major, and count of "mutuals" (people you share at least one
 *      mutual-follow connection with but aren't connected to yet)
 *   - `orgs`: orgs on that campus, sorted by recent activity, for the
 *      "org center" cluster
 *
 * SCOPE (plan wave 2 B10, §2.4). People and orgs are filtered on
 * `campus_id`, never on the legacy `users.school` label. The campus is the
 * viewer's home campus, or `?campus=<id>` when that id is in their allowed
 * set (every campus whose `systems` includes their `school_system`;
 * Indianapolis is in both, so IU and Purdue Indianapolis students see one
 * map). `?campus=all` covers every campus in their own university. A campus
 * outside it is 403 `campus_not_in_system`; an id no build knows is 400. A
 * viewer with no university at all can't name a campus either (Franky's Q2 —
 * the clamp lives in `resolveCampusRequest`, tested once).
 *
 * A viewer with no campus keeps today's answer: empty arrays plus
 * `reason: "no_school"`, which both clients render as "pick your campus"
 * (`MapMobile.tsx:296`, `campus-home.tsx:9768`). The reason string is
 * deliberately unchanged — wave-3 bundles aren't shipped yet (critic A4/C4).
 *
 * ORGS WITH NO CAMPUS ARE GONE FROM THIS LIST (plan §2.4, §2.8 row 4). Until
 * migration M1b assigns each live org a campus, `orgs.campus_id` is null on
 * all of them and the org ring is legitimately empty; the majors half of the
 * map is unaffected.
 *
 * The mutuals math uses one extra query: pull every connection row where
 * the follower is one of the viewer's existing connections, then count
 * how many of those land on each candidate. Cheap because the viewer's
 * connection set is small (Dunbar) and the index on `follower_id` is hot.
 */

/** The viewer identity both branches return (never the school email). */
type MapYou = {
  id: string;
  name: string | null;
  handle: string | null;
  major: string | null;
  avatar_url: string | null;
};

/** Honest empty payload: no campus to draw, so the client prompts for one. */
function pickYourCampus(you: MapYou) {
  return NextResponse.json({
    ok: true,
    you,
    majors: [],
    orgs: [],
    reason: "no_school",
  });
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Viewer identity — needed for "you are here" and the campus filter.
  // `campus_id` / `school_system` carry an `authenticated` SELECT grant (M1),
  // so the user client reads them; `campus_set_at` deliberately has none and
  // isn't needed here.
  const { data: meRow, error: meErr } = await supabase
    .from("users")
    .select("id,name,handle,major,avatar_url,campus_id,school_system")
    .eq("id", user.id)
    .single();

  // M1 unapplied on this database (a local stack, a branch): scope on the
  // legacy label is retired, so answer the honest "pick your campus" payload
  // instead of a 500. Narrow on purpose — any other error is a real failure.
  if (meErr && isMissingColumnError(meErr)) {
    console.error("[campus-map] campus columns missing; M1 not applied");
    const { data: legacyMe } = await supabase
      .from("users")
      .select("id,name,handle,major,avatar_url")
      .eq("id", user.id)
      .single();
    if (!legacyMe) {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return pickYourCampus(legacyMe as unknown as MapYou);
  }
  if (meErr || !meRow) {
    console.error("[campus-map]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const me = meRow as unknown as MapYou & { campus_id?: unknown; school_system?: unknown };
  const you: MapYou = {
    id: me.id,
    name: me.name,
    handle: me.handle,
    major: me.major,
    avatar_url: me.avatar_url,
  };

  const url = new URL(req.url);
  const viewer = scopeViewerFromRow(meRow as Record<string, unknown>);
  const scope = resolveCampusRequest(url.searchParams.get("campus"), viewer);
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }
  if (scope.kind === "none") {
    return pickYourCampus(you);
  }
  const campusIds = scopeCampusIds(scope);

  // 1. Everyone on this campus. Used for the major aggregation and as the
  // candidate pool for the mutuals math.
  const { data: campusUsers, error: usersErr } = await supabase
    .from("users")
    .select("id,major")
    .in("campus_id", campusIds);
  if (usersErr) {
    console.error("[campus-map users]", usersErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const peers = (campusUsers ?? []).filter((u) => u.id !== me.id);
  const peerIds = new Set(peers.map((u) => u.id));
  const majorByUser = new Map<string, string>();
  for (const u of peers) {
    if (u.major) majorByUser.set(u.id, u.major);
  }

  // 2. Viewer's mutual connections (the "connected" set) — both directions
  // present in `connections`. Follows are global (plan §2.4), so this set is
  // NOT campus-filtered; only the people drawn on the map are.
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

  // 5. Orgs on this campus, for the "org center" cluster. `orgs.campus_id`
  // arrived with M1; a campus-less org shows in no campus list any more
  // (plan §2.8 row 4). RLS still limits this to public orgs plus the ones the
  // viewer belongs to — the map is a user-client read on purpose.
  const { data: orgs, error: orgsErr } = await supabase
    .from("orgs")
    .select("id,handle,name,logo_url,verified,is_public,last_activity_at")
    .in("campus_id", campusIds)
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
    you,
    majors,
    orgs: orgsOut,
    // Additive (plan §6 compatibility): deployed bundles ignore these.
    campus_id: scope.kind === "campus" ? scope.campusId : null,
    campus_scope: scope.kind === "campus" ? scope.campusId : "all",
  });
}
