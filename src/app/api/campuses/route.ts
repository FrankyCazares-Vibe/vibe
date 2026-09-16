import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { allowedCampusId, isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";
import { campusOptionsForSystem, preselectCampusId } from "@/lib/onboarding/boot";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CampusesUserRow = {
  school_system?: unknown;
  campus_id?: unknown;
  school_email?: unknown;
};

const COLUMNS = "school_system,campus_id,school_email";

/**
 * GET /api/campuses — the campus screen's radio cards (plan §3.4 step 2,
 * wave 2 B7).
 *
 *   → 200 {
 *       ok, system, campuses:[{id,name,shortName,city,shared,sharedWith,isOpen}],
 *       preselect, currentCampusId
 *     }
 *
 * SIGNED IN ONLY (401 otherwise). The campus list itself is public reference
 * data, but the three answers around it are the caller's own: which university
 * their email proved, which campus they're on, and which campus their address
 * points at. Gating the whole route keeps `school_email` out of reach of an
 * anonymous probe — and it is never part of the response either (plan §2.2):
 * the address is read with the service role and reduced to a campus id here.
 *
 * `campuses` is the ALLOWED SET for the caller's system, shared communities
 * first (plan §2.4). A caller with no stamped system — unverified, or a
 * pre-M1 row — gets `system: null` and an empty list rather than every
 * campus: an unverified student has no campus to pick.
 *
 * `preselect` is the VISIBLE preselect for @pfw.edu / @pnw.edu, which the
 * student confirms with one tap; nothing is ever set silently.
 * `currentCampusId` is what's already saved, so the screen can paint the
 * chosen card before any other fetch. Both are null when they don't apply.
 *
 * No rate limit: it reads a fixed in-process list plus one row of the
 * caller's own, writes nothing, and the campus screen calls it once.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, code: "unauthorized", error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select(COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    // Migration M1 not applied yet (plan §5.5): the campus columns are the
    // whole answer here, so say "not ready" instead of a 500. Any other
    // missing column is a real fault.
    if (isMissingColumnError(error)) {
      return NextResponse.json(
        { ok: false, code: "campus_not_ready", error: "Campus setup isn't available yet. Try again soon." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    console.error("[api/campuses]", error);
    return NextResponse.json(
      { ok: false, code: "request_failed", error: "Request failed" },
      { status: 500 },
    );
  }

  const row = (data ?? null) as CampusesUserRow | null;
  const system: SchoolSystem | null = isSchoolSystem(row?.school_system)
    ? row.school_system
    : null;

  return NextResponse.json(
    {
      ok: true,
      system,
      campuses: campusOptionsForSystem(system),
      preselect: preselectCampusId(row?.school_email, system),
      // Only echo a campus the student may actually keep: a row outside their
      // system (reachable only by bypassing the DB trigger) reads as unset, so
      // the screen asks again instead of showing another university's campus.
      currentCampusId: allowedCampusId(row?.campus_id, system),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
