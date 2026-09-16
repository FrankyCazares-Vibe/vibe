import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { SCHOOL_SYSTEMS } from "@/lib/iu/campuses";
import { campusScopeError } from "@/lib/iu/community-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lightweight stats for the campus banner: how many students there are and
 * how many were pinging the heartbeat in the last 5 minutes ("active now").
 * Auth required so we don't leak the headcount to scrapers.
 *
 * TWO NUMBERS, TWO NAMES — ON PURPOSE (plan §6 compatibility, and the
 * "no vanity metrics" principle read the other way round: a number must not
 * change meaning under a label that stays the same).
 *
 *   `totalUsers` / `activeNow`      everyone on Vibe. UNCHANGED, because the
 *                                   deployed desktop banner prints them as
 *                                   "N on Vibe" (`campus-home.tsx:3379`,
 *                                   polled every 30 s) and will keep doing so
 *                                   for days after this ships.
 *   `campusUsers` / `campusActiveNow`  the viewer's community (plan wave 2
 *                                   B10, §2.4): users whose `campus_id` is
 *                                   the campus in scope — one community for
 *                                   IU and Purdue Indianapolis together.
 *                                   Additive and unread until B19 (wave 4)
 *                                   switches the banner's number AND its
 *                                   label in the same commit.
 *
 * Both campus fields are NULL when there is no community to count: the viewer
 * hasn't picked a campus, or M1 isn't applied on this database. Null says
 * "we don't know yours" — which is the honest answer — instead of quietly
 * handing back the global number under a campus name.
 *
 * `?campus=<id>` is honored inside the viewer's allowed set (403
 * `campus_not_in_system` outside it, 400 for an id no build knows, and a
 * viewer with no university may not name a campus at all — Franky's Q2).
 * `?campus=all` counts every campus in the viewer's own university, not every
 * account on Vibe.
 *
 * `?split=1` adds `bySystem` — the same community split into IU and Purdue
 * students, the honest way to say "Indianapolis is shared" with real counts.
 * It costs one head-count per system, so it's opt-in and off for the banner's
 * 30-second poll.
 */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** `?split=` values that mean "no, don't split". Anything else means yes. */
const OFF_VALUES = new Set(["0", "false", "off", "no"]);

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // `maybeSingle`, not `single`: this endpoint is polled every 30 s by the
  // banner and answered 200 for a viewer with no `users` row before this
  // change. It must not start 500ing on that (plan §6 compatibility).
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("campus_id,school_system")
    .eq("id", user.id)
    .maybeSingle();
  // M1 unapplied on this database: the global counts still work, and the
  // campus ones answer null. Narrow on purpose — any other error is real.
  const campusReady = !(meErr && isMissingColumnError(meErr));
  if (meErr && campusReady) {
    console.error("[stats/campus me]", meErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const url = new URL(req.url);
  const viewer = scopeViewerFromRow(campusReady ? (me as Record<string, unknown> | null) : null);
  const scope = campusReady ? resolveCampusRequest(url.searchParams.get("campus"), viewer) : null;
  if (scope?.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json(body, { status });
  }

  // The community to count: one campus, or — for `?campus=all` — every campus
  // in the viewer's university. `kind: "none"` (no campus picked yet) has no
  // community, so it counts nothing rather than counting everyone under a
  // campus name.
  const communityIds = scope && scope.kind !== "none" ? scopeCampusIds(scope) : null;
  const campusId = scope?.kind === "campus" ? scope.campusId : null;

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const headCount = () => supabase.from("users").select("id", { count: "exact", head: true });
  const community = () => headCount().in("campus_id", communityIds ?? []);

  // `?split`, `?split=1` and `?split=true` all ask for it; `?split=0` /
  // `?split=false` don't. Bare `?split` reads as "" from URLSearchParams, so
  // presence — not truthiness of the value — is what turns it on. It needs a
  // community to split, so it's off for a viewer with no campus.
  const splitRaw = url.searchParams.get("split");
  const wantSplit =
    !!communityIds && splitRaw !== null && !OFF_VALUES.has(splitRaw.trim().toLowerCase());

  const [globalRes, communityRes, splitRes] = await Promise.all([
    Promise.all([headCount(), headCount().gte("last_active_at", activeSince)]),
    communityIds
      ? Promise.all([community(), community().gte("last_active_at", activeSince)])
      : Promise.resolve(null),
    wantSplit
      ? Promise.all(SCHOOL_SYSTEMS.map((s) => community().eq("school_system", s)))
      : Promise.resolve(null),
  ]);

  const firstErr = [...globalRes, ...(communityRes ?? []), ...(splitRes ?? [])].find(
    (r) => r.error,
  )?.error;
  if (firstErr) {
    console.error("[stats/campus]", firstErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const bySystem = splitRes
    ? Object.fromEntries(SCHOOL_SYSTEMS.map((s, i) => [s, splitRes[i]?.count ?? 0]))
    : undefined;

  return NextResponse.json({
    ok: true,
    // Unchanged meaning for deployed bundles: everyone on Vibe.
    totalUsers: globalRes[0].count ?? 0,
    activeNow: globalRes[1].count ?? 0,
    active_window_minutes: ACTIVE_WINDOW_MS / 60000,
    // Additive (plan §6 compatibility): deployed bundles ignore these.
    campusUsers: communityRes ? (communityRes[0].count ?? 0) : null,
    campusActiveNow: communityRes ? (communityRes[1].count ?? 0) : null,
    campusId,
    // "<campus id>" | "all" (the viewer's whole university) | "none".
    scope: campusId ?? (communityIds ? "all" : "none"),
    ...(bySystem ? { bySystem } : {}),
  });
}
