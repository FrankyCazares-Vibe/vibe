import { NextResponse } from "next/server";

import { getCountsFor, getFollowState } from "@/lib/connections/queries";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// PUBLIC profile fields only — `email` and `school_email` are intentionally
// excluded so a visitor never sees another user's contact addresses. If we
// add `otto_answers`, `voice_samples`, or other private columns later they
// stay off this list by default.
const PUBLIC_PROFILE_SELECT =
  "id,name,handle,school,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,interests,skills,looking_for,work_experience,recruiter_snapshot";

type RouteContext = { params: Promise<{ handle: string }> };

/**
 * Public profile bootstrap by handle. Powers the static prototype's
 * viewer-mode render at `/html/profile.html?handle=<handle>` (P1-011b).
 *
 * Response is `vibe_user_v1`-shaped so the same `renderUserSections`
 * code path that paints the owner's data also paints visited users.
 * Counts come from `getCountsFor`; the viewer's connection state to
 * the visited user (none / following / followed_by / connected / self)
 * is included so the Connect button can initialize correctly without
 * a second roundtrip (P1-013).
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("users")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    console.error("[users/:handle/bootstrap]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const profile = normalizeProfileView(row as Record<string, unknown>);
  // `appShell: true` is for OWNER bootstrap; viewer bootstrap stays
  // false so the persistence layer doesn't try to sync the viewed
  // user's data as if it were the viewer's own.
  const vibeUser = buildVibeUserV1FromProfile(profile, { appShell: false });

  const targetId = profile.id;
  const [counts, follow] = await Promise.all([
    getCountsFor(supabase, targetId),
    getFollowState(supabase, viewer.id, targetId),
  ]);

  vibeUser.counts = {
    followers: String(counts.followers),
    following: String(counts.following),
    connections: String(counts.connections),
    mutual: "0",
  };
  vibeUser._isViewerMode = true;
  vibeUser._viewerFollowState = follow;

  return NextResponse.json({ ok: true, vibeUser });
}
