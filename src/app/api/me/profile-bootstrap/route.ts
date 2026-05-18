import { NextResponse } from "next/server";

import { getCountsFor } from "@/lib/connections/queries";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// pinned_post_id is fetched in a separate try/catch below so a
// migration-lag situation (column doesn't exist yet) can't 404 the
// whole bootstrap and lock the user out of their profile.
const PROFILE_SELECT =
  "id,email,name,handle,handle_changed_at,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,interests,skills,looking_for,work_experience,work_order_manual,recruiter_snapshot,current_on,resume_redactions";

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
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Profile not found" },
      { status: 404 },
    );
  }

  // Optional column — split out so missing-column errors (during
  // migration deploy lag) don't take the whole bootstrap down.
  let pinnedPostId: string | null = null;
  try {
    const { data: pinRow } = await supabase
      .from("users")
      .select("pinned_post_id")
      .eq("id", user.id)
      .maybeSingle();
    if (pinRow && typeof pinRow.pinned_post_id === "string") {
      pinnedPostId = pinRow.pinned_post_id;
    }
  } catch {
    /* column may not exist yet; ignore */
  }

  const counts = await getCountsFor(supabase, user.id);

  // Platform-admin flag — surfaced so the LeftNav can render the Admin link
  // without a second roundtrip. Defensive: if the column is missing (a
  // pre-governance environment), treat as false so the field still resolves.
  let isPlatformAdmin = false;
  try {
    const { data: adminRow } = await supabase
      .from("users")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle();
    isPlatformAdmin = !!adminRow?.is_platform_admin;
  } catch {
    /* column may not exist yet; treat as not-admin */
  }

  const profile = normalizeProfileView(row as Record<string, unknown>);
  const vibeUser = buildVibeUserV1FromProfile(profile, { appShell: true });
  vibeUser.counts = {
    followers: String(counts.followers),
    following: String(counts.following),
    connections: String(counts.connections),
    mutual: "0",
  };
  // Pass through cooldown metadata so the inline editor can show
  // "you can change again in N days" without a second roundtrip.
  vibeUser.handleChangedAt = (row as { handle_changed_at?: string | null }).handle_changed_at ?? null;
  // Major + year exposed so the inline editor can prefill them — the
  // VibeUser shape normally only encodes these into `headline`, which
  // isn't reversible for editing.
  vibeUser.major = (row as { major?: string | null }).major ?? null;
  vibeUser.year = (row as { year?: number | null }).year ?? null;
  // Pinned post id (from the optional split query above).
  vibeUser.pinnedPostId = pinnedPostId;

  return NextResponse.json({ ok: true, vibeUser, isPlatformAdmin });
}
