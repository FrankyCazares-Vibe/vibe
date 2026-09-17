import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  loadFollowerCount,
  loadOrgRole,
  normalizeFollowSource,
  publicFollowerCount,
} from "@/lib/orgs/following";
import { isUniqueViolation } from "@/lib/orgs/join-state";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type Body = { source?: unknown };

type OrgRow = { id: string; hidden_at: string | null };

/**
 * One budget for follow AND unfollow (critic C15): 60 taps per 10 minutes is
 * far above a person, and sharing the key means a script can't double its
 * budget by alternating the two.
 */
const FOLLOW_LIMIT = { limit: 60, windowSec: 600 };

const TOO_MANY = "Too many tries. Try again in a minute.";

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * POST /api/orgs/[slug]/follow {source?} — follow a club (wave plan §4.2,
 * batch F1). Anyone can follow any club they can see: there is deliberately
 * NO audience, school-verification, campus or block check (Franky,
 * 2026-09-16). Following isn't membership and unlocks no chat.
 *
 * ORDER: auth → rate limit → Terms → SERVICE-ROLE org load → hidden gate →
 * insert. The org is loaded with the service client because `orgs_select`
 * hides SAE (private, invite-only) from every non-member, so a user-client
 * lookup would answer 404 to exactly the students following is for.
 *
 * THE INSERT is `{org_id, user_id, source}` and nothing else. `created_at`
 * and `first_followed_at` belong to the database (the stamp trigger keeps the
 * first-follow date across unfollow/refollow; a client-supplied timestamp
 * could backdate it for good). A second follow hits the unique key and comes
 * back `already:true` WITHOUT touching the row, so a `join` follow is never
 * relabelled as one the student tapped (open question Q3).
 *
 * No notification is sent: there is no "X followed your club" in v1.
 *
 * RESPONSES
 *   200 {ok, org_follow_state:"following", already, follower_count}
 *   401 unauthorized · 403 terms_required · 404 not_found · 429 ·
 *   500 load_failed | follow_failed
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`org-follow:${user.id}`, FOLLOW_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, TOO_MANY);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as Body;
  } catch {
    /* allow an empty body */
  }
  const source = normalizeFollowSource(body.source);

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/follow POST load org]", orgErr);
    return fail(500, "load_failed", "Failed to load org");
  }
  if (!orgRow) return fail(404, "not_found", "Not found");
  const org = orgRow as OrgRow;

  // A hidden club is 404 to everyone but its own members, platform admins
  // included: the same answer an unknown handle gets, so it confirms nothing.
  if (org.hidden_at) {
    const roleRes = await loadOrgRole(service, org.id, user.id);
    if (!roleRes.ok) return fail(500, "load_failed", "Failed to load org");
    if (!roleRes.role) return fail(404, "not_found", "Not found");
  }

  let already = false;
  const { error: insertErr } = await service
    .from("org_followers")
    .insert({ org_id: org.id, user_id: user.id, source });
  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      already = true;
    } else {
      console.error("[orgs/[slug]/follow POST insert]", insertErr);
      return fail(500, "follow_failed", "Couldn't follow. Try again.");
    }
  }

  const follower_count = publicFollowerCount(await loadFollowerCount(service, org.id), null);
  return NextResponse.json({
    ok: true,
    org_follow_state: "following",
    already,
    follower_count,
  });
}

/**
 * DELETE /api/orgs/[slug]/follow — unfollow a club.
 *
 * MEMBERS CAN'T UNFOLLOW (409 `member_follows`). Membership implies following
 * (the `org_members_imply_follow` trigger), so a member's only way out of the
 * club's posts is to leave, and leaving drops a follow that joining made.
 *
 * No Terms gate: stopping something must never need a consent screen. The
 * rate-limit key is POST's, on purpose.
 *
 * A visible club with no follow row is still 200 (unfollowing twice is fine).
 * A HIDDEN club answers 404 unless a row was really removed: a follow made
 * before the club was hidden can still be dropped, and nobody else learns the
 * handle exists. `org_follow_firsts` is never touched, so a refollow keeps
 * the first-follow date.
 *
 * RESPONSES
 *   200 {ok, org_follow_state:"not_following", follower_count}
 *   401 unauthorized · 404 not_found · 409 member_follows · 429 ·
 *   500 load_failed | unfollow_failed
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`org-follow:${user.id}`, FOLLOW_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, TOO_MANY);

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/follow DELETE load org]", orgErr);
    return fail(500, "load_failed", "Failed to load org");
  }
  if (!orgRow) return fail(404, "not_found", "Not found");
  const org = orgRow as OrgRow;

  const roleRes = await loadOrgRole(service, org.id, user.id);
  if (!roleRes.ok) return fail(500, "load_failed", "Failed to load org");
  if (roleRes.role) {
    return fail(
      409,
      "member_follows",
      "Members follow their clubs automatically. Leave the club to stop following.",
    );
  }

  const { error: deleteErr, count } = await service
    .from("org_followers")
    .delete({ count: "exact" })
    .eq("org_id", org.id)
    .eq("user_id", user.id);
  if (deleteErr) {
    console.error("[orgs/[slug]/follow DELETE]", deleteErr);
    return fail(500, "unfollow_failed", "Couldn't unfollow. Try again.");
  }
  if (org.hidden_at && !count) return fail(404, "not_found", "Not found");

  const follower_count = publicFollowerCount(await loadFollowerCount(service, org.id), null);
  return NextResponse.json({
    ok: true,
    org_follow_state: "not_following",
    follower_count,
  });
}
