import { NextResponse } from "next/server";

import { checkRemovedPicture } from "@/app/api/admin/images/_lib/removed-picture-store";
import { isEventCoverKey } from "@/lib/events/event-cover-url";
import { eventVisibilityOf } from "@/lib/events/validate";
import { viewerMaySeeHiddenOrg } from "@/lib/orgs/hidden-org-access";
import { isUuid } from "@/lib/pgrest";
import { isR2Configured, signOrgAssetGetUrl } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/events/[id]/cover[?v=<file>] -> 307 to a freshly signed link to
 * the event's cover photo (Oct 23, 2026; club view wave 3, event covers,
 * batch B1: handoffs/2026-10-23-club-view-wave-3/COVERS-PLAN.md). The
 * address `eventCoverProxyUrl` (src/lib/events/event-cover-url.ts) builds;
 * `?v=` is the stored key's file name, there so a new cover is a new URL,
 * and is ignored here.
 *
 * WHO SEES IT: exactly who can see the event. The event is read with the
 * VIEWER's own client, so the database's rule (event_visible, behind
 * events_select_visible) decides: signed in only, a "Members only" event to
 * its club's members (and platform admins), a hidden club's events to its
 * members, and so on. An event the viewer can't see, one with no cover, a
 * bad id and a signed-out caller all get the same 404, so the answer never
 * says an event exists. Signed in only, so no signed-out read limit is
 * needed (COVERS-PLAN.md).
 * A HIDDEN club's cover goes to its members and platform admins only
 * (viewerMaySeeHiddenOrg, the rule its logo, banner and post media follow),
 * asked only when the club is hidden. event_visible alone would also let in
 * a non-member who RSVP'd before moderators hid the club (Oct 23, 2026
 * review), and a hidden club's pictures are exactly what moderators froze.
 *
 * WHICH KEYS GET SIGNED: only a cover of the event's own club
 * (`isEventCoverKey`: `orgs/<org_id>/events/<uuid>.<jpg|png|webp>`); the
 * database's events_check_cover_key already refuses anything else
 * (20261028100000), this is the second wall. A cover moderators took down
 * (an image_remove row of the club names it, checkRemovedPicture) is the
 * same 404: the takedown clears the column, and this keeps a key written
 * back by a race from serving again. A failed moderation read fails closed
 * (500, nothing signed).
 *
 * CACHE: an Everyone event of a visible club is the same answer for
 * everyone who may see it, so the browser keeps the redirect for five
 * minutes (`private`: never a shared cache), well inside the signed link's
 * hour, the club banner's rule (/api/orgs/[slug]/asset/[kind]). A Members
 * only event, or any event of a hidden club, answers depending on who asks:
 * `private, no-store`, so a member who leaves stops seeing it at once.
 *
 * Errors (JSON, no-store): 404 not_found · 500 request_failed · 503
 * storage_unavailable.
 */
function fail(status: number, code: string, error: string) {
  return NextResponse.json(
    { ok: false, error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const notFound = () => fail(404, "not_found", "Not found");
const failed = () => fail(500, "request_failed", "Request failed");

type CoverRow = { id: string; org_id: string | null; visibility?: string | null; cover_key?: string | null };

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !isUuid(id)) return notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  // The viewer's own client: RLS (event_visible) is the boundary.
  const { data, error } = await supabase
    .from("events")
    .select("id,org_id,visibility,cover_key")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // The code only: the message can carry ids.
    console.error("[events/:id/cover read]", { code: error.code });
    return failed();
  }
  const row = data as CoverRow | null;
  if (!row || !row.org_id) return notFound();
  const orgId = row.org_id;
  const key = row.cover_key;
  if (!isEventCoverKey(key, orgId)) return notFound();

  if (!isR2Configured()) return fail(503, "storage_unavailable", "Storage not configured");

  // Service role: moderation_actions has no client policy, and `orgs_select`
  // may hide the club's row from this viewer (whether it is hidden decides
  // the hidden-club check below and the cache header).
  const service = createSupabaseServiceClient();
  const [removed, orgRes] = await Promise.all([
    checkRemovedPicture(service, "org", orgId, [key]),
    service.from("orgs").select("hidden_at").eq("id", orgId).maybeSingle(),
  ]);
  if (removed === "error") return failed();
  if (removed === "removed") return notFound();
  if (orgRes.error) {
    console.error("[events/:id/cover org]", { code: orgRes.error.code });
    return failed();
  }
  const hidden = !!(orgRes.data as { hidden_at?: string | null } | null)?.hidden_at;
  // A hidden club: its members and platform admins only (see the header).
  // Fails closed, the same 404 as an event the viewer can't see.
  if (hidden && !(await viewerMaySeeHiddenOrg(service, orgId))) return notFound();
  const sameForEveryone = !hidden && eventVisibilityOf(row.visibility) === "everyone";

  try {
    const signed = await signOrgAssetGetUrl(key, 60 * 60); // 1h
    const res = NextResponse.redirect(signed, 307);
    res.headers.set("Cache-Control", sameForEveryone ? "private, max-age=300" : "private, no-store");
    return res;
  } catch (err) {
    console.error("[events/:id/cover sign]", err instanceof Error ? err.message : "unknown");
    return failed();
  }
}
