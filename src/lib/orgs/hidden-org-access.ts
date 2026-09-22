import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who may see a HIDDEN club's things: its logo and banner, its posts' media,
 * and a like on one of its posts. Moved here from
 * `src/app/api/orgs/[slug]/asset/[kind]/route.ts` (T2 D3) so every route that
 * reads a club with the service role asks the same question the same way.
 *
 * Routes that read with the service role skip RLS, so `orgs_select` never
 * hides a hidden club from them. Each one has to ask here instead.
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
