import { NextResponse } from "next/server";

import { ORG_ASSET_KEY_PREFIX, signOrgAssetGetUrl } from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; kind: string }> };

const VALID_KINDS = new Set(["banner", "logo"]);

/**
 * GET /api/orgs/[slug]/asset/[kind] — proxies R2-stored org assets via a
 * 307 redirect to a freshly-signed GET URL. Lets the rest of the app refer
 * to a stable public path (e.g. `/api/orgs/sae/asset/banner`) without
 * needing to sign URLs everywhere they're rendered.
 *
 * No auth required — org banners and logos are part of the public profile.
 *
 * Falls back to passing through any non-R2 stored value (legacy http(s) URL
 * direct-set) for forward compatibility.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug, kind } = await params;
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const column = kind === "banner" ? "banner_url" : "logo_url";
  const { data: org } = await service
    .from("orgs")
    .select(`id, ${column}`)
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const stored = (org as Record<string, unknown>)[column] as string | null;
  if (!stored) {
    return NextResponse.json({ ok: false, error: "No asset" }, { status: 404 });
  }

  // Forward-compat: if someone set a full URL directly, just redirect to it.
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return NextResponse.redirect(stored, 307);
  }

  // R2 object key: sign and redirect.
  if (stored.startsWith(ORG_ASSET_KEY_PREFIX)) {
    try {
      const signed = await signOrgAssetGetUrl(stored, 60 * 60); // 1h
      return NextResponse.redirect(signed, 307);
    } catch (e) {
      console.error("[orgs/[slug]/asset GET]", e);
      return NextResponse.json(
        { ok: false, error: "Could not sign asset" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Unrecognized asset" }, { status: 404 });
}
