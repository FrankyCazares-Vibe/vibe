import { NextResponse } from "next/server";

import {
  CLIP_KEY_PREFIX,
  ORG_ASSET_KEY_PREFIX,
  signClipGetUrl,
  signOrgAssetGetUrl,
} from "@/lib/r2";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };
type Variant = "media" | "thumbnail";

/**
 * GET /api/posts/[id]/media[?variant=thumbnail]
 *
 * Proxies a post's stored media URL via a 307 redirect to a freshly signed
 * R2 GET URL. Lets the rest of the app render `<img src="/api/posts/...">`
 * without per-render signing.
 *
 * Service role read — visibility is intentionally permissive: org-tagged
 * posts surface on org profiles (always public), and user posts will be
 * gated by their own RLS in a later iteration. For v1 we don't expose the
 * media URL beyond what already-loaded API responses carry.
 *
 * Drafts are the exception: served to their author only (session user ==
 * posts.user_id), because the author can open their own draft through
 * /api/posts/[id] and its media has to render there. Everyone else —
 * signed out or another student — gets the same 404 as a missing post.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const variant: Variant =
    url.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "media";

  const service = createSupabaseServiceClient();
  const column = variant === "thumbnail" ? "media_thumbnail_url" : "media_url";

  const { data } = await service
    .from("posts")
    .select(`id, user_id, status, ${column}`)
    .eq("id", id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Drafts must never be reachable by id from anyone but their author.
  // Same 404 as a missing post, so the response doesn't confirm a draft
  // exists.
  const isPublished = row.status === "published";
  if (!isPublished) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== row.user_id) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
  }

  // An author-only answer depends on the session cookie — keep it out of
  // any shared cache.
  const redirect = (target: string) => {
    const res = NextResponse.redirect(target, 307);
    if (!isPublished) res.headers.set("Cache-Control", "private, no-store");
    return res;
  };

  const stored = row[column] as string | null;
  if (!stored) {
    return NextResponse.json({ ok: false, error: "No media" }, { status: 404 });
  }

  // Pre-existing http(s) URLs pass through unchanged.
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    // Only our own Supabase Storage host — anything else would make this
    // endpoint an open redirect on the app domain.
    if (!isSupabaseHttpsUrl(stored)) {
      return NextResponse.json({ ok: false, error: "Unrecognized media" }, { status: 404 });
    }
    return redirect(stored);
  }

  try {
    if (stored.startsWith(ORG_ASSET_KEY_PREFIX)) {
      // orgs/<org_id>/posts/<uuid>.<ext> — signed via the org-asset helper.
      const signed = await signOrgAssetGetUrl(stored, 60 * 60);
      return redirect(signed);
    }
    if (stored.startsWith(CLIP_KEY_PREFIX)) {
      const signed = await signClipGetUrl(stored, 60 * 60);
      return redirect(signed);
    }
  } catch (e) {
    console.error("[posts/[id]/media GET]", e);
    return NextResponse.json(
      { ok: false, error: "Could not sign media" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: false, error: "Unrecognized media" }, { status: 404 });
}
