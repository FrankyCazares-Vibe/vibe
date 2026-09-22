import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Who may see a HIDDEN club's things: its logo and banner, its posts and
 * their media, and everything hung on a post (likes, comments, saves,
 * reposts, views). Moved here from
 * `src/app/api/orgs/[slug]/asset/[kind]/route.ts` (T2 D3) so every route that
 * reads a club with the service role asks the same question the same way.
 *
 * Routes that read with the service role skip RLS, so `orgs_select` never
 * hides a hidden club from them. Each one has to ask here instead.
 *
 * The rule, everywhere: the post's author, anyone when the club isn't hidden,
 * the club's members, and platform admins. A club row that can't be read or
 * doesn't exist is "not allowed". orgContentAccess knows only the club, so
 * the author exemption is the caller's to apply (postAccessForCaller does).
 */

/**
 * May the person making this request see a HIDDEN org? True for its members
 * and for platform admins; false for everyone else, including signed-out
 * callers.
 *
 * Only call it when the org is hidden, so an ordinary request still costs
 * exactly one query. Fails CLOSED on any error — the whole point of hidden is
 * that a bad day for the database does not put the org back on the internet.
 */
export async function viewerMaySeeHiddenOrg(
  service: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const [memberRes, viewerRes] = await Promise.all([
      service
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle(),
      service
        .from("users")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    if (memberRes.error || viewerRes.error) {
      console.error("[hidden-org-access]", memberRes.error ?? viewerRes.error);
      return false;
    }
    if (memberRes.data) return true;
    return (viewerRes.data as { is_platform_admin?: unknown } | null)?.is_platform_admin === true;
  } catch (e) {
    console.error("[hidden-org-access]", e);
    return false;
  }
}

export type OrgContentAccess = { allowed: true; hidden: boolean } | { allowed: false };

/**
 * Something that belongs to a club (a post, its media, a like on it): may
 * this request see it?
 *   - the club is not hidden → { allowed: true, hidden: false }, one query;
 *   - it is hidden → viewerMaySeeHiddenOrg decides; allowed answers carry
 *     hidden: true so the caller keeps the answer out of shared caches;
 *   - a read error, or no club row → { allowed: false }, logged under
 *     `logTag`. Fails CLOSED: callers answer the same 404 as a missing post.
 */
export async function orgContentAccess(
  service: SupabaseClient,
  orgId: string,
  logTag: string,
): Promise<OrgContentAccess> {
  try {
    const { data, error } = await service
      .from("orgs")
      .select("hidden_at")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) {
      console.error(logTag, error ?? "no org row");
      return { allowed: false };
    }
    if (!(data as { hidden_at?: string | null }).hidden_at) {
      return { allowed: true, hidden: false };
    }
    const allowed = await viewerMaySeeHiddenOrg(service, orgId);
    return allowed ? { allowed: true, hidden: true } : { allowed: false };
  } catch (e) {
    console.error(logTag, e);
    return { allowed: false };
  }
}

/**
 * orgContentAccess for a route that has no service client of its own. With
 * no service role configured the club can't be checked, so the answer is
 * { allowed: false }, logged: a misconfigured deploy must not put a hidden
 * club back on the internet.
 */
export async function orgContentAccessAsService(
  orgId: string,
  logTag: string,
): Promise<OrgContentAccess> {
  if (!isSupabaseServiceConfigured()) {
    console.error(logTag, "service role not configured");
    return { allowed: false };
  }
  let service: SupabaseClient;
  try {
    service = createSupabaseServiceClient();
  } catch (e) {
    console.error(logTag, e);
    return { allowed: false };
  }
  return orgContentAccess(service, orgId, logTag);
}

export type PostAccess =
  | { ok: true; hidden: boolean }
  | { ok: false; reason: "not_found" | "error" };

/**
 * May the signed-in caller use this post: open its comments, comment on it,
 * save it, repost it, count a view on it?
 *
 *   - not a uuid, no row, or a hidden club's post the caller may not see →
 *     "not_found". The route answers exactly what it answers for a missing
 *     post, so a hidden post and a missing one can't be told apart;
 *   - the post read itself failed → "error" (nothing about the post was
 *     learned, so a 500 gives nothing away);
 *   - otherwise ok. `hidden: true` means the answer depended on club
 *     membership, so a GET keeps it out of shared caches.
 *
 * Pass the caller's own cookie client. `posts_select_authenticated` already
 * answers "published, or yours", so someone else's draft reads as missing;
 * the service client would skip that and let people act on other people's
 * drafts.
 *
 * The author is never locked out of their own words, even after leaving the
 * club: no club check for them, the same as GET /api/posts/[id] and the like
 * route. A personal post costs this one primary-key read and nothing more; a
 * club post adds orgContentAccess (one read, two more when it's hidden).
 */
export async function postAccessForCaller(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
  logTag: string,
): Promise<PostAccess> {
  if (!isUuid(postId)) return { ok: false, reason: "not_found" };

  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, org_id")
    .eq("id", postId)
    .maybeSingle();
  if (error) {
    console.error(logTag, error);
    return { ok: false, reason: "error" };
  }
  if (!data) return { ok: false, reason: "not_found" };

  const post = data as { user_id?: unknown; org_id?: unknown };
  if (post.user_id === userId) return { ok: true, hidden: false };
  if (typeof post.org_id !== "string" || !post.org_id) return { ok: true, hidden: false };

  const access = await orgContentAccessAsService(post.org_id, logTag);
  return access.allowed
    ? { ok: true, hidden: access.hidden }
    : { ok: false, reason: "not_found" };
}
