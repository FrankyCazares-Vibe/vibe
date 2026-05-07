import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/orgs/[slug]/profile — public-facing org profile data.
 *
 * Safe to hit anonymously. For *public* orgs returns the full payload
 * (logo, banner, description, links, philanthropy, member count, recent
 * posts/clips). For *private* orgs returns the minimum needed to render a
 * landing card with a Request-to-Join CTA — no member roster, no content,
 * just identity. Service role is used so we can read across RLS without
 * exposing more than the page intentionally surfaces.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, created_at"
    )
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { count: memberCount } = await service
    .from("org_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", org.id);

  // Viewer's relationship to this org (so the page can show Open in Campus
  // vs Join vs Request to Join). May be null for anonymous viewers.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let viewerRole: string | null = null;
  let pendingRequest = false;
  if (user) {
    const { data: m } = await service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();
    viewerRole = (m?.role as string | undefined) ?? null;
    if (!viewerRole) {
      const { data: r } = await service
        .from("org_join_requests")
        .select("id")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      pendingRequest = !!r;
    }
  }

  // Public *profile* surfaces the same shape regardless of `is_public`. The
  // privacy boundary is on the channels (RLS), not on the org's
  // description/posts/clips — visitors need that context to decide whether
  // to request access.
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
  const signedAll = allPosts.map((p) => ({
    ...p,
    media_url: postMediaProxyUrl(p.id, p.media_url, "media"),
    media_thumbnail_url: postMediaProxyUrl(p.id, p.media_thumbnail_url, "thumbnail"),
  }));
  const postRows = signedAll.filter((p) => p.type === "post").slice(0, 12);
  const clipRows = signedAll.filter((p) => p.type === "clip").slice(0, 12);

  return NextResponse.json({
    ok: true,
    org: {
      ...org,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
      member_count: memberCount ?? 0,
    },
    viewer: { role: viewerRole, pending_request: pendingRequest },
    posts: postRows,
    clips: clipRows,
  });
}
