import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { loadOrgRole } from "@/lib/orgs/following";
import { muteOrgPosts, unmuteOrgPosts } from "@/lib/orgs/org-mutes";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type OrgRow = { id: string; hidden_at: string | null };

/** Mute and unmute count against the `prefs` budget, like muting a person. */
const PREFS_TOO_FAST = "Too many changes at once. Try again in a few minutes.";

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * The club by handle, on the SERVICE client: `orgs_select` hides SAE from
 * every non-member, and muting is for exactly the students who aren't in it.
 */
async function loadOrg(
  service: ReturnType<typeof createSupabaseServiceClient>,
  slug: string,
  tag: string,
): Promise<{ ok: true; org: OrgRow | null } | { ok: false }> {
  const { data, error } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (error) {
    console.error(`[orgs/[slug]/mute ${tag} load org]`, error);
    return { ok: false };
  }
  return { ok: true, org: (data as OrgRow | null) ?? null };
}

/**
 * POST /api/orgs/[slug]/mute — mute a club's posts (club model gap 2).
 *
 * The club's posts leave this student's feed, and nothing else changes: a
 * member stays in every chat and keeps following, a follower keeps
 * following, and nobody who runs the club is told. Anyone signed in may mute
 * a club they can see, member or not: a club's posts reach everyone on its
 * campus whether they follow it or not.
 *
 * ORDER: auth → `prefs` budget → SERVICE-ROLE org load → hidden gate → write.
 * No Terms gate: muting stops something, like unfollowing
 * (`follow/route.ts`). A hidden club is 404 to everyone but its own members,
 * the same answer an unknown handle gets (`follow/route.ts`).
 *
 * RESPONSES
 *   200 {ok, muted:true, already}
 *   401 unauthorized · 404 not_found · 429 · 500 load_failed | mute_failed
 */
export async function POST(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await limitFor("prefs", user.id);
  if (!rl.allowed) return tooManyRequests(rl, PREFS_TOO_FAST);

  const service = createSupabaseServiceClient();
  const loaded = await loadOrg(service, slug, "POST");
  if (!loaded.ok) return fail(500, "load_failed", "Failed to load org");
  const org = loaded.org;
  if (!org) return fail(404, "not_found", "Not found");

  if (org.hidden_at) {
    const roleRes = await loadOrgRole(service, org.id, user.id);
    if (!roleRes.ok) return fail(500, "load_failed", "Failed to load org");
    if (!roleRes.role) return fail(404, "not_found", "Not found");
  }

  const muted = await muteOrgPosts(service, org.id, user.id);
  if (!muted.ok) {
    console.error("[orgs/[slug]/mute POST]", muted.error);
    return fail(500, "mute_failed", "Couldn't mute. Try again.");
  }
  return NextResponse.json({ ok: true, muted: true, already: muted.already });
}

/**
 * DELETE /api/orgs/[slug]/mute — unmute a club's posts.
 *
 * Idempotent: a visible club with no mute row is still 200. A HIDDEN club
 * answers 404 unless a row really went or the viewer is a member, like
 * unfollowing one: a mute made before the club was hidden can still be
 * undone, and nobody else learns the handle exists. No Terms gate. Same
 * budget as POST, on purpose.
 *
 * RESPONSES
 *   200 {ok, muted:false}
 *   401 unauthorized · 404 not_found · 429 · 500 load_failed | unmute_failed
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await limitFor("prefs", user.id);
  if (!rl.allowed) return tooManyRequests(rl, PREFS_TOO_FAST);

  const service = createSupabaseServiceClient();
  const loaded = await loadOrg(service, slug, "DELETE");
  if (!loaded.ok) return fail(500, "load_failed", "Failed to load org");
  const org = loaded.org;
  if (!org) return fail(404, "not_found", "Not found");

  const unmuted = await unmuteOrgPosts(service, org.id, user.id);
  if (!unmuted.ok) {
    console.error("[orgs/[slug]/mute DELETE]", unmuted.error);
    return fail(500, "unmute_failed", "Couldn't unmute. Try again.");
  }
  if (org.hidden_at && unmuted.removed === 0) {
    // Its own members may see a hidden club, so a second unmute is still 200.
    const roleRes = await loadOrgRole(service, org.id, user.id);
    if (!roleRes.ok) return fail(500, "load_failed", "Failed to load org");
    if (!roleRes.role) return fail(404, "not_found", "Not found");
  }
  return NextResponse.json({ ok: true, muted: false });
}
