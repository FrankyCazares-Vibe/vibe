import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { mapCampusClosed, resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { campusScopeError } from "@/lib/iu/community-scope";
import { loadOrgRole, MAP_ZONE_SHOWN_COLUMN, mapZoneListsMembers } from "@/lib/orgs/following";
import { clubsVisibleToViewer } from "@/lib/profile/hidden-fields";
import { sanitizeProfileLayout } from "@/lib/profile/profile-layout";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const MAX_BUCKET = 60;
/** `second_degree_follows` refuses more ids than this in `p_among` (SQLSTATE 22023). */
const SECOND_DEGREE_MAX_IDS = 1000;

type UserRow = {
  id: string;
  name: string | null;
  handle: string | null;
  major: string | null;
  year: number | null;
  avatar_url: string | null;
};

/**
 * Drill-in for a zone (major or org). Splits people into three buckets:
 *   - `connected`  : you mutually-follow them
 *   - `mutuals`    : you share at least one mutual connection — sorted by
 *                    that count desc so the highest-overlap people surface
 *                    first
 *   - `discover`   : nobody in common, but they're in the same zone
 *
 * Each bucket is capped at MAX_BUCKET. Discover is the v1 hero — that's
 * where users find people they'd never bump into otherwise.
 *
 * SCOPE (plan wave 2 B10, §2.4). The major zone is filtered on `campus_id`,
 * never on the legacy `users.school` label: same campus as `/api/campus-map`,
 * so a bubble's drill-in matches the bubble's count. `?campus=<id>` is honored
 * on the same terms as the summary. Since S67 any KNOWN campus is readable,
 * either university (see the header of `src/lib/iu/campus-scope.ts`); only a
 * viewer with no university at all is refused (403 `campus_not_in_system`,
 * the clamp in `resolveCampusRequest`), and an unknown id is 400.
 *
 * A CAMPUS THAT ISN'T OPEN LISTS NOBODY unless it's home (S67 R3,
 * `mapCampusClosed`): this route names people, and a two-person zone on a
 * closed campus would identify them. Empty buckets, same as the summary's
 * empty map, for the major zone and the org zone alike.
 *
 * The ORG zone lists that org's members, which is not a campus question — an
 * org's members are its members. What IS checked is the org itself: an org on
 * another campus isn't part of this map, so it answers empty buckets rather
 * than rostering strangers. Campus-less orgs (every live org until M1b)
 * likewise belong to no map.
 *
 * WHO THE ORG ZONE LISTS (club model batch 2A, `orgZoneMemberIds`): only the
 * members who show the club on their profile (`show_on_profile`, on by
 * default, and their Clubs section not hidden), for every viewer, members
 * included. A hidden club answers what a
 * missing handle answers. A member sees their own club's zone; anyone else
 * only a public club anyone can join (`mapZoneListsMembers`), the reach the
 * database gave before 20261017120000 made member lists members-only. The
 * members are read with the SERVICE client, so the zone keeps working after
 * that migration; the club itself is still looked up on the viewer's client,
 * so `orgs_select` decides which clubs they may know about.
 *
 * A viewer with no campus keeps today's answer: empty buckets.
 *
 * BLOCKS. Anyone in a block pair with the viewer (either direction) is left
 * out of every bucket, the way /api/me/suggested-connections leaves them out.
 * An unreadable block list is a 500, never "nobody is blocked".
 */

/** The org zone's people, or why there are none to give. */
type ZoneMembers = { kind: "ids"; ids: string[] } | { kind: "not_found" } | { kind: "failed" };

/**
 * The ids the org zone may list (see the docblock below). Never the viewer;
 * never a member who hid the club or their whole Clubs section; a database
 * without either column lists nobody rather than everyone.
 */
async function orgZoneMemberIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  handle: string,
  campusIds: readonly string[],
  viewerId: string,
): Promise<ZoneMembers> {
  const { data: org, error } = await supabase
    .from("orgs")
    .select("id,campus_id,is_public,join_policy,hidden_at")
    .eq("handle", handle)
    .maybeSingle();
  if (error) {
    console.error("[campus-map/zone org]", error);
    return { kind: "failed" };
  }
  const club = org as { id: string; campus_id?: unknown; is_public?: unknown; join_policy?: unknown; hidden_at?: unknown } | null;
  // Hidden is off the Map for everyone: the same 404 as a missing handle.
  if (!club || club.hidden_at != null) return { kind: "not_found" };
  // An org on another campus (or none at all) is not a zone of this map.
  if (typeof club.campus_id !== "string" || !campusIds.includes(club.campus_id)) return { kind: "ids", ids: [] };
  const service = createSupabaseServiceClient();
  // Only a club outside the open reach needs the viewer's role.
  if (!mapZoneListsMembers(club, false)) {
    const role = await loadOrgRole(service, club.id, viewerId);
    if (!role.ok) return { kind: "failed" };
    if (!mapZoneListsMembers(club, role.role !== null)) return { kind: "ids", ids: [] };
  }
  const { data: members, error: membersErr } = await service
    .from("org_members")
    .select("user_id")
    .eq("org_id", club.id)
    .eq(MAP_ZONE_SHOWN_COLUMN, true);
  if (membersErr) {
    if (isMissingColumnError(membersErr, [MAP_ZONE_SHOWN_COLUMN])) {
      console.error("[campus-map/zone] show_on_profile missing; migration 20261017100000 not applied");
      return { kind: "ids", ids: [] };
    }
    console.error("[campus-map/zone members]", membersErr);
    return { kind: "failed" };
  }
  const ids = (members ?? [])
    .map((r) => (r as { user_id?: unknown }).user_id)
    .filter((id): id is string => typeof id === "string" && id !== viewerId);
  if (ids.length === 0) return { kind: "ids", ids };
  // A member who hid their whole Clubs section (Oct 18 2026) shows no club
  // on their profile, so no zone lists them either: the bootstrap's rule
  // (`clubsVisibleToViewer`), for a viewer who is never the owner here.
  // Fail closed: only ids whose layout was read and shows Clubs stay.
  const { data: layouts, error: layoutErr } = await service
    .from("users")
    .select("id,profile_layout")
    .in("id", ids);
  if (layoutErr) {
    if (isMissingColumnError(layoutErr, ["profile_layout"])) {
      console.error("[campus-map/zone] profile_layout missing; migration 20260926100000 not applied");
      return { kind: "ids", ids: [] };
    }
    console.error("[campus-map/zone layouts]", layoutErr);
    return { kind: "failed" };
  }
  const showsClubs = new Set<string>();
  for (const row of layouts ?? []) {
    const r = row as { id?: unknown; profile_layout?: unknown };
    if (typeof r.id !== "string") continue;
    const layout = sanitizeProfileLayout(r.profile_layout);
    if (clubsVisibleToViewer({ isOwner: false, layout })) showsClubs.add(r.id);
  }
  return { kind: "ids", ids: ids.filter((id) => showsClubs.has(id)) };
}

/** Nobody to show. Same shape the client already handles for an empty zone. */
function emptyBuckets() {
  return NextResponse.json({ ok: true, connected: [], mutuals: [], discover: [] });
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

  const url = new URL(req.url);
  const major = (url.searchParams.get("major") ?? "").trim();
  const orgHandle = (url.searchParams.get("org") ?? "").trim().toLowerCase();
  if (!major && !orgHandle) {
    return NextResponse.json(
      { ok: false, error: "major or org required" },
      { status: 400 },
    );
  }

  // `maybeSingle`, not `single`: a viewer with no `users` row answered empty
  // buckets before this change, not a 500 (plan §6 compatibility). A missing
  // row then reads as "no campus" below, which is the same empty answer.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("id,campus_id,school_system")
    .eq("id", user.id)
    .maybeSingle();
  // M1 unapplied: the legacy-label scope is retired, so show nothing rather
  // than everyone. Narrow on purpose — any other error is a real failure.
  if (meErr && isMissingColumnError(meErr)) {
    console.error("[campus-map/zone] campus columns missing; M1 not applied");
    return emptyBuckets();
  }
  if (meErr) {
    console.error("[campus-map/zone me]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const viewer = scopeViewerFromRow(me as Record<string, unknown> | null);
  const scope = resolveCampusRequest(url.searchParams.get("campus"), viewer);
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }
  if (scope.kind === "none") {
    return emptyBuckets();
  }
  // R3: a closed campus that isn't home names nobody, before any read.
  if (mapCampusClosed(scope, viewer)) {
    return emptyBuckets();
  }
  const campusIds = scopeCampusIds(scope);

  // Resolve candidate ids.
  let candidateIds: string[] = [];
  if (major) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .in("campus_id", campusIds)
      .eq("major", major)
      .neq("id", user.id);
    if (error) {
      console.error("[campus-map/zone major]", error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    candidateIds = (data ?? []).map((r) => (r as { id: string }).id);
  } else {
    const zone = await orgZoneMemberIds(supabase, orgHandle, campusIds, user.id);
    if (zone.kind === "not_found") {
      return NextResponse.json({ ok: false, error: "Org not found" }, { status: 404 });
    }
    if (zone.kind === "failed") {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    candidateIds = zone.ids;
  }

  if (candidateIds.length === 0) {
    // Nobody in this zone yet. Empty buckets — the client says so. (Until
    // S55 this returned a seeded roster of fake people with fake handles.)
    return emptyBuckets();
  }

  // Viewer's connections (mutual follows) and block pairs, in one round trip.
  // Follows are global (plan §2.4), so this set isn't campus-filtered; the
  // candidate pool above already is.
  const [outRes, inRes, hiddenRes] = await Promise.all([
    supabase.from("connections").select("following_id").eq("follower_id", user.id),
    supabase.from("connections").select("follower_id").eq("following_id", user.id),
    loadHiddenUsers(supabase, user.id),
  ]);
  // Blocks in either direction never show on a zone. Fail closed: an
  // unreadable block list must never turn into "nobody is blocked".
  if (!hiddenRes.ok) {
    console.error("[campus-map/zone blocks]", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const blocked = hiddenRes.hidden.blocked;
  if (blocked.size > 0) {
    candidateIds = candidateIds.filter((id) => !blocked.has(id));
    if (candidateIds.length === 0) return emptyBuckets();
  }
  const outIds = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const inIds = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const myConnections = new Set<string>();
  for (const id of outIds) if (inIds.has(id)) myConnections.add(id);

  // Mutual count per candidate: how many of MY connections follow them, from
  // the `second_degree_follows` RPC (T1, migration 20260922100000) narrowed
  // to this zone's candidates. `connections` only returns edges that touch
  // the viewer once T1's policy file lands, so the route can no longer read
  // its mutuals' edges itself. The RPC keys on `auth.uid()` (viewer's client,
  // never service), returns ids and counts only, and skips block pairs. The
  // candidate list is capped at 1000 rows by `max_rows`, so this is one call
  // today; the chunks are for safety. A failed read degrades to "no mutuals"
  // (logged), as it did before, rather than failing the zone.
  const mutualCount = new Map<string, number>();
  if (myConnections.size > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < candidateIds.length; i += SECOND_DEGREE_MAX_IDS) {
      chunks.push(candidateIds.slice(i, i + SECOND_DEGREE_MAX_IDS));
    }
    const results = await Promise.all(
      chunks.map((chunk) => supabase.rpc("second_degree_follows", { p_among: chunk })),
    );
    const hopErr = results.find((res) => res.error)?.error;
    if (hopErr) {
      console.error("[campus-map/zone second-degree]", hopErr);
    } else {
      for (const res of results) {
        for (const row of Array.isArray(res.data) ? res.data : []) {
          const r = row as { user_id?: unknown; via_count?: unknown };
          const count = Number(r.via_count);
          if (typeof r.user_id !== "string" || !Number.isFinite(count) || count <= 0) continue;
          mutualCount.set(r.user_id, Math.trunc(count));
        }
      }
    }
  }

  // Hydrate candidates' profiles in one query.
  const { data: profileRows, error: pErr } = await supabase
    .from("users")
    .select("id,name,handle,major,year,avatar_url")
    .in("id", candidateIds);
  if (pErr) {
    console.error("[campus-map/zone users]", pErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const profiles = (profileRows as unknown as UserRow[]) ?? [];

  const connected: UserRow[] = [];
  const mutuals: Array<UserRow & { mutual_count: number }> = [];
  const discover: UserRow[] = [];

  for (const u of profiles) {
    if (myConnections.has(u.id)) {
      connected.push(u);
    } else if (mutualCount.has(u.id)) {
      mutuals.push({ ...u, mutual_count: mutualCount.get(u.id) ?? 0 });
    } else {
      discover.push(u);
    }
  }

  mutuals.sort((a, b) => b.mutual_count - a.mutual_count);
  // Stable shuffle for discover so "you'd never find them" feels less
  // alphabet-driven. Hash by user id so the order is consistent within a
  // session for one viewer.
  discover.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return NextResponse.json({
    ok: true,
    connected: connected.slice(0, MAX_BUCKET),
    mutuals: mutuals.slice(0, MAX_BUCKET),
    discover: discover.slice(0, MAX_BUCKET),
  });
}
