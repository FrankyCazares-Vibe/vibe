import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { campusScopeError } from "@/lib/iu/community-scope";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
 * on the same terms as the summary (allowed set only, and only for a viewer
 * who has a university at all; 403 `campus_not_in_system` otherwise — the
 * clamp lives in `resolveCampusRequest`).
 *
 * The ORG zone lists that org's members, which is not a campus question — an
 * org's members are its members. What IS checked is the org itself: an org on
 * another campus isn't part of this map, so it answers empty buckets rather
 * than rostering strangers. Campus-less orgs (every live org until M1b)
 * likewise belong to no map.
 *
 * A viewer with no campus keeps today's answer: empty buckets.
 *
 * BLOCKS. Anyone in a block pair with the viewer (either direction) is left
 * out of every bucket, the way /api/me/suggested-connections leaves them out.
 * An unreadable block list is a 500, never "nobody is blocked".
 */

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

  const scope = resolveCampusRequest(
    url.searchParams.get("campus"),
    scopeViewerFromRow(me as Record<string, unknown> | null),
  );
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }
  if (scope.kind === "none") {
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
    const { data: org } = await supabase
      .from("orgs")
      .select("id,campus_id")
      .eq("handle", orgHandle)
      .maybeSingle();
    if (!org) {
      return NextResponse.json({ ok: false, error: "Org not found" }, { status: 404 });
    }
    // An org on another campus (or none at all) is not a zone of this map.
    const orgCampus = (org as { campus_id?: unknown }).campus_id;
    if (typeof orgCampus !== "string" || !campusIds.includes(orgCampus)) {
      return emptyBuckets();
    }
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id);
    candidateIds = (members ?? [])
      .map((r) => (r as { user_id: string }).user_id)
      .filter((id) => id !== user.id);
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
