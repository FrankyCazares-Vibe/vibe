import { NextResponse } from "next/server";

import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { viewerMaySeeHiddenOrg } from "@/lib/orgs/hidden-org-access";
import { ORG_ASSET_KEY_PREFIX, signOrgAssetGetUrl } from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; kind: string }> };

const VALID_KINDS = new Set(["banner", "logo"]);

/**
 * A visible club's logo or banner is the same answer for everyone, so the
 * browser keeps the redirect for five minutes (rate limits and upload caps,
 * Oct 15, B1.3): a Discover list or a feed full of one club's posts asks this
 * route once per asset, not once per tile. `private` keeps it out of the CDN,
 * so a club hidden reaches everyone else at once; only a browser that
 * already asked keeps the old answer, and only for those five minutes, well
 * inside the signed link's hour. A logo or banner replaced is a new URL
 * (`orgAssetProxyUrl` puts the key's file name in `?v=`, which this route
 * ignores), so nobody waits on it, the officer who replaced it least of all.
 * A hidden club's answer depends on who is asking, so it never gets this
 * header (the same split `/api/posts/[id]/media` makes).
 */
function publicRedirect(target: string) {
  const res = NextResponse.redirect(target, 307);
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}

/**
 * GET /api/orgs/[slug]/asset/[kind] — proxies R2-stored org assets via a
 * 307 redirect to a freshly-signed GET URL. Lets the rest of the app refer
 * to a stable public path (e.g. `/api/orgs/sae/asset/banner`) without
 * needing to sign URLs everywhere they're rendered.
 *
 * No auth required for a visible org — banners and logos are part of the
 * public profile.
 *
 * HIDDEN ORGS ARE THE EXCEPTION (critic B6). This route reads with the
 * service role, so RLS never saw it and a hidden org kept serving its logo
 * and banner to anyone who knew the handle — the one surface left that could
 * confirm a hidden org exists, and the reason the four test orgs' handles had
 * to be renamed at all. It now costs an auth round trip ONLY when the org is
 * actually hidden, so the common path is unchanged, and members still get
 * their assets: a hidden org keeps its page for the people already in it
 * (spec §3.4), and a page with a missing logo would look broken rather than
 * hidden. Platform admins see them too, because /admin renders the logo of
 * every org it lists, hidden ones included.
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
    .select(`id, hidden_at, ${column}`)
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const hidden = !!(org as { hidden_at?: string | null }).hidden_at;
  const redirect = (target: string) =>
    hidden ? NextResponse.redirect(target, 307) : publicRedirect(target);
  if (hidden) {
    const allowed = await viewerMaySeeHiddenOrg(service, org.id as string);
    if (!allowed) {
      // The same answer a handle that was never registered gets: an asset 404
      // that differed from a missing-org 404 would itself be the leak.
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
  }

  const stored = (org as Record<string, unknown>)[column] as string | null;
  if (!stored) {
    return NextResponse.json({ ok: false, error: "No asset" }, { status: 404 });
  }

  // Forward-compat for direct-set URLs — but only redirect to Supabase
  // storage hosts. Anything else would make this route an open redirect
  // on the app domain.
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    if (!isSupabaseHttpsUrl(stored)) {
      return NextResponse.json({ ok: false, error: "Unrecognized asset" }, { status: 404 });
    }
    return redirect(stored);
  }

  // R2 object key: sign and redirect.
  if (stored.startsWith(ORG_ASSET_KEY_PREFIX)) {
    try {
      const signed = await signOrgAssetGetUrl(stored, 60 * 60); // 1h
      return redirect(signed);
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
