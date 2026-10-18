import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { limitFor } from "@/lib/limits/budgets";
import { loadOrgRole } from "@/lib/orgs/following";
import { muteOrgPosts, unmuteOrgPosts } from "@/lib/orgs/org-mutes";
import { isUuid } from "@/lib/pgrest";
import { parseProfileRank } from "@/lib/profile/club-flair";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ orgId: string }> };

/** The `prefs` budget's line, the same as `/api/me/mute`. */
const PREFS_TOO_FAST = "Too many changes at once. Try again in a few minutes.";

type MembershipPatch = {
  show_on_profile?: boolean;
  show_title?: boolean;
  profile_rank?: number | null;
};

type Change = { membership: MembershipPatch; muted?: boolean };

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/** The body, checked. Unknown keys are ignored; a known key with a bad value is a 400. */
function parseChange(body: Record<string, unknown>): Change | string {
  const membership: MembershipPatch = {};
  const change: Change = { membership };
  if ("show_on_profile" in body) {
    if (typeof body.show_on_profile !== "boolean") return "show_on_profile must be true or false";
    membership.show_on_profile = body.show_on_profile;
  }
  if ("profile_rank" in body) {
    const rank = parseProfileRank(body.profile_rank);
    if (!rank.ok) return "profile_rank must be a whole number from 0 to 50, or null";
    membership.profile_rank = rank.rank;
  }
  if ("show_title" in body) {
    if (typeof body.show_title !== "boolean") return "show_title must be true or false";
    membership.show_title = body.show_title;
  }
  // The title itself is the officers' (PATCH members/[userId]); the member
  // decides only whether it shows (review item 32).
  if ("title" in body) return "Only the club's officers can give a title. You can hide yours.";
  if ("muted" in body) {
    if (typeof body.muted !== "boolean") return "muted must be true or false";
    change.muted = body.muted;
  }
  if (Object.keys(membership).length === 0 && change.muted === undefined) {
    return "Nothing to change";
  }
  return change;
}

/**
 * PATCH /api/me/clubs/[orgId] {show_on_profile?, show_title?, profile_rank?,
 * muted?} — my own settings for one club (club model spec D and E2;
 * Franky's calls, Oct 16).
 *
 *   - `show_on_profile`, `show_title`, `profile_rank`: members only. They
 *     change MY membership row and nobody else's (`user_id` = me in the
 *     write). A club and its title show by default; hiding either takes it
 *     off my public profile on the next load (search engines may keep an
 *     older copy).
 *   - `muted`: anyone signed in who can see the club, member or not. Its
 *     posts leave my feed; a member stays in every chat. Nobody who runs the
 *     club is told. It is a row in `org_post_mutes`, not a column on
 *     `org_followers`, because officers can read follower rows.
 *
 * Writes go through the SERVICE client: there is no write grant on
 * `org_members` or `org_post_mutes` for signed-in accounts. Changing these
 * columns fires no membership trigger (the room trigger fires on insert or a
 * role change only).
 *
 * The Terms gate runs only for `show_on_profile: true` or `show_title: true`,
 * which publish something. Hiding, ordering, muting and unmuting don't, and
 * stopping something never needs a consent screen (`follow/route.ts`).
 *
 * A club Vibe hid is 404 to anyone outside it, the same answer an id that was
 * never a club gets, except that an old mute of it can still be taken back.
 *
 * RESPONSES
 *   200 {ok, org_id, show_on_profile?, show_title?, profile_rank?, muted?}
 *   400 invalid · 401 unauthorized · 403 terms_required · 404 not_found |
 *   not_member · 429 · 500 request_failed
 */
export async function PATCH(req: Request, { params }: Params) {
  const { orgId } = await params;
  if (!isUuid(orgId)) return fail(404, "not_found", "Not found");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await limitFor("prefs", user.id);
  if (!rl.allowed) return tooManyRequests(rl, PREFS_TOO_FAST);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid", "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "invalid", "Invalid body");
  }
  const change = parseChange(body as Record<string, unknown>);
  if (typeof change === "string") return fail(400, "invalid", change);

  if (change.membership.show_on_profile === true || change.membership.show_title === true) {
    const termsGate = await requireTermsAccepted(user.id);
    if (termsGate) return termsGate;
  }

  const service = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) {
    console.error("[me/clubs/[orgId] load org]", orgErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (!org) return fail(404, "not_found", "Not found");

  const roleRes = await loadOrgRole(service, orgId, user.id);
  if (!roleRes.ok) return fail(500, "request_failed", "Request failed");
  const touchesMembership = Object.keys(change.membership).length > 0;
  // A hidden club is 404 to anyone outside it. One exception, the same as
  // unfollowing and `/api/orgs/[slug]/mute`: a mute made before the club was
  // hidden can still be taken back, and only a row really removed says so.
  const outsideHidden = !!org.hidden_at && !roleRes.role;
  if (outsideHidden && (touchesMembership || change.muted !== false)) {
    return fail(404, "not_found", "Not found");
  }
  if (touchesMembership && !roleRes.role) {
    return fail(404, "not_member", "You're not in this club.");
  }

  const out: Record<string, unknown> = { ok: true, org_id: orgId };

  if (touchesMembership) {
    const { data: rows, error } = await service
      .from("org_members")
      .update(change.membership)
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .select("show_on_profile, show_title, profile_rank");
    if (error) {
      console.error("[me/clubs/[orgId] membership]", error);
      return fail(500, "request_failed", "Request failed");
    }
    const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
    // They left in the same instant.
    if (!row) return fail(404, "not_member", "You're not in this club.");
    out.show_on_profile = row.show_on_profile !== false;
    out.show_title = row.show_title !== false;
    out.profile_rank = typeof row.profile_rank === "number" ? row.profile_rank : null;
  }

  // One tested mute writer for the two routes (`org-mutes.ts`; repair of
  // review finding 15): idempotent both ways.
  if (change.muted === true) {
    const muted = await muteOrgPosts(service, orgId, user.id);
    if (!muted.ok) {
      console.error("[me/clubs/[orgId] mute]", muted.error);
      return fail(500, "request_failed", "Request failed");
    }
    out.muted = true;
  } else if (change.muted === false) {
    const unmuted = await unmuteOrgPosts(service, orgId, user.id);
    if (!unmuted.ok) {
      console.error("[me/clubs/[orgId] unmute]", unmuted.error);
      return fail(500, "request_failed", "Request failed");
    }
    if (outsideHidden && unmuted.removed === 0) return fail(404, "not_found", "Not found");
    out.muted = false;
  }

  return NextResponse.json(out);
}
