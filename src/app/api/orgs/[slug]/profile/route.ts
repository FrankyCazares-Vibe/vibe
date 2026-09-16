import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  isJoinPolicy,
  isOrgAudience,
  orgJoinState,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { loadViewerOrgContext } from "@/lib/orgs/membership";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/orgs/[slug]/profile — public-facing org profile data.
 *
 * Safe to hit anonymously. For *public* orgs returns the full payload
 * (logo, banner, description, links, philanthropy, member count, recent
 * posts). For *private* orgs returns the minimum needed to render a landing
 * card with a Request-to-Join CTA — no member roster, no content, just
 * identity. Service role is used so we can read across RLS without exposing
 * more than the page intentionally surfaces.
 *
 * HIDDEN ORGS ARE GONE FROM HERE FOR EVERYONE BUT THEIR MEMBERS (spec §3.4).
 * A hidden org is not deleted — its members keep the page and the chats — so
 * the 404 is conditional on membership, not on the flag alone. Platform
 * admins see it too, because /admin is where an org gets unhidden and a
 * broken preview there would be its own bug.
 *
 * `viewer.join_state` is the ONE decision (`orgJoinState`, spec §3.2), the
 * same value the org page, Discover, the phone Orgs tab and onboarding
 * render. It is here so no caller has to re-derive "can I join?" from
 * `is_public` — five copies of that rule is five chances to offer a Join
 * button the server answers with 403. `viewer.role` and
 * `viewer.pending_request` keep their old shape and meaning for callers that
 * predate it.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, created_at, campus_id, join_policy, audience, hidden_at"
    )
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  // Junk in either column reads as the most permissive real setting the CHECK
  // constraints allow — which is also each column's default. Never invent a
  // restriction that is not on the row.
  const joinPolicy: JoinPolicy = isJoinPolicy(org.join_policy) ? org.join_policy : "open";
  const audience: OrgAudience = isOrgAudience(org.audience) ? org.audience : "both";
  const hiddenAt = (org.hidden_at as string | null) ?? null;

  // Viewer's relationship to this org (so the page can show Open in Campus
  // vs Join vs Request to Join). May be null for anonymous viewers.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const ctx = user ? await loadViewerOrgContext(service, org.id as string, user.id) : null;
  if (ctx && !ctx.ok) {
    // A failed context read would render a member as an unverified stranger
    // and tell them to go verify a school email they verified months ago.
    // Say the request failed instead of quietly lying about who they are.
    return NextResponse.json(
      { ok: false, error: "Request failed", code: "load_failed" },
      { status: 500 },
    );
  }

  const decision = ctx
    ? orgJoinState({
        org: {
          join_policy: joinPolicy,
          audience,
          hidden_at: hiddenAt,
          campus_id: (org.campus_id as string | null) ?? null,
        },
        viewer: ctx.viewer,
        role: ctx.role,
        pendingInvite: ctx.pendingInvite,
        pendingRequest: ctx.pendingRequest,
      })
    : null;

  // Anonymous viewers and signed-in non-members get the same answer a handle
  // that was never registered gets. `orgJoinState` already folds the
  // member/platform-admin exceptions into `not_found`.
  if (hiddenAt && (!decision || decision.state === "not_found")) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  const { count: memberCount } = await service
    .from("org_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", org.id);

  // Public *profile* surfaces the same shape regardless of the join policy.
  // The privacy boundary is on the channels (RLS), not on the org's
  // description/posts — visitors need that context to decide whether to ask
  // to join, or whether an invite is worth accepting.
  const { data: posts } = await service
    .from("posts")
    .select(
      "id, type, content, media_url, media_thumbnail_url, created_at, user:user_id(id, handle, name, avatar_url)"
    )
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(24);
  // PostgREST infers the embedded `user` join as an array; the actual
  // shape at runtime is a single object (or null) since user_id is a 1:1
  // FK. The double-cast through `unknown` quiets the TS overlap check.
  const allPosts = (posts || []) as unknown as Array<{
    id: string;
    type: string;
    content: string;
    media_url: string | null;
    media_thumbnail_url: string | null;
    created_at: string;
    user: { id: string; handle: string; name: string; avatar_url: string | null } | null;
  }>;
  const signedAll = allPosts.map((p) => withPostMediaUrls(p));
  // Clips are backlogged — only `type='post'` rows surface on org profiles.
  const postRows = signedAll.filter((p) => p.type === "post").slice(0, 12);

  // Listed field by field rather than spread, so a column added to the select
  // above (or to the table) can never ship to an anonymous caller by
  // accident. `hidden_at` is the live example: the timestamp says WHEN a
  // platform admin acted, which is nobody else's business, and every caller
  // only ever asks the boolean — the same `hidden` shape `filter=mine` in
  // `/api/orgs` returns (spec §4.2).
  return NextResponse.json({
    ok: true,
    org: {
      id: org.id as string,
      handle: org.handle as string,
      name: org.name as string,
      description: org.description as string | null,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
      is_public: !!org.is_public,
      backdrop_preset: (org.backdrop_preset as string | null) ?? null,
      verified: !!org.verified,
      last_activity_at: (org.last_activity_at as string | null) ?? null,
      links: org.links ?? null,
      philanthropy: (org.philanthropy as string | null) ?? null,
      created_at: org.created_at as string,
      campus_id: (org.campus_id as string | null) ?? null,
      join_policy: joinPolicy,
      audience,
      hidden: !!hiddenAt,
      member_count: memberCount ?? 0,
    },
    viewer: {
      role: ctx?.role ?? null,
      pending_request: !!ctx?.pendingRequest,
      join_state: decision?.state ?? null,
      join_reason: decision?.reason ?? null,
      // `audience` on the decision is only set when it is the REASON they are
      // blocked; the org's own setting is on `org.audience` either way.
      pending_invite:
        decision?.state === "invited" && ctx?.pendingInvite
          ? {
              id: ctx.pendingInvite.id,
              expires_at: ctx.pendingInvite.expires_at,
            }
          : null,
    },
    posts: postRows,
  });
}
