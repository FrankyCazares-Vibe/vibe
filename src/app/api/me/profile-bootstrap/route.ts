import { NextResponse } from "next/server";

import { getCountsFor } from "@/lib/connections/queries";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PROFILE_SELECT =
  "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,interests,skills,looking_for,work_experience,recruiter_snapshot";

/**
 * Returns `vibe_user_v1`-shaped JSON for `public/html/profile.html`.
 * Includes real follower / following / connection counts so the profile stats
 * row (P1-014) renders truth instead of demo numbers.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();

  if (error || !row) {
    console.error("[profile-bootstrap GET]", error);
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  const counts = await getCountsFor(supabase, user.id);

  const profile = normalizeProfileView(row as Record<string, unknown>);
  const vibeUser = buildVibeUserV1FromProfile(profile, { appShell: true });
  vibeUser.counts = {
    followers: String(counts.followers),
    following: String(counts.following),
    connections: String(counts.connections),
    mutual: "0",
  };

  return NextResponse.json({ ok: true, vibeUser });
}
