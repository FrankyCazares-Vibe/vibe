import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CLIP_KEY_PREFIX,
  ORG_ASSET_KEY_PREFIX,
  signClipGetUrl,
  signOrgAssetGetUrl,
} from "@/lib/r2";
import { getActiveRestriction } from "@/lib/moderation/access";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { orgContentAccess } from "@/lib/orgs/hidden-org-access";
import { postMediaKeyKind } from "@/lib/posts/media-ownership";
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
 * gated by their own RLS in a later iteration. There is deliberately no
 * signed-out gate here; whether signed-out visitors see media is a separate
 * product decision (S67 security report, roadmap).
 *
 * Drafts are the exception: served to their author only (session user ==
 * posts.user_id), because the author can open their own draft through
 * /api/posts/[id] and its media has to render there. Everyone else —
 * signed out or another student — gets the same 404 as a missing post.
 *
 * Moderation (S67 security wave, report risk #10): a post a moderator removed
 * (`removed_at` set), or one whose author has a suspension or ban in force,
 * answers only its author and platform admins. Everyone else gets the same
 * 404 as a missing post. A failed restriction read fails closed.
 *
 * Hidden clubs are the other exception (T2 D). A club post's media key is
 * `orgs/<org_id>/posts/...`, so a 307 here would hand out the hidden club's
 * id and its media to anyone holding the post id. A hidden club's post
 * answers only its members and platform admins (orgContentAccess); everyone
 * else gets the same 404 as a missing post, with no Location header.
 *
 * WHICH KEYS GET SIGNED (S67 security wave): a `clips/` key only inside the
 * post author's own `clips/<user_id>/` folder, an `orgs/` key only on a club
 * post and inside `orgs/<org_id>/`. A row pointing anywhere else (written
 * straight through PostgREST to re-post someone else's video, or a hidden
 * club's) is "Unrecognized media".
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const variant: Variant =
    url.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "media";
  const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const service = createSupabaseServiceClient();
  const column = variant === "thumbnail" ? "media_thumbnail_url" : "media_url";

  const { data } = await service
    .from("posts")
    .select(`id, user_id, status, org_id, removed_at, ${column}`)
    .eq("id", id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return notFound();

  // The session user, read at most once and only when an answer depends on it.
  let viewer: string | null | undefined;
  const viewerId = async (): Promise<string | null> => {
    if (viewer === undefined) {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      viewer = user?.id ?? null;
    }
    return viewer;
  };

  // Drafts must never be reachable by id from anyone but their author.
  // Same 404 as a missing post, so the response doesn't confirm a draft
  // exists.
  const isPublished = row.status === "published";
  if (!isPublished) {
    const me = await viewerId();
    if (!me || me !== row.user_id) return notFound();
  }

  // Removed by a moderator, or the author is suspended or banned: the author
  // and platform admins only. Fails closed on a restriction read error.
  const isRemoved = row.removed_at !== null && row.removed_at !== undefined;
  let authorRestricted = false;
  if (typeof row.user_id === "string" && row.user_id) {
    const lookup = await getActiveRestriction(row.user_id);
    authorRestricted = !lookup.ok || lookup.restriction !== null;
  }
  if (isRemoved || authorRestricted) {
    const me = await viewerId();
    const allowed = me !== null && (me === row.user_id || (await isPlatformAdmin(service, me)));
    if (!allowed) return notFound();
  }

  // A hidden club's post is served to its members and platform admins only.
  // Fails closed: a read error or a missing club row is the same 404.
  let hiddenClub = false;
  if (typeof row.org_id === "string" && row.org_id) {
    const access = await orgContentAccess(service, row.org_id, "[posts/[id]/media org check]");
    if (!access.allowed) return notFound();
    hiddenClub = access.hidden;
  }

  // An answer that depended on the session cookie (a draft, a hidden club's
  // post, a removed post or a restricted author) stays out of any shared cache.
  const privateAnswer = !isPublished || hiddenClub || isRemoved || authorRestricted;
  const redirect = (target: string) => {
    const res = NextResponse.redirect(target, 307);
    if (privateAnswer) res.headers.set("Cache-Control", "private, no-store");
    return res;
  };

  const stored = row[column] as string | null;
  if (!stored) {
    return NextResponse.json({ ok: false, error: "No media" }, { status: 404 });
  }
  const unrecognized = () =>
    NextResponse.json({ ok: false, error: "Unrecognized media" }, { status: 404 });

  // Pre-existing http(s) URLs pass through unchanged.
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    // Only our own Supabase Storage host — anything else would make this
    // endpoint an open redirect on the app domain.
    if (!isSupabaseHttpsUrl(stored)) return unrecognized();
    return redirect(stored);
  }

  const kind = postMediaKeyKind(stored, { user_id: row.user_id, org_id: row.org_id });
  try {
    // orgs/<org_id>/posts/<uuid>.<ext> — signed via the org-asset helper.
    if (kind === "org") return redirect(await signOrgAssetGetUrl(stored, 60 * 60));
    if (kind === "clip") return redirect(await signClipGetUrl(stored, 60 * 60));
  } catch (e) {
    console.error("[posts/[id]/media GET]", e);
    return NextResponse.json(
      { ok: false, error: "Could not sign media" },
      { status: 500 },
    );
  }

  // Only a row written around the app carries a key outside its owner's
  // folder. Log it (no key, no ids beyond the post) so it can be found.
  if (stored.startsWith(CLIP_KEY_PREFIX) || stored.startsWith(ORG_ASSET_KEY_PREFIX)) {
    console.warn("[posts/[id]/media GET] refused a key outside the post's own folder", {
      postId: id,
    });
  }
  return unrecognized();
}

/** Is this user a platform admin? Service-role read; any error answers no. */
async function isPlatformAdmin(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await service
    .from("users")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[posts/[id]/media admin check]", error.message);
    return false;
  }
  return (data as { is_platform_admin?: unknown } | null)?.is_platform_admin === true;
}
