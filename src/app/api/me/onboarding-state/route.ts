import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { allowedCampusId, isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type StateUserRow = {
  school_verified?: unknown;
  otto_answers?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  campus_set_at?: unknown;
};

const BASE_COLUMNS = "school_verified, otto_answers";
/** The campus columns come from migration M1 (plan §5.1). */
const CAMPUS_COLUMNS = `${BASE_COLUMNS}, school_system, campus_id, campus_set_at`;

/**
 * GET /api/me/onboarding-state — { school_verified, otto_complete } for the
 * signed-in user, plus the campus facts (wave 2 B7). Exists because
 * `otto_answers` is a private column the browser client can't read; the login
 * page uses this to pick the post-login destination.
 *
 * ADDITIVE ONLY (critic A1/A4): `school_verified` and `otto_complete` keep
 * their exact names and meanings, because the bundles deployed today read
 * them (`getPostLoginDestination`). The new fields are:
 *
 *   school_system     "iu" | "purdue" | null — what the verified email proved
 *   campus_id         the saved campus, or null (null too for a campus outside
 *                     the student's system, which they may not keep)
 *   campus_confirmed  `campus_set_at` is set: the student CHOSE this campus.
 *                     False for the rows M1 backfilled silently (plan §2.7),
 *                     which is what the "Confirm your campus" prompt keys on.
 *
 * Before migration M1 is applied the campus columns don't exist; the read
 * falls back to the base two and the new fields come back null / false rather
 * than 500ing a route the login flow depends on.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  let { data, error } = await service
    .from("users")
    .select(CAMPUS_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await service
      .from("users")
      .select(BASE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle());
  }
  if (error) {
    console.error("[me/onboarding-state]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const row = (data ?? null) as StateUserRow | null;
  const system: SchoolSystem | null = isSchoolSystem(row?.school_system)
    ? row.school_system
    : null;

  return NextResponse.json(
    {
      ok: true,
      school_verified: Boolean(row?.school_verified),
      otto_complete: isOttoOnboardingComplete(row?.otto_answers),
      school_system: system,
      campus_id: allowedCampusId(row?.campus_id, system),
      campus_confirmed:
        typeof row?.campus_set_at === "string" && row.campus_set_at.trim() !== "",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
