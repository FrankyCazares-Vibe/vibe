import { NextResponse } from "next/server";

import { getCountsFor } from "@/lib/connections/queries";
import { campusByLabel } from "@/lib/iu/campuses";
import { termsRequiredResponse } from "@/lib/legal/require-terms";
import { hasRecordedConsent } from "@/lib/legal/terms";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// pinned_post_id is fetched in a separate try/catch below so a
// migration-lag situation (column doesn't exist yet) can't 404 the
// whole bootstrap and lock the user out of their profile.
const PROFILE_SELECT =
  "id,email,name,handle,handle_changed_at,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,recruiter_snapshot,current_on,resume_redactions,terms_accepted_at,terms_version,age_attested_at";

/**
 * Returns `vibe_user_v1`-shaped JSON for `public/html/profile.html`.
 * Includes real follower / following / connection counts so the profile stats
 * row (P1-014) renders truth instead of demo numbers.
 *
 * Consent gate (S53 A4): the static `?app=1` shells bootstrap through this
 * route with no server page in front of them, so a user without a complete,
 * current consent record gets 403 `terms_required` (public/html/_persistence.js
 * forwards them to /auth/terms). `termsAccepted` / `termsVersion` are still
 * exposed top-level (not on `vibeUser`) for clients that want the flag.
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

  // PROFILE_SELECT includes email / school_email, which are private
  // columns (no RLS read). Self-read via the service role scoped to the
  // signed-in user's id.
  const { data: row, error } = await createSupabaseServiceClient()
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

  // Consent record (S53 A4) — service-role-only columns; surfaced as flags,
  // never editable from the client. No record → 403 so the static shells
  // redirect to the interstitial instead of running signed-in.
  const consentRow = row as {
    terms_accepted_at?: string | null;
    terms_version?: string | null;
    age_attested_at?: string | null;
  };
  const termsAccepted = hasRecordedConsent(consentRow);
  if (!termsAccepted) return termsRequiredResponse();
  const termsVersion = consentRow.terms_version ?? null;

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

  // Self-declared campus, surfaced TOP-LEVEL (not on `vibeUser`, whose
  // shape profile.html already depends on) so the campus pickers can
  // prefill the current selection. Canonical label, or null when the user
  // never picked one / the stored value isn't a known IU campus — the
  // badge inside `vibeUser` degrades to "IU verified" in the same case.
  const campus = campusByLabel(profile.school)?.label ?? null;

  return NextResponse.json({
    ok: true,
    vibeUser,
    campus,
    isPlatformAdmin,
    termsAccepted,
    termsVersion,
  });
}
