import { NextResponse } from "next/server";

import {
  CLIP_KEY_PREFIX,
  ORG_ASSET_KEY_PREFIX,
  signClipGetUrl,
  signOrgAssetGetUrl,
} from "@/lib/r2";
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
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const variant: Variant =
    url.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "media";

  const service = createSupabaseServiceClient();
  const column = variant === "thumbnail" ? "media_thumbnail_url" : "media_url";

  const { data: row } = await service
    .from("posts")
    .select(`id, ${column}`)
    .eq("id", id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const stored = (row as Record<string, unknown>)[column] as string | null;
  if (!stored) {
    return NextResponse.json({ ok: false, error: "No media" }, { status: 404 });
  }

  // Pre-existing http(s) URLs pass through unchanged.
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return NextResponse.redirect(stored, 307);
  }

  try {
    if (stored.startsWith(ORG_ASSET_KEY_PREFIX)) {
      // orgs/<org_id>/posts/<uuid>.<ext> — signed via the org-asset helper.
      const signed = await signOrgAssetGetUrl(stored, 60 * 60);
      return NextResponse.redirect(signed, 307);
    }
    if (stored.startsWith(CLIP_KEY_PREFIX)) {
      const signed = await signClipGetUrl(stored, 60 * 60);
      return NextResponse.redirect(signed, 307);
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
