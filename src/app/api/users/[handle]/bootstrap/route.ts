import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCountsFor, getFollowState, getMutualCount } from "@/lib/connections/queries";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { parseResumeDocRef } from "@/lib/profile/resume-doc-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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
 * viewer-mode render at `/html/profile.html?handle=<handle>` (P1-011b)
 * and logged-out share-link visits (iMessage in-app browser, etc).
 *
 * Response is `vibe_user_v1`-shaped so the same `renderUserSections`
 * code path that paints the owner's data also paints visited users.
 * Counts come from `getCountsFor`; the viewer's connection state to
 * the visited user (none / following / followed_by / connected / self)
 * is included so the Connect button can initialize correctly without
 * a second roundtrip (P1-013). Logged-out visitors get follow state
 * `none` — Connect still 401s until they sign in.
 *
 * The profile row is ALWAYS read with the service-role client against
 * the public column list above: `users` RLS is authenticated-only (so
 * anonymous visitors need it), and `resume_redactions` is no longer
 * SELECT-granted to `authenticated` (migration 20260905100000) because
 * bar geometry must never reach a non-owner — this route strips it
 * below, and the column grant is what makes that strip unbypassable.
 * The viewer's own client is still used for the block / follow reads.
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
  } = await supabase.auth.getUser();

  // `service` reads the profile row (see the docblock); `reader` is the
  // client used for counts / pinned post — the viewer's own when signed
  // in so those reads stay RLS-scoped, the service role otherwise.
  let service: SupabaseClient;
  try {
    service = createSupabaseServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const reader: SupabaseClient = viewer ? supabase : service;

  const { data: row, error } = await service
    .from("users")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    console.error("[users/:handle/bootstrap]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
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
  if (viewer) {
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
  }

  // Logged-out share-link visitors get the profile card but not the
  // documents. Resumes now live in the PRIVATE `resumes` bucket and are
  // only reachable through GET /api/resume/<key>, which itself 401s
  // anonymous callers — this strip stays as defense in depth (and keeps
  // external-link resumes + redaction geometry off the anonymous payload).
  const rowForViewer = viewer
    ? (row as Record<string, unknown>)
    : {
        ...(row as Record<string, unknown>),
        resume_url: null,
        resume_docs: [],
        resume_redactions: [],
        recruiter_snapshot: {},
      };

  const profile = normalizeProfileView(rowForViewer);

  // Signed-in NON-OWNER viewers: redaction bars are burned into the bytes
  // server-side (GET /api/resume/<key> signs a derivative), so the bar
  // geometry must never leave the server — strip it. And because we can
  // only redact files we host, an EXTERNAL-link doc that has bars for its
  // docIndex is hidden from viewers entirely. docIndex is computed on the
  // sanitised portfolio order (resume_docs, or [resume_url] when empty),
  // which is the same order the proxy route uses; indices are read BEFORE
  // filtering so a dropped doc doesn't shift its neighbours' bars.
  if (viewer && viewer.id !== profile.id) {
    const barDocs = new Set(profile.resume_redactions.map((b) => b.docIndex));
    if (profile.resume_docs.length > 0) {
      profile.resume_docs = profile.resume_docs.filter(
        (d, i) => parseResumeDocRef(d.url) !== null || !barDocs.has(i),
      );
      // The portfolio was docs-based; never let an emptied list fall back
      // to a resume_url the viewer was not meant to see (and which the
      // proxy would 404 anyway, since it is not in the portfolio).
      profile.resume_url = null;
    } else if (
      profile.resume_url &&
      parseResumeDocRef(profile.resume_url) === null &&
      barDocs.has(0)
    ) {
      profile.resume_url = null;
    }
    profile.resume_redactions = [];
  }

  // `appShell: true` is for OWNER bootstrap; viewer bootstrap stays
  // false so the persistence layer doesn't try to sync the viewed
  // user's data as if it were the viewer's own.
  const vibeUser = buildVibeUserV1FromProfile(profile, { appShell: false });

  const targetId = profile.id;
  const [counts, follow, mutual] = await Promise.all([
    getCountsFor(reader, targetId),
    viewer
      ? getFollowState(supabase, viewer.id, targetId)
      : Promise.resolve("none" as const),
    // "N mutual" on a visited profile. Deliberately the service client, not
    // `reader`: the intersection has to read the TARGET's connection rows as
    // well as the viewer's, and `reader` is the cookie client whenever a
    // viewer exists, so RLS could silently zero this the way it zeroed view
    // counts. Only the resulting number leaves the route. The helper already
    // returns 0 for a self-view, and we pass 0 when signed out.
    viewer
      ? getMutualCount(service, viewer.id, targetId)
      : Promise.resolve(0),
  ]);

  vibeUser.counts = {
    followers: String(counts.followers),
    following: String(counts.following),
    connections: String(counts.connections),
    mutual: String(mutual),
  };
  vibeUser._isViewerMode = true;
  vibeUser._viewerFollowState = follow;

  // Optional column — split query so missing-column errors during
  // migration deploy lag don't take the whole route down.
  let pinnedPostId: string | null = null;
  try {
    const { data: pinRow } = await reader
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
