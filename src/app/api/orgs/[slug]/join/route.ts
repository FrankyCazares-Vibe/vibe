import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { loadOrgRole, type OrgFollowState } from "@/lib/orgs/following";
import { LEAVE_DROPS_FOLLOW_SOURCES, ORG_COPY } from "@/lib/orgs/join-copy";
import {
  checkConstraintName,
  isUniqueViolation,
  orgJoinState,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { admitMember, expireStaleInvites, loadViewerOrgContext } from "@/lib/orgs/membership";
import { loadOrgBlocks } from "@/lib/orgs/org-blocks";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type Body = { message?: unknown };

type LeaveBody = { keep_following?: unknown };

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * The source a request's follow carries (club model, critique #8). Not
 * `join`: the Invite-followers list and the usage stats leave `join` follows
 * out, and a student whose request was turned down is still a follower.
 * Leaving drops it like a `join` follow (`org_members_unfollow_on_leave`,
 * migration 20261017100000).
 */
const REQUEST_FOLLOW_SOURCE = "request";

/**
 * The follows a leave drops on its own: the trigger's list since M1, and the
 * one the leave confirms start "Keep following" from (join-copy.ts).
 */
const LEAVE_DROPS_SOURCES: readonly string[] = LEAVE_DROPS_FOLLOW_SOURCES;

/**
 * `org-join:<uid>`, shared by joining (POST) and leaving (DELETE). One
 * constant, so the two can never disagree: the limiter's deny cache keys on
 * the key, the limit and the window together (limits wave 3).
 */
const JOIN_LIMIT = { limit: 30, windowSec: 600 } as const;
/** What a refusal on `org-join:<uid>` says, joining or leaving. */
const JOIN_TOO_FAST = "Too many tries. Try again in a few minutes.";

/** The error shape every org route now speaks (spec §4 conventions). */
function fail(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

/**
 * ASKING TO JOIN FOLLOWS THE CLUB (Franky, Oct 16): a request is "I want in",
 * so the club's posts and its Board start reaching them while they wait.
 * Service client, insert-or-ignore: a follow they already had (tapped,
 * onboarding, an earlier request) keeps its source and its dates. A refusal
 * leaves the follow alone, because dropping it would hint at the answer.
 *
 * Never fails the request: the request row is what they asked for, so a
 * failed follow is logged and reported as `not_following`. A database
 * without the `request` source yet (the migration goes in before the deploy)
 * gets a `join` follow instead, which a leave drops the same way.
 */
async function followOnRequest(
  service: ServiceClient,
  orgId: string,
  userId: string,
): Promise<OrgFollowState> {
  const insert = (source: string) =>
    service.from("org_followers").insert({ org_id: orgId, user_id: userId, source });
  let { error } = await insert(REQUEST_FOLLOW_SOURCE);
  if (error && checkConstraintName(error) === "org_followers_source_check") {
    console.error("[orgs/[slug]/join request follow] the 'request' source is not deployed");
    ({ error } = await insert("join"));
  }
  if (!error || isUniqueViolation(error)) return "following";
  console.error("[orgs/[slug]/join request follow]", error);
  return "not_following";
}

/**
 * The source of the viewer's follow row, or `source: null` when there is
 * none. Read raw on the service client, so a source this build doesn't know
 * yet is never relabelled before the leave decides what to keep.
 */
async function readFollowSource(
  service: ServiceClient,
  orgId: string,
  userId: string,
): Promise<{ ok: true; source: string | null } | { ok: false }> {
  const { data, error } = await service
    .from("org_followers")
    .select("source")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/join read follow]", error);
    return { ok: false };
  }
  const source = (data as { source?: unknown } | null)?.source;
  return { ok: true, source: data ? (typeof source === "string" ? source : "profile") : null };
}

/** Relabel the viewer's follow `from` → `to`. Returns whether it worked. */
async function relabelFollow(
  service: ServiceClient,
  orgId: string,
  userId: string,
  from: string,
  to: string,
): Promise<boolean> {
  const { error } = await service
    .from("org_followers")
    .update({ source: to })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("source", from);
  if (error) console.error("[orgs/[slug]/join relabel follow]", error);
  return !error;
}

/** `{keep_following}` from a leave's body: true, false, or null when absent. */
async function readKeepFollowing(req: Request): Promise<boolean | null> {
  try {
    const parsed: unknown = await req.json();
    const keep = parsed && typeof parsed === "object"
      ? (parsed as LeaveBody).keep_following
      : undefined;
    return typeof keep === "boolean" ? keep : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/orgs/[slug]/join — THE one door into an org (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.2, §3.5 step 3,
 * §4.2; batch B8).
 *
 * Accepting an invite, tapping Join and asking to join all arrive here, so
 * there is exactly one place that decides who gets in and exactly one place
 * that admits them. The decision is {@link orgJoinState} (B22, spec §3.2) and
 * the admission is {@link admitMember} (B22); this route only loads what they
 * need and turns their answer into HTTP.
 *
 * ORDER (spec §4 conventions): auth → rate limit → Terms → SERVICE-ROLE org
 * load → decide → act.
 *
 * WHY THE ORG LOAD MOVED TO THE SERVICE CLIENT (critic A2). It used to run on
 * the viewer's own client, and `orgs_select` hides a private org from
 * non-members — so "Request to join" on every private club answered 404 "Not
 * found" before it ever reached the insert. Nobody could request anything.
 * M1c narrowed that policy further (hidden orgs), so the user client would be
 * wrong twice over. The service role loads the row; this route decides what
 * the viewer is allowed to know about it.
 *
 * ASKING FOLLOWS (Franky, Oct 16). A request needs no follow first, and
 * filing one (or asking again while it waits) follows the club with source
 * `request`; see {@link followOnRequest}. `org_follow_state` says how that
 * went, so a client never has to guess.
 *
 * RESPONSES
 *   200 {ok, joined:true, role, via:"join"|"invite"}   admitted
 *   200 {ok, joined:true, role, already:true}          already a member
 *   200 {ok, pending:true, request, reason?, org_follow_state}
 *                                                      request filed / already filed
 *   403 school_unverified | audience_mismatch (+audience) | invite_only | terms_required
 *   403 join_unavailable   an owner or officer blocked them (S67 sec wave 2
 *                          #15). The copy never names a block.
 *   404 not_found          the handle, or a hidden org to anybody but an admin
 *   409 org_hidden         a platform admin (or an officer) on a hidden org
 *   429                    30 attempts per 10 minutes, per user
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // Plan §2.6: join had neither a limit nor a Terms gate. 30 per 10 minutes
  // is far above a human tapping Join and low enough that a script can't walk
  // the club directory filing requests.
  const rl = await rateLimit(`org-join:${user.id}`, JOIN_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, JOIN_TOO_FAST);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* allow empty body */
  }

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, name, join_policy, audience, hidden_at, campus_id")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/join load org]", orgErr);
    return fail(500, "load_failed", "Failed to load org");
  }
  if (!orgRow) {
    return fail(404, "not_found", "Not found");
  }
  const org = orgRow as {
    id: string;
    handle: string;
    name: string;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  };

  // Expiry is lazy in the database (spec §2.3), and this route is a writer.
  // Flip this viewer's stale invite in this org BEFORE reading it, so a row
  // that sat `pending` past `expires_at` is recorded truthfully — and, more
  // practically, so it stops occupying `org_invites_one_pending` and blocking
  // the next invite an officer sends.
  await expireStaleInvites(service, { orgId: org.id, inviteeId: user.id });

  const ctx = await loadViewerOrgContext(service, org.id, user.id);
  if (!ctx.ok) {
    // The least-privileged fallback is safe to ACT on but wrong to answer
    // with: a real member would be told to verify their school email.
    return fail(500, "load_failed", "Failed to load org");
  }

  const decision = orgJoinState({
    org,
    viewer: ctx.viewer,
    role: ctx.role,
    pendingInvite: ctx.pendingInvite,
    pendingRequest: ctx.pendingRequest,
    // A removed member must ask to come back, even to an open club (#15).
    removed: ctx.removed,
  });

  // BLOCKS KEEP PEOPLE OUT, ONE WAY (S67 sec wave 2 #15, product call 9).
  // Before anything is written — an admission (join, accepted invite) or a
  // new request — ask whether the owner or any officer blocked this student.
  // If so, a neutral 403 that never names the block. The other direction (the
  // student blocked an officer) does not stop them: a victim is never locked
  // out because their harasser is an officer, and their request is hidden
  // from that officer instead. `member` and `requested` write nothing, so
  // they skip the read. Fails closed: a failed read is a 500, never "in".
  // (`requested` now writes a follow, which needs no block check: following
  // never had one, and a block keeps them off the Board in the database.)
  if (
    decision.state === "invited" ||
    decision.state === "can_join" ||
    decision.state === "can_request"
  ) {
    const blocks = await loadOrgBlocks(service, org.id, user.id);
    if (!blocks.ok) {
      console.error("[orgs/[slug]/join blocks]", blocks.error);
      return fail(500, "load_failed", "Failed to load org");
    }
    if (blocks.blockedByOfficer) {
      return fail(403, "join_unavailable", ORG_COPY.errors.joinUnavailable);
    }
  }

  switch (decision.state) {
    // Idempotent: a second tap, or a second device, gets the same answer.
    case "member":
      return NextResponse.json({
        ok: true,
        joined: true,
        role: ctx.role,
        already: true,
      });

    case "not_found":
      return fail(404, "not_found", "Not found");

    // Only a platform admin reaches this state (everyone else got not_found),
    // and even an officer of a hidden org may not add anyone to it (§3.4).
    case "hidden":
      return fail(409, "org_hidden", "This org is hidden, so nobody new can join it.");

    case "unverified":
      return fail(
        403,
        "school_unverified",
        "Verify your school email to join.",
      );

    case "audience_blocked":
      return fail(
        403,
        "audience_mismatch",
        decision.audience === "purdue"
          ? `${org.name} is open to Purdue students only.`
          : `${org.name} is open to IU students only.`,
        { audience: decision.audience },
      );

    // Invite-only with no invite NEVER files a request: that is the whole
    // point of the policy (spec §3.2 row 8).
    case "invite_only":
      return fail(403, "invite_only", "This org is invite only. Officers invite members.");

    // Asking again follows too, so a request filed before asking followed
    // (or one whose follow was dropped since) catches up.
    case "requested":
      return NextResponse.json({
        ok: true,
        pending: true,
        request: ctx.pendingRequest,
        org_follow_state: await followOnRequest(service, org.id, user.id),
      });

    case "invited":
    case "can_join": {
      const via = decision.state === "invited" ? "invite" : "join";
      const admitted = await admitMember(service, {
        orgId: org.id,
        userId: user.id,
        actorId: user.id,
        via,
      });
      if (!admitted.ok) {
        return fail(500, "join_failed", "Failed to join");
      }
      return NextResponse.json({
        ok: true,
        joined: true,
        role: "member",
        via,
        ...(admitted.already ? { already: true } : {}),
      });
    }

    // `request` policy, or `open` while visiting another campus (plan §2.6).
    case "can_request": {
      const message =
        typeof body.message === "string" ? body.message.trim().slice(0, 500) : null;
      const { data: created, error: reqErr } = await service
        .from("org_join_requests")
        .insert({ org_id: org.id, user_id: user.id, message })
        .select("id, status, requested_at")
        .single();
      if (reqErr || !created) {
        // Two taps at once race `org_join_requests_unique_pending`. That is a
        // duplicate, not a failure (critic B2): read the winner back.
        if (isUniqueViolation(reqErr)) {
          const { data: existing } = await service
            .from("org_join_requests")
            .select("id, status, requested_at")
            .eq("org_id", org.id)
            .eq("user_id", user.id)
            .eq("status", "pending")
            .maybeSingle();
          if (existing) {
            return NextResponse.json({
              ok: true,
              pending: true,
              request: existing,
              org_follow_state: await followOnRequest(service, org.id, user.id),
            });
          }
        }
        console.error("[orgs/[slug]/join request insert]", reqErr);
        return fail(500, "request_failed", "Failed to request join");
      }
      return NextResponse.json({
        ok: true,
        pending: true,
        request: created,
        reason: decision.reason,
        org_follow_state: await followOnRequest(service, org.id, user.id),
      });
    }
  }
}

/**
 * DELETE /api/orgs/[slug]/join — self-leave. Owners can't leave (they have to
 * transfer ownership first), which is blocked here for a friendly error.
 *
 * The org load runs on the service client like every other org route now
 * (spec §4.2): leaving a private or hidden org must not 404 on the lookup.
 * The DELETE itself stays on the viewer's own client — `org_members_delete`
 * is the boundary for removing your own row, and M1c left it alone.
 *
 * Leaving also drops the club's chat rows (channel_members and
 * org_channel_members), in the database: the SECURITY DEFINER AFTER DELETE
 * trigger `org_members_drop_club_access` (20260928100000). A voluntary leave
 * keeps RSVPs; only a removal (members/[userId] DELETE) drops those.
 *
 * Leaving counts against the same `org-join:<uid>` budget as joining
 * (limits wave 3), before the first read: joining and leaving in a loop
 * spend one budget, not two.
 *
 * KEEP FOLLOWING? (club model gap 1, Oct 16). Any client may send
 * `{keep_following: true|false}`; the leave confirms ask "Keep following
 * <club>" (`ORG_COPY.menu.keepFollowing`). No body keeps today's rule: the
 * trigger drops a follow that joining or a request made, and a follow they
 * tapped themselves stays.
 *   - true: BEFORE the membership goes, a `join` or `request` follow becomes
 *     `profile`, so the leave trigger leaves it alone. No gap and no
 *     re-insert (critique #9). If the leave then fails, the label goes back.
 *     A member with no follow row at all gets a fresh `profile` follow,
 *     except on a hidden club, which nobody new may follow.
 *   - false: after the membership goes, any follow left is deleted too.
 * Only a member's follow is ever touched here: a non-member's DELETE changes
 * nothing, so this route can't be used as a second Unfollow.
 *
 * RESPONSES
 *   200 {ok, left:true, org_follow_state?}  `org_follow_state` is read back
 *       after the change; it is missing only if that read failed
 *   200 {ok, left:false}                    they weren't a member
 *   400 owner_cannot_leave · 401 · 404 not_found (also a hidden club to a
 *   non-member) · 429 · 500 load_failed | leave_failed
 */
export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const rl = await rateLimit(`org-join:${user.id}`, JOIN_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, JOIN_TOO_FAST);

  const keep = await readKeepFollowing(req);

  const service = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, owner_id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/join DELETE load org]", orgErr);
    return fail(500, "load_failed", "Failed to leave");
  }
  if (!org) {
    return fail(404, "not_found", "Not found");
  }
  if (org.owner_id === user.id) {
    return fail(
      400,
      "owner_cannot_leave",
      "Owners must transfer ownership before leaving",
    );
  }

  const roleRes = await loadOrgRole(service, org.id, user.id);
  if (!roleRes.ok) return fail(500, "load_failed", "Failed to leave");
  if (!roleRes.role) {
    // A hidden club confirms nothing to a non-member (`follow/route.ts`).
    if (org.hidden_at) return fail(404, "not_found", "Not found");
    return NextResponse.json({ ok: true, left: false });
  }

  let hadFollow = false;
  let relabeledFrom: string | null = null;
  if (keep === true) {
    const prior = await readFollowSource(service, org.id, user.id);
    if (!prior.ok) return fail(500, "leave_failed", "Failed to leave");
    hadFollow = prior.source !== null;
    if (prior.source && LEAVE_DROPS_SOURCES.includes(prior.source)) {
      if (!(await relabelFollow(service, org.id, user.id, prior.source, "profile"))) {
        return fail(500, "leave_failed", "Failed to leave");
      }
      relabeledFrom = prior.source;
    }
  }

  const { error, count } = await supabase
    .from("org_members")
    .delete({ count: "exact" })
    .eq("org_id", org.id)
    .eq("user_id", user.id);
  if (error || !count) {
    // Still a member (or the row went some other way): undo the relabel so
    // a later leave drops that follow as it would have.
    if (relabeledFrom) await relabelFollow(service, org.id, user.id, "profile", relabeledFrom);
    if (error) {
      console.error("[orgs/[slug]/join DELETE]", error);
      return fail(500, "leave_failed", "Failed to leave");
    }
    return NextResponse.json({ ok: true, left: false });
  }

  // The membership is gone, so from here a failed follow change is logged and
  // shows in `org_follow_state`, never as a failed leave.
  if (keep === true && !hadFollow && !org.hidden_at) {
    const { error: followErr } = await service
      .from("org_followers")
      .insert({ org_id: org.id, user_id: user.id, source: "profile" });
    if (followErr && !isUniqueViolation(followErr)) {
      console.error("[orgs/[slug]/join DELETE keep follow]", followErr);
    }
  } else if (keep === false) {
    const { error: unfollowErr } = await service
      .from("org_followers")
      .delete()
      .eq("org_id", org.id)
      .eq("user_id", user.id);
    if (unfollowErr) console.error("[orgs/[slug]/join DELETE unfollow]", unfollowErr);
  }

  const after = await readFollowSource(service, org.id, user.id);
  return NextResponse.json({
    ok: true,
    left: true,
    ...(after.ok ? { org_follow_state: after.source ? "following" : "not_following" } : {}),
  });
}
