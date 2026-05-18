import { NextResponse } from "next/server";

import { getCountsFor, getFollowState } from "@/lib/connections/queries";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// PUBLIC profile fields only — `email` and `school_email` are intentionally
// excluded so a visitor never sees another user's contact addresses. If we
// add `otto_answers`, `voice_samples`, or other private columns later they
// stay off this list by default.
// pinned_post_id is fetched in a split try/catch below so a column-
// missing situation (migration deploy lag) can't 404 the whole route.
const PUBLIC_PROFILE_SELECT =
  "id,name,handle,school,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,recruiter_snapshot,current_on,resume_redactions";

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

  // Block-aware short-circuit. One round-trip pulls every block row
  // between viewer + target (both directions) so we can answer:
  //   - target blocked viewer  → "Profile unavailable. This account has
  //                              restricted you." (no Unblock; we don't
  //                              leak that the block came from them)
  //   - viewer blocked target  → "You blocked Andres. Unblock to see
  //                              their content." (Unblock CTA)
  // RLS on `blocks` allows either party to read the row (migration
  // 20260515000000_blocks_select_either_party). Posts, bio, counts are
  // NOT included in either branch — both intentionally omit content.
  const targetIdRaw = (row as { id: string }).id;
  const { data: blockRows } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${targetIdRaw},blocked_id.eq.${viewer.id}),` +
        `and(blocker_id.eq.${viewer.id},blocked_id.eq.${targetIdRaw})`,
    );
  const targetBlockedViewer = (blockRows ?? []).some(
    (r) =>
      (r as { blocker_id: string }).blocker_id === targetIdRaw &&
      (r as { blocked_id: string }).blocked_id === viewer.id,
  );
  const viewerBlockedTarget = (blockRows ?? []).some(
    (r) =>
      (r as { blocker_id: string }).blocker_id === viewer.id &&
      (r as { blocked_id: string }).blocked_id === targetIdRaw,
  );
  if (targetBlockedViewer || viewerBlockedTarget) {
    return NextResponse.json({
      ok: true,
      blockedByTarget: targetBlockedViewer,
      viewerHasBlocked: viewerBlockedTarget,
      vibeUser: {
        id: targetIdRaw,
        name: (row as { name: string | null }).name,
        handle: (row as { handle: string | null }).handle,
        avatarPhoto: (row as { avatar_url: string | null }).avatar_url,
        _isViewerMode: true,
        _viewerFollowState: "none",
        _blockedByTarget: targetBlockedViewer,
        _viewerHasBlocked: viewerBlockedTarget,
      },
    });
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

  // Optional column — split query so missing-column errors during
  // migration deploy lag don't take the whole route down.
  let pinnedPostId: string | null = null;
  try {
    const { data: pinRow } = await supabase
      .from("users")
      .select("pinned_post_id")
      .eq("id", profile.id)
      .maybeSingle();
    if (pinRow && typeof pinRow.pinned_post_id === "string") {
      pinnedPostId = pinRow.pinned_post_id;
    }
  } catch {
    /* column may not exist yet; ignore */
  }
  vibeUser.pinnedPostId = pinnedPostId;

  return NextResponse.json({ ok: true, vibeUser });
}
