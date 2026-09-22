import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCountsFor, getFollowState, getMutualCount } from "@/lib/connections/queries";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { buildVibeUserV1FromProfile } from "@/lib/profile/build-vibe-user-v1";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { PUBLIC_PROFILE_CAMPUS_COLUMNS } from "@/lib/profile/profile-campus-write";
import { parseResumeDocRef } from "@/lib/profile/resume-doc-url";
import {
  hasUnmatchedRedactions,
  redactedDocIndexes,
  resumePortfolioRefList,
  sanitizeResumeRedactions,
} from "@/lib/profile/resume-redactions";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// PUBLIC profile fields only — `email` and `school_email` are intentionally
// excluded so a visitor never sees another user's contact addresses. If we
// add `otto_answers`, `voice_samples`, or other private columns later they
// stay off this list by default.
// pinned_post_id is fetched in a split try/catch below so a column-
// missing situation (migration deploy lag) can't 404 the whole route.
const BASE_PUBLIC_PROFILE_SELECT =
  "id,name,handle,school,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,current_on,resume_redactions";

// The badge on someone ELSE's profile now comes from `school_system` +
// `campus_id` (critic C1): without these two columns every visited profile
// would silently lose its "IU Indianapolis" badge the moment B6 stopped
// deriving it from the legacy `school` label. `campus_set_at` is NOT here —
// when a student last changed campus is nobody else's business.
const PUBLIC_PROFILE_SELECT = `${BASE_PUBLIC_PROFILE_SELECT},${PUBLIC_PROFILE_CAMPUS_COLUMNS}`;

type PublicProfileRead = {
  data: Record<string, unknown> | null;
  error: { code?: string | null; message?: string | null } | null;
};

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

  // `service` reads the profile row (see the docblock) and the counts;
  // `reader` is the client used for the pinned post — the viewer's own
  // when signed in so that read stays RLS-scoped, the service role
  // otherwise.
  let service: SupabaseClient;
  try {
    service = createSupabaseServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const reader: SupabaseClient = viewer ? supabase : service;

  // Before migration M1 the campus columns don't exist; a missing-column
  // error (and only that) falls back to the legacy label, which still
  // renders a badge.
  let { data: row, error } = (await service
    .from("users")
    .select(PUBLIC_PROFILE_SELECT)
    .eq("handle", handle)
    .maybeSingle()) as PublicProfileRead;
  if (error && isMissingColumnError(error)) {
    ({ data: row, error } = (await service
      .from("users")
      .select(BASE_PUBLIC_PROFILE_SELECT)
      .eq("handle", handle)
      .maybeSingle()) as PublicProfileRead);
  }

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
  // The read goes through the one block-pair module (rulings M11), the same
  // as the three list routes. A refused read is unknown, not "not blocked":
  // it answers 500, because the profile, and the counts read below with the
  // service client, must never reach a blocked viewer.
  const targetIdRaw = (row as { id: string }).id;
  if (viewer) {
    const pair = await loadPairBlock(supabase, viewer.id, targetIdRaw);
    if (!pair.ok) {
      console.error("[users/:handle/bootstrap blocks]", pair.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (pair.blocked) {
      const viewerBlockedTarget = pair.viewerBlockedTarget;
      // `blocked` with neither flag set is loadPairBlock failing closed on a
      // row it could not place. Show the neutral "Profile unavailable" copy,
      // which offers no Unblock.
      const targetBlockedViewer = pair.targetBlockedViewer || !viewerBlockedTarget;
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
  // "What are you here for?" is blanked too (ruling H6): students answered
  // it in onboarding without being told it would show on their profile, so
  // only its owner sees it (`vibeUser.lookingFor` is `[]` here).
  const rowForViewer = viewer
    ? (row as Record<string, unknown>)
    : {
        ...(row as Record<string, unknown>),
        resume_url: null,
        resume_docs: [],
        resume_redactions: [],
        looking_for: [],
      };

  const profile = normalizeProfileView(rowForViewer);

  // Signed-in NON-OWNER viewers: redaction bars are burned into the bytes
  // server-side (GET /api/resume/<key> signs a derivative), so the bar
  // geometry must never leave the server — strip it. And because we can
  // only redact files we host, an EXTERNAL-link doc that has bars is hidden
  // from viewers entirely. A bar covers a document by its docKey (legacy
  // bars: by position in the sanitised portfolio — resume_docs, or
  // [resume_url] when empty — the same list the proxy route uses), worked
  // out BEFORE filtering so a dropped doc can't shift its neighbours' bars.
  // Fail closed: when any bar covers no listed document the bars and the
  // list are out of step, nobody can say which external doc a bar was for,
  // so every external doc is hidden (the proxy refuses the hosted ones).
  // The stored bars are read strictly (as the proxy reads them): a key that
  // names nothing storable counts as unmatched rather than as a position.
  if (viewer && viewer.id !== profile.id) {
    const refs = resumePortfolioRefList(profile.resume_docs, profile.resume_url);
    const storedBars = sanitizeResumeRedactions(
      (row as Record<string, unknown>).resume_redactions,
      { strict: true },
    );
    const outOfStep = hasUnmatchedRedactions(storedBars, refs);
    const redacted = redactedDocIndexes(storedBars, refs);
    const hideExternal = (i: number) => outOfStep || redacted.has(i);
    if (profile.resume_docs.length > 0) {
      profile.resume_docs = profile.resume_docs.filter(
        (d, i) => parseResumeDocRef(d.url) !== null || !hideExternal(i),
      );
      // The portfolio was docs-based; never let an emptied list fall back
      // to a resume_url the viewer was not meant to see (and which the
      // proxy would 404 anyway, since it is not in the portfolio).
      profile.resume_url = null;
    } else if (
      profile.resume_url &&
      parseResumeDocRef(profile.resume_url) === null &&
      hideExternal(0)
    ) {
      profile.resume_url = null;
    }
    profile.resume_redactions = [];
    // Ruling H6: the "Here for" answer is shown to its owner only, until
    // Franky decides whether it becomes public. Blanked for every other
    // signed-in viewer, the same as for the signed-out branch above.
    profile.looking_for = [];
  }

  // `appShell: true` is for OWNER bootstrap; viewer bootstrap stays
  // false so the persistence layer doesn't try to sync the viewed
  // user's data as if it were the viewer's own.
  const vibeUser = buildVibeUserV1FromProfile(profile, { appShell: false });

  const targetId = profile.id;
  const [counts, follow, mutual] = await Promise.all([
    // Service client (T1): policy `connections_select_either_party` shows the
    // viewer's own client only edges they are part of, so the target's
    // follower / following / connection counts need service. Safe here:
    // blocked pairs were answered above, counts are public, and only the
    // three numbers leave (`vibeUser.counts` below).
    getCountsFor(service, targetId),
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
